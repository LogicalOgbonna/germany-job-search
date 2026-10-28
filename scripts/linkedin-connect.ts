import "dotenv/config";
import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import {
  authorizationUrl,
  exchangeCode,
  linkedinTokenPath,
  writeLinkedinToken,
  type LinkedinToken,
} from "../src/lib/linkedin/auth";
import {
  callbackAddress,
  listenOnCallback,
  type LinkedinApp,
} from "../src/lib/linkedin/callback";
import { checkDataAccess, keptAfterDataCheck } from "../src/lib/linkedin/data";

// npm run linkedin:connect            JobDesk app (posting, sign-in)
// npm run linkedin:connect -- --data  JobDesk Data app (read-only data portability)
const app: LinkedinApp = process.argv.includes("--data") ? "data" : "share";
const label = app === "share" ? "JobDesk" : "JobDesk Data";
const prefix = app === "share" ? "LINKEDIN" : "LINKEDIN_DATA";
const clientId = process.env[`${prefix}_CLIENT_ID`];
const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
if (!clientId || !clientSecret) {
  console.error(
    `Set ${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET in .env (the ${label} app's Auth tab), then try again.`,
  );
  process.exit(1);
}

// One read-only call that proves the token works for what this app is for.
async function check(token: LinkedinToken): Promise<LinkedinToken> {
  const headers = { Authorization: `Bearer ${token.accessToken}` };
  if (app === "share") {
    const response = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers,
      signal: AbortSignal.timeout(30000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body?.sub !== "string")
      throw new Error(
        `Signed in, but LinkedIn did not return your profile (${response.status}).`,
      );
    return { ...token, sub: body.sub, name: body.name, email: body.email };
  }
  return token;
}

const address = callbackAddress(app);
const state = randomBytes(16).toString("base64url");
const server = createServer();
let answered = false;

function finish(code: number, line: string) {
  clearTimeout(timer);
  server.close();
  server.closeAllConnections();
  (code ? console.error : console.log)(line);
  process.exitCode = code;
}
const timer = setTimeout(
  () =>
    finish(
      1,
      "No answer from LinkedIn within 5 minutes. Run the command again.",
    ),
  300000,
);
const reply = (response: ServerResponse, status: number, text: string) =>
  new Promise<void>((done) =>
    response
      .writeHead(status, {
        "Content-Type": "text/plain; charset=utf-8",
        Connection: "close",
      })
      .end(text, done),
  );

server.on("request", async (request, response) => {
  const url = new URL(request.url ?? "/", address.uri);
  const params = url.searchParams;
  // Browsers also ask for a favicon; only LinkedIn's redirect counts as the one answer.
  if (
    answered ||
    url.pathname !== address.path ||
    !(params.has("code") || params.has("error"))
  ) {
    response.writeHead(404, { Connection: "close" }).end();
    return;
  }
  answered = true;
  // LinkedIn has answered; the data check's retries may take a few minutes of their own.
  clearTimeout(timer);
  // Set once the data token is on disk, so a data check that LinkedIn refuses takes it back.
  let unchecked: string | null = null;
  try {
    if (params.get("state") !== state)
      throw new Error("The answer did not belong to this sign-in.");
    const code = params.get("code");
    if (!code)
      throw new Error(
        `${params.get("error")}: ${params.get("error_description") ?? "sign-in was not completed"}`,
      );
    const token = await check(
      await exchangeCode({
        code,
        redirectUri: address.uri,
        clientId,
        clientSecret,
      }),
    );
    // Saved before the data check. A check that LinkedIn refuses (401/403) removes it again
    // below, so the worker never syncs with a token that was reported as not connected. A
    // timeout, 5xx or network failure keeps it: the hourly check tries again.
    await writeLinkedinToken(linkedinTokenPath(app), token);
    let status = "";
    if (app === "data") {
      unchecked = linkedinTokenPath(app);
      try {
        status = await checkDataAccess(token.accessToken);
      } catch (error) {
        const kept = keptAfterDataCheck(error);
        if (kept === null) throw error;
        status = kept;
      }
    }
    unchecked = null;
    await reply(
      response,
      200,
      `Jobdesk is connected to LinkedIn (${label}). You can close this tab.`,
    );
    finish(
      0,
      [
        `Connected ${label}${token.name ? ` as ${token.name}` : ""}.`,
        `Scopes: ${token.scopes.join(", ") || "none reported"}`,
        `Token expires ${token.expiresAt.slice(0, 10)}; run this command again before then.`,
        status,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  } catch (error) {
    if (unchecked) await rm(unchecked, { force: true });
    await reply(
      response,
      400,
      "LinkedIn was not connected. The terminal shows the reason.",
    );
    finish(
      1,
      `LinkedIn (${label}) was not connected: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
});

listenOnCallback(server, address).then(
  () => {
    const url = authorizationUrl({
      app,
      clientId,
      redirectUri: address.uri,
      state,
    });
    console.log(
      `Waiting on ${address.uri}\nOpening LinkedIn sign-in. If no browser opens, visit this address:\n${url}`,
    );
    execFile("open", [url], () => {});
  },
  (error) => finish(1, error.message),
);
