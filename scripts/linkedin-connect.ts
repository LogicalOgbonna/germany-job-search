import "dotenv/config";
import { execFile } from "node:child_process";
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

// Data portability is versioned and accepts only this version.
const dmaHeaders = (token: LinkedinToken) => ({
  Authorization: `Bearer ${token.accessToken}`,
  "LinkedIn-Version": "202312",
  "Content-Type": "application/json",
});

// The changelog archive normally starts by itself after consent; LinkedIn documents an empty
// POST to start it when it has not. Then one snapshot read proves the token works. A 404 there
// means LinkedIn is still collecting the history, which takes a while after a first consent.
async function checkData(token: LinkedinToken): Promise<string> {
  const api = "https://api.linkedin.com/rest";
  const opts = { signal: AbortSignal.timeout(30000) };
  const archive = await fetch(
    `${api}/memberAuthorizations?q=memberAndApplication`,
    { headers: dmaHeaders(token), ...opts },
  );
  let feed = archive.ok ? "already on" : "";
  if (!archive.ok) {
    const started = await fetch(`${api}/memberAuthorizations`, {
      method: "POST",
      headers: dmaHeaders(token),
      body: "{}",
      ...opts,
    });
    feed = started.ok
      ? "switched on now"
      : `could not be switched on (${started.status})`;
  }
  const snapshot = await fetch(
    `${api}/memberSnapshotData?q=criteria&domain=PROFILE`,
    { headers: dmaHeaders(token), ...opts },
  );
  const profile = snapshot.ok
    ? "profile snapshot readable"
    : snapshot.status === 404
      ? "profile snapshot not ready yet (LinkedIn is still collecting your history; try again later)"
      : `profile snapshot refused (${snapshot.status}): ${(await snapshot.text()).slice(0, 200)}`;
  if (!snapshot.ok && snapshot.status !== 404) throw new Error(profile);
  return `Activity feed ${feed}; ${profile}.`;
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
    // Saved before the data check, so a slow LinkedIn snapshot never throws away a valid sign-in.
    await writeLinkedinToken(linkedinTokenPath(app), token);
    const status = app === "data" ? await checkData(token) : "";
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
