import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { portlessOrigin } from "../src/lib/local-access";
import { checkMutation } from "../src/lib/api";
import { proxy } from "../src/proxy";

test("Portless access is scoped to the configured development origin", () => {
  const env = {
    NODE_ENV: "development",
    PORTLESS_URL: "https://branch.jobdesk.localhost",
  };
  assert.equal(portlessOrigin(env), env.PORTLESS_URL);
  for (const url of [
    "https://jobdesk.example.com",
    "https://jobdesk.localhost.evil.com",
    "https://user:pass@jobdesk.localhost",
    "https://jobdesk.localhost/path",
    "invalid",
  ])
    assert.equal(portlessOrigin({ ...env, PORTLESS_URL: url }), null);
  assert.equal(portlessOrigin({ ...env, NODE_ENV: "production" }), null);
});

test("HTTPS proxy mutations require the exact browser origin and matching host", () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    PORTLESS_URL: process.env.PORTLESS_URL,
    DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD,
  };
  Object.assign(process.env, {
    NODE_ENV: "development",
    PORTLESS_URL: "https://branch.jobdesk.localhost",
  });
  delete process.env.DASHBOARD_PASSWORD;
  const request = (origin: string, host = "branch.jobdesk.localhost") =>
    new NextRequest(`http://${host}/api/settings`, {
      headers: { origin, host },
    });
  try {
    assert.doesNotThrow(() =>
      checkMutation(request("https://branch.jobdesk.localhost")),
    );
    assert.doesNotThrow(() =>
      checkMutation(
        new NextRequest("https://localhost:4098/api/settings", {
          headers: {
            origin: "https://branch.jobdesk.localhost",
            host: "127.0.0.1:4098",
            "x-forwarded-host": "branch.jobdesk.localhost",
          },
        }),
      ),
    );
    assert.throws(() =>
      checkMutation(request("https://other.jobdesk.localhost")),
    );
    assert.throws(() =>
      checkMutation(
        request("https://branch.jobdesk.localhost", "other.localhost"),
      ),
    );
    assert.throws(() =>
      checkMutation(
        new NextRequest("http://branch.jobdesk.localhost/api/settings", {
          headers: {
            "x-forwarded-host": "branch.jobdesk.localhost",
            "x-forwarded-proto": "https",
          },
        }),
      ),
    );
    assert.equal(
      proxy(request("https://branch.jobdesk.localhost")).status,
      200,
    );
    assert.equal(
      proxy(request("https://other.localhost", "other.localhost")).status,
      403,
    );
    process.env.DASHBOARD_PASSWORD = "test-password";
    assert.equal(
      proxy(request("https://branch.jobdesk.localhost")).status,
      401,
    );
    delete process.env.DASHBOARD_PASSWORD;
    Object.assign(process.env, { NODE_ENV: "production" });
    assert.throws(() =>
      checkMutation(request("https://branch.jobdesk.localhost")),
    );
    assert.equal(
      proxy(request("https://branch.jobdesk.localhost")).status,
      403,
    );
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
