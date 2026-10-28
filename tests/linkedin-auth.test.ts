import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  authorizationUrl,
  exchangeCode,
  linkedinScopes,
  readLinkedinToken,
  writeLinkedinToken,
} from "../src/lib/linkedin/auth";

test("each app asks only for its own scopes", () => {
  assert.deepEqual(linkedinScopes.share, [
    "openid",
    "profile",
    "email",
    "w_member_social",
  ]);
  assert.deepEqual(linkedinScopes.data, ["r_dma_portability_self_serve"]);
});

test("the authorization URL carries the app, fixed redirect, state and scopes", () => {
  const url = new URL(
    authorizationUrl({
      app: "share",
      clientId: "client-1",
      redirectUri: "http://127.0.0.1:53682/callback",
      state: "state-1",
    }),
  );
  assert.equal(
    url.origin + url.pathname,
    "https://www.linkedin.com/oauth/v2/authorization",
  );
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    response_type: "code",
    client_id: "client-1",
    redirect_uri: "http://127.0.0.1:53682/callback",
    state: "state-1",
    scope: "openid profile email w_member_social",
  });
});

test("exchangeCode posts the code and returns the token with its expiry", async () => {
  const calls: { url: string; body: string }[] = [];
  const fetcher = (async (input: any, init: any = {}) => {
    calls.push({ url: String(input), body: String(init.body) });
    return new Response(
      JSON.stringify({
        access_token: "token-1",
        expires_in: 5184000,
        scope: "email,openid,profile,w_member_social",
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  const now = new Date("2026-10-28T00:00:00Z");
  const token = await exchangeCode({
    code: "code-1",
    redirectUri: "http://127.0.0.1:53682/callback",
    clientId: "client-1",
    clientSecret: "secret-1",
    fetch: fetcher,
    now,
  });
  assert.equal(calls[0].url, "https://www.linkedin.com/oauth/v2/accessToken");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(calls[0].body)), {
    grant_type: "authorization_code",
    code: "code-1",
    redirect_uri: "http://127.0.0.1:53682/callback",
    client_id: "client-1",
    client_secret: "secret-1",
  });
  assert.deepEqual(token, {
    accessToken: "token-1",
    expiresAt: "2026-12-27T00:00:00.000Z",
    scopes: ["email", "openid", "profile", "w_member_social"],
    connectedAt: "2026-10-28T00:00:00.000Z",
  });
});

test("a refused exchange names LinkedIn's reason", async () => {
  const fetcher = (async () =>
    new Response(
      JSON.stringify({
        error: "invalid_request",
        error_description:
          "Unable to retrieve access token: appid/redirect uri/code verifier does not match",
      }),
      { status: 400 },
    )) as unknown as typeof fetch;
  await assert.rejects(
    exchangeCode({
      code: "code-1",
      redirectUri: "http://127.0.0.1:53682/callback",
      clientId: "client-1",
      clientSecret: "secret-1",
      fetch: fetcher,
    }),
    /redirect uri/,
  );
});

test("tokens are stored privately and read back", async () => {
  const dir = await mkdtemp(join(tmpdir(), "linkedin-token-"));
  try {
    const path = join(dir, "nested", "token.json");
    const token = {
      accessToken: "token-1",
      expiresAt: "2026-12-27T00:00:00.000Z",
      scopes: ["openid"],
      connectedAt: "2026-10-28T00:00:00.000Z",
      name: "Arinze Ogbonna",
    };
    await writeLinkedinToken(path, token);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.deepEqual(await readLinkedinToken(path), token);
    assert.match(await readFile(path, "utf8"), /token-1/);
    assert.equal(await readLinkedinToken(join(dir, "missing.json")), null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
