import test from "node:test";
import assert from "node:assert/strict";
import {
  LinkedinAuthError,
  linkedinDataClient,
} from "../src/lib/linkedin/data";

type Call = { url: URL; headers: Headers; method: string };
function fake(route: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetcher = (async (input: any, init: any = {}) => {
    const call = {
      url: new URL(String(input)),
      headers: new Headers(init.headers),
      method: init.method ?? "GET",
    };
    calls.push(call);
    return route(call);
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
  assert.deepEqual(await client.snapshot("INBOX"), [{ a: 1 }, { a: 2 }]);
  assert.equal(calls[0].url.pathname, "/rest/memberSnapshotData");
  assert.equal(calls[0].url.searchParams.get("domain"), "INBOX");
  assert.equal(calls[0].headers.get("linkedin-version"), "202312");
  assert.equal(calls[0].headers.get("authorization"), "Bearer t");
  assert.ok(calls.every((c) => c.method === "GET"));
});

test("a 404 on the first page means not ready; a later 404 ends the pages", async () => {
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
    [{ a: 1 }],
  );
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
  const client = linkedinDataClient({ token: "t", fetch: fetcher, sleep });
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
  assert.equal(busy.calls.length, 4, "first try plus three retries");
});
