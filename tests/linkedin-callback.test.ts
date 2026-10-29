import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import {
  callbackAddress,
  linkedinApps,
  listenOnCallback,
} from "../src/lib/linkedin/callback";

test("each LinkedIn app has its own fixed callback port", () => {
  assert.equal(
    linkedinApps.share.defaultRedirect,
    "http://127.0.0.1:53682/callback",
  );
  assert.equal(
    linkedinApps.data.defaultRedirect,
    "http://127.0.0.1:53683/callback",
  );
});

test("the callback address comes from .env, or the fixed default when unset", () => {
  assert.deepEqual(callbackAddress("share", {}), {
    uri: "http://127.0.0.1:53682/callback",
    host: "127.0.0.1",
    port: 53682,
    path: "/callback",
  });
  assert.deepEqual(
    callbackAddress("data", {
      LINKEDIN_DATA_REDIRECT_URI: "http://127.0.0.1:53683/callback",
    }),
    {
      uri: "http://127.0.0.1:53683/callback",
      host: "127.0.0.1",
      port: 53683,
      path: "/callback",
    },
  );
});

test("a redirect that is not a fixed loopback port is refused", () => {
  for (const bad of [
    "http://127.0.0.1/callback",
    "http://127.0.0.1:0/callback",
    "http://example.com:53682/callback",
    "https://127.0.0.1:53682/callback",
    "not a url",
  ])
    assert.throws(
      () => callbackAddress("share", { LINKEDIN_REDIRECT_URI: bad }),
      /LINKEDIN_REDIRECT_URI/,
      bad,
    );
});

test("listening uses exactly the configured port", async () => {
  const probe = createServer();
  await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
  const free = (probe.address() as AddressInfo).port;
  await new Promise<void>((done) => probe.close(() => done()));

  const server = createServer();
  await listenOnCallback(server, {
    uri: `http://127.0.0.1:${free}/callback`,
    host: "127.0.0.1",
    port: free,
    path: "/callback",
  });
  assert.equal((server.address() as AddressInfo).port, free);
  await new Promise<void>((done) => server.close(() => done()));
});

test("a busy port fails with a clear message instead of moving elsewhere", async () => {
  const holder = createServer();
  await new Promise<void>((done) => holder.listen(0, "127.0.0.1", done));
  const port = (holder.address() as AddressInfo).port;
  const server = createServer();
  await assert.rejects(
    listenOnCallback(server, {
      uri: `http://127.0.0.1:${port}/callback`,
      host: "127.0.0.1",
      port,
      path: "/callback",
    }),
    new RegExp(`Port ${port} is already in use`),
  );
  assert.equal(server.listening, false);
  await new Promise<void>((done) => holder.close(() => done()));
});
