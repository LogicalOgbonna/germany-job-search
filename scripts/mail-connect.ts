import "dotenv/config";
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { consentUrl, exchangeCode, writeToken } from "../src/lib/mail/gmail";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error(
    "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env (a Google Cloud OAuth client of type Desktop app), then run npm run mail:connect again.",
  );
  process.exit(1);
}

const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
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
      "No answer from Google within 5 minutes. Run npm run mail:connect again.",
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

server.on("error", (error) => finish(1, error.message));
server.listen(0, "127.0.0.1", () => {
  const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const url = consentUrl({ clientId, redirectUri, state, challenge });
  console.log(
    `Opening Google sign-in. If no browser opens, visit this address:\n${url}`,
  );
  execFile("open", [url], () => {});
  server.on("request", async (request, response) => {
    const params = new URL(request.url ?? "/", redirectUri).searchParams;
    // Browsers also ask for a favicon; only Google's redirect counts as the one answer.
    if (answered || !(params.has("code") || params.has("error"))) {
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
          `Google sign-in was not completed (${params.get("error")}).`,
        );
      const token = await exchangeCode({
        code,
        verifier,
        redirectUri,
        clientId,
        clientSecret,
      });
      await writeToken(token);
      await reply(
        response,
        200,
        "Jobdesk can now read your Gmail (read-only). You can close this tab.",
      );
      finish(0, `Connected ${token.email} (read-only)`);
    } catch (error) {
      await reply(
        response,
        400,
        "Gmail was not connected. The terminal shows the reason.",
      );
      finish(
        1,
        `Gmail was not connected: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  });
});
