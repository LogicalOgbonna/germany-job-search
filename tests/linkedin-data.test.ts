import test from "node:test";
import assert from "node:assert/strict";
import {
  LinkedinAuthError,
  linkedinDataClient,
} from "../src/lib/linkedin/data";

type Call = { url: URL; headers: Headers; method: string; redirect?: string };
function fake(route: (call: Call, index: number) => Response) {
  const calls: Call[] = [];
  const fetcher = (async (input: any, init: any = {}) => {
    const call = {
      url: new URL(String(input)),
      headers: new Headers(init.headers),
      method: init.method ?? "GET",
      redirect: init.redirect,
    };
    calls.push(call);
    return route(call, calls.length - 1);
  }) as typeof fetch;
  return { calls, fetcher };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const page = (rows: unknown[], next: boolean) => ({
  paging: { links: next ? [{ rel: "next", href: "x" }] : [] },
  elements: [{ snapshotDomain: "INBOX", snapshotData: rows }],
});
const sleep = async () => {};

test("snapshot follows pages until there is no next link", async () => {
  const { calls, fetcher } = fake((call) =>
    call.url.searchParams.get("start") === "0"
      ? json(page([{ a: 1 }], true))
      : json(page([{ a: 2 }], false)),
  );
  const client = linkedinDataClient({ token: "t", fetch: fetcher, sleep });
  assert.deepEqual(await client.snapshot("INBOX"), {
    rows: [{ a: 1 }, { a: 2 }],
    complete: true,
  });
  assert.ok(calls.every((c) => c.redirect === "error"));
  assert.equal(calls[0].url.pathname, "/rest/memberSnapshotData");
  assert.equal(calls[0].url.searchParams.get("domain"), "INBOX");
  assert.equal(calls[0].headers.get("linkedin-version"), "202312");
  assert.equal(calls[0].headers.get("authorization"), "Bearer t");
  assert.ok(calls.every((c) => c.method === "GET"));
});

test("a 404 on the first page means not ready; a later 404 ends the pages, incomplete", async () => {
  const empty = fake(() => json({ message: "No data found" }, 404));
  assert.equal(
    await linkedinDataClient({
      token: "t",
      fetch: empty.fetcher,
      sleep,
    }).snapshot("INBOX"),
    null,
  );
  const short = fake((call) =>
    call.url.searchParams.get("start") === "0"
      ? json(page([{ a: 1 }], true))
      : json({}, 404),
  );
  assert.deepEqual(
    await linkedinDataClient({
      token: "t",
      fetch: short.fetcher,
      sleep,
    }).snapshot("INBOX"),
    { rows: [{ a: 1 }], complete: false },
  );
});

test("a snapshot that never stops paging returns its rows as incomplete", async () => {
  const endless = fake((call) =>
    json(page([{ start: call.url.searchParams.get("start") }], true)),
  );
  const result = await linkedinDataClient({
    token: "t",
    fetch: endless.fetcher,
    sleep,
  }).snapshot("CONNECTIONS");
  assert.equal(result?.complete, false);
  assert.equal(result?.rows.length, 200);
});

test("changes pages by processedAt and stops on an empty page", async () => {
  const { calls, fetcher } = fake((call) => {
    const start = Number(call.url.searchParams.get("startTime"));
    return start < 200
      ? json({
          elements: [
            { id: 1, processedAt: 150 },
            { id: 2, processedAt: 200 },
          ],
        })
      : json({ elements: [] });
  });
  const client = linkedinDataClient({
    token: "t",
    fetch: fetcher,
    sleep,
    now: () => new Date(1000),
  });
  const events = await client.changes(new Date(100));
  assert.deepEqual(
    events.map((e: any) => e.id),
    [1, 2],
  );
  assert.equal(calls[0].url.searchParams.get("startTime"), "100");
  assert.equal(calls[1].url.searchParams.get("startTime"), "201");
});

test("401 raises LinkedinAuthError; 429 retries then gives up", async () => {
  const denied = fake(() => json({}, 401));
  await assert.rejects(
    linkedinDataClient({ token: "t", fetch: denied.fetcher, sleep }).snapshot(
      "INBOX",
    ),
    LinkedinAuthError,
  );
  const busy = fake(() => json({}, 429));
  await assert.rejects(
    linkedinDataClient({ token: "t", fetch: busy.fetcher, sleep }).snapshot(
      "INBOX",
    ),
    /429/,
  );
  assert.equal(busy.calls.length, 5, "first try plus four retries, as Gmail");
});

test("network failures and timeouts are retried like 429 and 5xx", async () => {
  const waits: number[] = [];
  const flaky = fake((_call, index) => {
    if (index === 0) throw new TypeError("fetch failed");
    if (index === 1)
      throw new DOMException("The operation timed out.", "TimeoutError");
    if (index === 2) return json({}, 503);
    return json(page([{ a: 1 }], false));
  });
  const result = await linkedinDataClient({
    token: "t",
    fetch: flaky.fetcher,
    sleep: async (ms) => {
      waits.push(ms);
    },
  }).snapshot("INBOX");
  assert.deepEqual(result, { rows: [{ a: 1 }], complete: true });
  assert.deepEqual(waits, [2000, 4000, 8000]);
  const down = fake(() => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(
    linkedinDataClient({ token: "t", fetch: down.fetcher, sleep }).snapshot(
      "INBOX",
    ),
    /fetch failed/,
  );
  assert.equal(down.calls.length, 5);
});

test("Retry-After is honoured, up to a minute", async () => {
  const waits: number[] = [];
  const limited = fake((_call, index) =>
    index === 0
      ? new Response("{}", { status: 429, headers: { "Retry-After": "7" } })
      : index === 1
        ? new Response("{}", {
            status: 429,
            headers: { "Retry-After": "3600" },
          })
        : json(page([], false)),
  );
  await linkedinDataClient({
    token: "t",
    fetch: limited.fetcher,
    sleep: async (ms) => {
      waits.push(ms);
    },
  }).snapshot("INBOX");
  assert.deepEqual(waits, [7000, 60000]);
});

test("changes stops when the next page would not start later", async () => {
  const stuck = fake(() => json({ elements: [{ id: 1 }] }));
  await assert.rejects(
    linkedinDataClient({
      token: "t",
      fetch: stuck.fetcher,
      sleep,
      now: () => new Date(1000),
    }).changes(new Date(100)),
    /did not move forward/,
  );
  assert.equal(stuck.calls.length, 1);
});

test("changes never asks for more than the last 28 days", async () => {
  const now = new Date("2026-10-28T12:00:00Z");
  const { calls, fetcher } = fake(() => json({ elements: [] }));
  const client = linkedinDataClient({
    token: "t",
    fetch: fetcher,
    sleep,
    now: () => now,
  });
  await client.changes(new Date("2026-09-01T00:00:00Z"));
  assert.equal(
    calls[0].url.searchParams.get("startTime"),
    String(now.valueOf() - 28 * 86_400_000),
  );
});
