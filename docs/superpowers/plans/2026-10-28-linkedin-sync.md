# LinkedIn Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the member's LinkedIn messages into the existing mail pipeline and show first-degree connections on each job's Referrals tab, read-only.

**Architecture:** A small `src/lib/linkedin/` module reads the Member Data Portability API (snapshot + changelog), converts messages to the pipeline's `RawMail` and stores connections in a new table. LinkedIn messages run through `processMessage` like Gmail; a stored connection's company is the only thing that lets a LinkedIn sender confirm a company. A `LinkedinSync` row and the existing worker tick schedule hourly checks.

**Tech Stack:** TypeScript, Next.js App Router API routes, Prisma/PostgreSQL, BullMQ worker, `node:test` via `tsx --test`.

Spec: `docs/superpowers/specs/2026-10-28-linkedin-sync-design.md`.

Conventions in this repo: Prettier formatting (`npx prettier --write <files>`), comments explain why, not what; no em dashes in user-facing text; unit tests in `tests/*.test.ts` (`npm test`), integration tests in `tests/integration/*.test.ts` (`npm run test:integration`, real local Postgres from `.env`, synthetic records removed afterwards); typecheck with `npx tsc --noEmit`. Commit messages are conventional and carry NO co-author or "Generated with" trailers.

Addition to the spec, agreed during planning: a LinkedIn message never creates a new card. Where the decision would be "create", it goes to Needs review instead (recruiter cold outreach is not an application).

---

## File map

| File | Responsibility |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/202610280001_linkedin/migration.sql` | `LinkedinConnection`, `LinkedinSync`, `MailMessage.senderCompany` |
| `src/lib/mail/types.ts` | `RawMail.senderCompany?` |
| `src/lib/mail/match.ts` | `senderCompany` counts as sender evidence |
| `src/lib/mail/store.ts` | persist/restore `senderCompany`; export `mentionsHiring` |
| `src/lib/mail/decide.ts` | LinkedIn messages never create cards |
| `src/lib/linkedin/data.ts` | API client: `snapshot`, `changes`, errors, retries |
| `src/lib/linkedin/messages.ts` | pure: snapshot row / changelog event to `RawMail`, ids, window |
| `src/lib/linkedin/connections.ts` | company keys, ordering, refresh, `connectionsAt` |
| `src/lib/linkedin/sync.ts` | `syncLinkedin`, lease, counters, `linkedinOverview` |
| `scripts/linkedin-sync.ts`, `scripts/worker.ts`, `package.json` | manual and scheduled runs |
| `src/app/api/linkedin/route.ts` | overview JSON for the dashboard |
| `src/lib/referrals/templates.ts`, `src/app/api/jobs/[id]/referrals/route.ts`, `src/components/referrals.tsx` | connections on the Referrals tab, "Add as referral contact" |
| `src/components/mail.tsx`, `src/components/dashboard.tsx` | LinkedIn status card; LinkedIn links in timelines/review |
| `README.md` | usage |

Task order: Task 1 first (shared types and schema). Tasks 2, 3 and 4 are independent and can run in parallel. Task 5 needs 2-4. Task 6 needs 1 and 4. Task 7 needs 5. Task 8 last.

---

### Task 1: Schema, `senderCompany` through the mail pipeline, no cards from LinkedIn

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/202610280001_linkedin/migration.sql`
- Modify: `src/lib/mail/types.ts` (type `RawMail`)
- Modify: `src/lib/mail/store.ts:246-255` (`toMail`), `:279-288` (`mailFields`), `:64` (`keywords`)
- Modify: `src/lib/mail/match.ts` (function `evidence`, around line 326)
- Modify: `src/lib/mail/decide.ts` (where `action: "create"` is returned)
- Test: `tests/mail-match.test.ts`, `tests/mail-decide.test.ts`

- [ ] **Step 1: Write failing matcher tests** (append to `tests/mail-match.test.ts`, which already defines `mail`, `verdict`, `app`):

```ts
test("a LinkedIn sender's known company corroborates the card", () => {
  const result = matchMail(
    mail({
      gmailId: "linkedin:abc",
      threadId: "linkedin:conv1",
      fromAddress: "https://www.linkedin.com/in/someone",
      fromName: "Some One",
      senderCompany: "Peec AI",
    }),
    verdict({ category: "rejection" }),
    [app()],
  );
  assert.deepEqual(result, {
    kind: "unique",
    applicationId: "a1",
    reason: "company",
    corroborated: true,
  });
});

test("a LinkedIn sender with no known company names nothing", () => {
  const result = matchMail(
    mail({
      gmailId: "linkedin:abc",
      threadId: "linkedin:conv1",
      fromAddress: "https://www.linkedin.com/in/someone",
      fromName: "Some One",
    }),
    verdict({ category: "rejection" }),
    [app()],
  );
  assert.equal(result.kind, "none");
});
```

- [ ] **Step 2: Write failing decide test** (append to `tests/mail-decide.test.ts`; reuse that file's existing helpers `run`, `verdict`, and its "no match" input. Read the top of the file first and use the same no-match value the existing "create" tests use):

```ts
test("a LinkedIn message never creates a card; it waits for review", () => {
  // Same inputs as the existing test that produces action "create",
  // with the mail id switched to a LinkedIn one.
  const decision = runNoMatch(verdict("interview"), {
    gmailId: "linkedin:abc",
  });
  assert.equal(decision.action, "review");
  assert.match(decision.reason, /LinkedIn/);
});
```

If the file has no `runNoMatch`, write the call inline the same way the existing create test calls `decide`, overriding only `gmailId`.

- [ ] **Step 3: Run and see them fail**

Run: `npx tsx --test tests/mail-match.test.ts tests/mail-decide.test.ts`
Expected: FAIL (type error on `senderCompany`, decide returns "create").

- [ ] **Step 4: Types.** In `src/lib/mail/types.ts`, add to `RawMail` after `calendar?`:

```ts
  // LinkedIn messages only: the sender's current company from the member's stored connection.
  // The one way a LinkedIn sender (a profile URL, not an address) can confirm a company.
  senderCompany?: string;
```

- [ ] **Step 5: Matcher.** In `src/lib/mail/match.ts` function `evidence`, inside `if (!mail.fromMe) {` after `add(own, "address");` add:

```ts
    // Counts like a display name: it corroborates only when it is exactly the card's company.
    if (mail.senderCompany) add(mail.senderCompany, "display");
```

- [ ] **Step 6: Decide.** In `src/lib/mail/decide.ts`, at the start of the branch that returns `action: "create"` (the `!card`/no-match branch), before returning create:

```ts
    if (mail.gmailId.startsWith("linkedin:"))
      return review("LinkedIn messages do not create cards");
```

(`review` is the helper already used in that function; if it is named differently, use the existing one.)

- [ ] **Step 7: Schema.** In `prisma/schema.prisma`, add to `model MailMessage` after `bodyText`:

```prisma
  senderCompany String?
```

and append:

```prisma
model LinkedinConnection {
  id          String    @id @default(cuid())
  profileUrl  String    @unique
  name        String
  company     String    @default("")
  companyKey  String    @default("")
  position    String    @default("")
  email       String    @default("")
  connectedOn DateTime?
  updatedAt   DateTime  @updatedAt
  @@index([companyKey])
}

model LinkedinSync {
  id             String    @id
  nextRunAt      DateTime  @default(now())
  leaseUntil     DateTime?
  lastCheckedAt  DateTime?
  lastSuccessAt  DateTime?
  lastSnapshotAt DateTime?
  lastError      String?
  lastCounts     Json?
}
```

Create `prisma/migrations/202610280001_linkedin/migration.sql`:

```sql
ALTER TABLE "MailMessage" ADD COLUMN "senderCompany" TEXT;

CREATE TABLE "LinkedinConnection" (
    "id" TEXT NOT NULL,
    "profileUrl" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT NOT NULL DEFAULT '',
    "companyKey" TEXT NOT NULL DEFAULT '',
    "position" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "connectedOn" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LinkedinConnection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LinkedinConnection_profileUrl_key" ON "LinkedinConnection"("profileUrl");
CREATE INDEX "LinkedinConnection_companyKey_idx" ON "LinkedinConnection"("companyKey");

CREATE TABLE "LinkedinSync" (
    "id" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastSnapshotAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastCounts" JSONB,
    CONSTRAINT "LinkedinSync_pkey" PRIMARY KEY ("id")
);
```

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: "1 migration applied" (or "All migrations have been successfully applied"), client generated.

- [ ] **Step 8: Store.** In `src/lib/mail/store.ts`:
  - `mailFields`: add `senderCompany: mail.senderCompany ?? null,`
  - `toMail`: add `...(row.senderCompany ? { senderCompany: row.senderCompany } : {}),`
  - Below `const keywords = ...;` add:

```ts
// LinkedIn messages rarely have a subject, so their body is checked with the same words.
export const mentionsHiring = (text: string) => keywords.test(text);
```

- [ ] **Step 9: Run tests**

Run: `npx tsx --test tests/mail-match.test.ts tests/mail-decide.test.ts && npx tsc --noEmit && npm test`
Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add prisma src/lib/mail tests/mail-match.test.ts tests/mail-decide.test.ts
git commit -m "feat(mail): sender company for LinkedIn messages; LinkedIn never creates cards"
```

---

### Task 2: LinkedIn data API client

**Files:**
- Create: `src/lib/linkedin/data.ts`
- Test: `tests/linkedin-data.test.ts`

Background: snapshot = `GET https://api.linkedin.com/rest/memberSnapshotData?q=criteria&domain=<D>&start=<n>`; each page `{ paging: { links: [{ rel: "next" }] }, elements: [{ snapshotDomain, snapshotData: [...] }] }`; past the end, or before data exists, LinkedIn answers 404. Changelog = `GET https://api.linkedin.com/rest/memberChangeLogs?q=memberAndApplication&startTime=<ms>&count=10` returning `{ elements: [...] }` each with `processedAt`. Header `LinkedIn-Version: 202312` on both.

- [ ] **Step 1: Write failing tests** `tests/linkedin-data.test.ts`:

```ts
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
    await linkedinDataClient({ token: "t", fetch: empty.fetcher, sleep }).snapshot("INBOX"),
    null,
  );
  const short = fake((call) =>
    call.url.searchParams.get("start") === "0"
      ? json(page([{ a: 1 }], true))
      : json({}, 404),
  );
  assert.deepEqual(
    await linkedinDataClient({ token: "t", fetch: short.fetcher, sleep }).snapshot("INBOX"),
    [{ a: 1 }],
  );
});

test("changes pages by processedAt and stops on an empty page", async () => {
  const { calls, fetcher } = fake((call) => {
    const start = Number(call.url.searchParams.get("startTime"));
    return start < 200
      ? json({ elements: [{ id: 1, processedAt: 150 }, { id: 2, processedAt: 200 }] })
      : json({ elements: [] });
  });
  const client = linkedinDataClient({ token: "t", fetch: fetcher, sleep });
  const events = await client.changes(new Date(100));
  assert.deepEqual(events.map((e: any) => e.id), [1, 2]);
  assert.equal(calls[0].url.searchParams.get("startTime"), "100");
  assert.equal(calls[1].url.searchParams.get("startTime"), "201");
});

test("401 raises LinkedinAuthError; 429 retries then gives up", async () => {
  const denied = fake(() => json({}, 401));
  await assert.rejects(
    linkedinDataClient({ token: "t", fetch: denied.fetcher, sleep }).snapshot("INBOX"),
    LinkedinAuthError,
  );
  const busy = fake(() => json({}, 429));
  await assert.rejects(
    linkedinDataClient({ token: "t", fetch: busy.fetcher, sleep }).snapshot("INBOX"),
    /429/,
  );
  assert.equal(busy.calls.length, 4, "first try plus three retries");
});
```

- [ ] **Step 2: Run, expect FAIL** (`Cannot find module`): `npx tsx --test tests/linkedin-data.test.ts`

- [ ] **Step 3: Implement** `src/lib/linkedin/data.ts`:

```ts
// Read-only client for the Member Data Portability API (Member). Every call is a GET.
const api = "https://api.linkedin.com/rest";
const version = "202312"; // the only version these endpoints accept
const pageLimit = 200;

export class LinkedinAuthError extends Error {
  name = "LinkedinAuthError";
}

export type SnapshotDomain = "INBOX" | "CONNECTIONS";
export type ChangelogEvent = {
  id?: number;
  resourceName?: string;
  method?: string;
  owner?: string;
  actor?: string;
  processedAt?: number;
  capturedAt?: number;
  activity?: any;
  processedActivity?: any;
};

export function linkedinDataClient(options: {
  token: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}) {
  const send = options.fetch ?? fetch;
  const sleep =
    options.sleep ?? ((ms: number) => new Promise((done) => setTimeout(done, ms)));
  // null for 404, which LinkedIn uses for "no data (yet)" and for "past the last page".
  async function get(path: string): Promise<any | null> {
    for (let attempt = 0; ; attempt++) {
      const response = await send(`${api}${path}`, {
        headers: {
          Authorization: `Bearer ${options.token}`,
          "LinkedIn-Version": version,
        },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return response.json();
      if (response.status === 404) return null;
      if (response.status === 401 || response.status === 403)
        throw new LinkedinAuthError(
          "Reconnect LinkedIn: run npm run linkedin:connect -- --data",
        );
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        await sleep(2000 * 2 ** attempt);
        continue;
      }
      throw new Error(`LinkedIn answered ${response.status}`);
    }
  }
  return {
    // All rows of one domain, or null when LinkedIn has not prepared the domain yet.
    async snapshot(domain: SnapshotDomain): Promise<any[] | null> {
      const rows: any[] = [];
      for (let start = 0; start < pageLimit; start++) {
        const body = await get(
          `/memberSnapshotData?q=criteria&domain=${domain}&start=${start}`,
        );
        if (!body) return start === 0 ? null : rows;
        rows.push(...(body.elements?.[0]?.snapshotData ?? []));
        if (!body.paging?.links?.some((link: any) => link.rel === "next"))
          return rows;
      }
      throw new Error(`LinkedIn ${domain} did not stop paging`);
    },
    // Events processed at or after `since`, oldest first, as LinkedIn recommends paging them.
    async changes(since: Date): Promise<ChangelogEvent[]> {
      const events: ChangelogEvent[] = [];
      let start = since.getTime();
      for (let page = 0; page < pageLimit; page++) {
        const body = await get(
          `/memberChangeLogs?q=memberAndApplication&startTime=${start}&count=10`,
        );
        const batch: ChangelogEvent[] = body?.elements ?? [];
        if (!batch.length) return events;
        events.push(...batch);
        start =
          Math.max(...batch.map((event) => Number(event.processedAt) || 0)) + 1;
      }
      throw new Error("LinkedIn changelog did not stop paging");
    },
  };
}
export type LinkedinDataClient = ReturnType<typeof linkedinDataClient>;
```

- [ ] **Step 4: Run, expect PASS:** `npx tsx --test tests/linkedin-data.test.ts && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/lib/linkedin/data.ts tests/linkedin-data.test.ts
git commit -m "feat(linkedin): read-only data portability client"
```

---

### Task 3: Messages to `RawMail`

**Files:**
- Create: `src/lib/linkedin/messages.ts`
- Test: `tests/linkedin-messages.test.ts`

Snapshot `INBOX` row fields (strings): `"CONVERSATION ID"`, `"CONVERSATION TITLE"`, `FROM`, `"SENDER PROFILE URL"`, `TO`, `"RECIPIENT PROFILE URLS"`, `DATE` (`"2026-10-26 18:06:07 UTC"`), `SUBJECT`, `CONTENT` (may contain HTML), `FOLDER` (`INBOX` | `ARCHIVE` | others), `ATTACHMENTS`.
Changelog message event: `resourceName === "messages"`, `method === "CREATE"`, `activity.thread` = `"urn:li:messagingThread:<conversation id>"`, `activity.author` = person URN, `activity.createdAt` (ms), `activity.content.content.string` or `activity.content.fallback`; `processedActivity["author~"]` may hold `localizedFirstName`/`localizedLastName` and `vanityName`. The changelog does not carry a profile URL reliably, so the sender identity used for the id is the sender NAME in both sources.

- [ ] **Step 1: Write failing tests** `tests/linkedin-messages.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  fromChangelog,
  fromSnapshot,
  messageId,
  withinWindow,
} from "../src/lib/linkedin/messages";

const me = "Ada Lovelace";
const row = (over: Record<string, string> = {}) => ({
  "CONVERSATION ID": "2-abc==",
  "CONVERSATION TITLE": "",
  FROM: "Grace Hopper",
  "SENDER PROFILE URL": "https://www.linkedin.com/in/GraceHopper",
  TO: me,
  DATE: "2026-10-26 18:06:07 UTC",
  SUBJECT: "",
  CONTENT: "<p>Thanks for applying,&nbsp;we would like to talk.</p>",
  FOLDER: "INBOX",
  ...over,
});

test("a snapshot row becomes a RawMail with LinkedIn ids", () => {
  const mail = fromSnapshot(row(), me)!;
  assert.match(mail.gmailId, /^linkedin:[0-9a-f]{64}$/);
  assert.equal(mail.threadId, "linkedin:2-abc==");
  assert.equal(mail.fromAddress, "https://www.linkedin.com/in/gracehopper");
  assert.equal(mail.fromName, "Grace Hopper");
  assert.equal(mail.subject, "LinkedIn message from Grace Hopper");
  assert.equal(mail.bodyText, "Thanks for applying, we would like to talk.");
  assert.equal(mail.receivedAt.toISOString(), "2026-10-26T18:06:07.000Z");
  assert.equal(mail.fromMe, false);
  assert.equal(mail.bulk, false);
});

test("own messages, other folders and empty content are skipped", () => {
  assert.equal(fromSnapshot(row({ FROM: me }), me), null);
  assert.equal(fromSnapshot(row({ FOLDER: "SPAM" }), me), null);
  assert.equal(fromSnapshot(row({ CONTENT: "  " }), me), null);
  assert.ok(fromSnapshot(row({ FOLDER: "ARCHIVE" }), me));
});

test("the same message read from the changelog gets the same id and thread", () => {
  const event = {
    resourceName: "messages",
    method: "CREATE",
    activity: {
      thread: "urn:li:messagingThread:2-abc==",
      createdAt: Date.parse("2026-10-26T18:06:07.640Z"),
      content: { content: { string: "Thanks for applying, we would like to talk." } },
    },
    processedActivity: {
      "author~": { localizedFirstName: "Grace", localizedLastName: "Hopper" },
    },
  };
  const a = fromSnapshot(row(), me)!;
  const b = fromChangelog(event, me)!;
  assert.equal(b.gmailId, a.gmailId);
  assert.equal(b.threadId, a.threadId);
  assert.equal(b.fromName, "Grace Hopper");
});

test("changelog events that are not new messages are ignored", () => {
  assert.equal(fromChangelog({ resourceName: "comments", method: "CREATE" }, me), null);
  assert.equal(
    fromChangelog({ resourceName: "messages", method: "DELETE", activity: {} }, me),
    null,
  );
});

test("messageId depends on conversation, sender, second and text only", () => {
  const base = { conversation: "c", sender: "S", at: new Date(1000), text: "hi" };
  assert.equal(messageId(base), messageId({ ...base, at: new Date(1999) }));
  assert.notEqual(messageId(base), messageId({ ...base, text: "hi!" }));
});

test("the window keeps messages at or after the cutoff", () => {
  const mail = fromSnapshot(row(), me)!;
  assert.equal(withinWindow(mail, new Date("2026-10-26T00:00:00Z")), true);
  assert.equal(withinWindow(mail, new Date("2026-10-27T00:00:00Z")), false);
});
```

- [ ] **Step 2: Run, expect FAIL:** `npx tsx --test tests/linkedin-messages.test.ts`

- [ ] **Step 3: Implement** `src/lib/linkedin/messages.ts`:

```ts
import { createHash } from "node:crypto";
import type { RawMail } from "../mail/types";

const keptFolders = new Set(["INBOX", "ARCHIVE"]);
const entities: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};
const text = (html: string) =>
  html
    .replace(/<br\s*\/?>|<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (entity) => entities[entity.toLowerCase()] ?? " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 20000);
const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

// One id for one message, whichever source it was read from. The changelog has milliseconds
// and the snapshot only seconds, so time is floored to the second.
export function messageId(input: {
  conversation: string;
  sender: string;
  at: Date;
  text: string;
}): string {
  const second = Math.floor(input.at.getTime() / 1000);
  return `linkedin:${createHash("sha256")
    .update(
      [input.conversation, input.sender.trim().toLowerCase(), second, input.text].join(
        "\u0000",
      ),
    )
    .digest("hex")}`;
}

function build(input: {
  conversation: string;
  sender: string;
  profileUrl: string;
  title: string;
  at: Date;
  body: string;
}): RawMail {
  return {
    gmailId: messageId({
      conversation: input.conversation,
      sender: input.sender,
      at: input.at,
      text: input.body,
    }),
    threadId: `linkedin:${input.conversation}`,
    fromAddress: input.profileUrl.toLowerCase(),
    fromName: input.sender,
    subject: input.title || `LinkedIn message from ${input.sender}`,
    receivedAt: input.at,
    bodyText: input.body,
    fromMe: false,
    bulk: false,
  };
}

export function fromSnapshot(
  row: Record<string, string>,
  me: string,
): RawMail | null {
  const sender = (row.FROM ?? "").trim();
  const body = text(row.CONTENT ?? "");
  const at = new Date((row.DATE ?? "").replace(" UTC", "Z").replace(" ", "T"));
  if (
    !keptFolders.has(row.FOLDER) ||
    !sender ||
    sameName(sender, me) ||
    !body ||
    !row["CONVERSATION ID"] ||
    Number.isNaN(at.getTime())
  )
    return null;
  return build({
    conversation: row["CONVERSATION ID"],
    sender,
    profileUrl: row["SENDER PROFILE URL"] ?? "",
    title: (row["CONVERSATION TITLE"] || row.SUBJECT || "").trim(),
    at,
    body,
  });
}

export function fromChangelog(event: any, me: string): RawMail | null {
  if (event?.resourceName !== "messages" || event.method !== "CREATE")
    return null;
  const activity = event.activity ?? {};
  const author = event.processedActivity?.["author~"] ?? {};
  const sender = [author.localizedFirstName, author.localizedLastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const conversation = String(activity.thread ?? "").replace(
    /^urn:li:messagingThread:/,
    "",
  );
  const body = text(
    activity.content?.content?.string ?? activity.content?.fallback ?? "",
  );
  const at = new Date(Number(activity.createdAt));
  if (!sender || sameName(sender, me) || !conversation || !body || Number.isNaN(at.getTime()))
    return null;
  return build({
    conversation,
    sender,
    profileUrl: author.vanityName
      ? `https://www.linkedin.com/in/${author.vanityName}`
      : "",
    title: "",
    at,
    body,
  });
}

export const withinWindow = (mail: RawMail, since: Date) =>
  mail.receivedAt.getTime() >= since.getTime();
```

Note: a message read from the changelog may lack a profile URL; the snapshot copy of the same message has the same `gmailId`, so the pipeline keeps whichever arrived first. Connection lookup (Task 5) falls back to the sender name when the profile URL is empty.

- [ ] **Step 4: Run, expect PASS:** `npx tsx --test tests/linkedin-messages.test.ts && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/lib/linkedin/messages.ts tests/linkedin-messages.test.ts
git commit -m "feat(linkedin): convert LinkedIn messages to pipeline mail"
```

---

### Task 4: Connections store and lookup

**Files:**
- Create: `src/lib/linkedin/connections.ts`
- Test: `tests/linkedin-connections.test.ts`

Snapshot `CONNECTIONS` row: `"First Name"`, `"Last Name"`, `URL`, `"Email Address"`, `Company`, `Position`, `"Connected On"` (`"19 Oct 2026"`).

- [ ] **Step 1: Write failing tests** `tests/linkedin-connections.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  companyKey,
  keysMatch,
  rank,
  toConnection,
} from "../src/lib/linkedin/connections";

test("company keys reuse the mail matcher's normalisation", () => {
  assert.equal(companyKey("Personio SE & Co. KG"), companyKey("Personio"));
  assert.equal(companyKey("Peec AI"), "peecai");
});

test("keys match when equal or when one opens the other on a word boundary", () => {
  assert.equal(keysMatch("Grafana", "Grafana Labs"), true);
  assert.equal(keysMatch("Eye", "Eye Security"), false, "short names need equality");
  assert.equal(keysMatch("Develop", "Senior Developer"), false);
});

test("a connection row maps to a record", () => {
  const record = toConnection({
    "First Name": "Grace",
    "Last Name": "Hopper",
    URL: "https://www.linkedin.com/in/gracehopper",
    "Email Address": "",
    Company: "Personio",
    Position: "Senior Software Engineer",
    "Connected On": "19 Oct 2026",
  })!;
  assert.equal(record.name, "Grace Hopper");
  assert.equal(record.profileUrl, "https://www.linkedin.com/in/gracehopper");
  assert.equal(record.companyKey, companyKey("Personio"));
  assert.equal(record.connectedOn?.toISOString().slice(0, 10), "2026-10-19");
  assert.equal(toConnection({ "First Name": "x" }), null, "no profile URL");
});

test("engineers come first, then managers and founders, then recruiters", () => {
  const order = rank([
    { position: "Talent Acquisition Partner" },
    { position: "Head of Marketing" },
    { position: "Co-Founder" },
    { position: "Senior Software Engineer" },
  ] as any).map((c: any) => c.position);
  assert.deepEqual(order, [
    "Senior Software Engineer",
    "Co-Founder",
    "Talent Acquisition Partner",
    "Head of Marketing",
  ]);
});
```

- [ ] **Step 2: Run, expect FAIL:** `npx tsx --test tests/linkedin-connections.test.ts`

- [ ] **Step 3: Implement** `src/lib/linkedin/connections.ts`:

```ts
import { db } from "../db";
import { normalizeCompany } from "../mail/match";
import { linkedinUrl } from "../referrals/domain";

export type ConnectionRecord = {
  profileUrl: string;
  name: string;
  company: string;
  companyKey: string;
  position: string;
  email: string;
  connectedOn: Date | null;
};

export const companyKey = (name: string) => normalizeCompany(name);

// Same rule as the mail matcher for names read from text: equal, or the shorter name
// (5 characters or more) is the longer one's opening words.
export function keysMatch(a: string, b: string): boolean {
  const words = (name: string) =>
    name.split(/\s+/).map(companyKey).filter(Boolean);
  const x = words(a);
  const y = words(b);
  const kx = x.join("");
  const ky = y.join("");
  if (!kx || !ky) return false;
  if (kx === ky) return true;
  const [short, long] = kx.length <= ky.length ? [kx, y] : [ky, x];
  if (short.length < 5) return false;
  let run = "";
  return long.some((word) => (run += word) === short);
}

export function toConnection(row: Record<string, string>): ConnectionRecord | null {
  const profileUrl = linkedinUrl(row.URL ?? "");
  const name = [row["First Name"], row["Last Name"]]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (!profileUrl || !name) return null;
  const connected = Date.parse(`${row["Connected On"] ?? ""} UTC`);
  return {
    profileUrl,
    name,
    company: (row.Company ?? "").trim(),
    companyKey: companyKey(row.Company ?? ""),
    position: (row.Position ?? "").trim(),
    email: (row["Email Address"] ?? "").trim().toLowerCase(),
    connectedOn: Number.isNaN(connected) ? null : new Date(connected),
  };
}

const tier = (position: string) =>
  /engineer|developer|architect|programmer|\bsre\b|devops/i.test(position)
    ? 0
    : /founder|\bcto\b|\bceo\b|head of engineering|engineering manager|vp.*engineering|tech lead/i.test(
          position,
        )
      ? 1
      : /recruit|talent|hiring|people|\bhr\b/i.test(position)
        ? 2
        : 3;
export const rank = <T extends { position: string }>(list: T[]) =>
  [...list].sort((a, b) => tier(a.position) - tier(b.position));

// Replaces the stored connections with a complete snapshot.
export async function refreshConnections(rows: Record<string, string>[]) {
  const records = rows.map(toConnection).filter((r): r is ConnectionRecord => !!r);
  const urls = records.map((r) => r.profileUrl);
  await db.$transaction(async (tx) => {
    for (const record of records)
      await tx.linkedinConnection.upsert({
        where: { profileUrl: record.profileUrl },
        create: record,
        update: record,
      });
    await tx.linkedinConnection.deleteMany({
      where: { profileUrl: { notIn: urls } },
    });
  }, { timeout: 120000 });
  return records.length;
}

// Connections whose current company is this one, best referral contacts first.
export async function connectionsAt(company: string) {
  const key = companyKey(company);
  if (key.length < 3) return [];
  // The first word narrows the scan; keysMatch decides.
  const first = companyKey(company.trim().split(/\s+/)[0] ?? "");
  const found = await db.linkedinConnection.findMany({
    where: { companyKey: { startsWith: first.slice(0, 3) } },
  });
  return rank(found.filter((c) => keysMatch(c.company, company)));
}

// For LinkedIn messages: the sender's company, by profile URL, else by exact name.
export async function companyOfSender(profileUrl: string, name: string) {
  const byUrl = profileUrl
    ? await db.linkedinConnection.findUnique({
        where: { profileUrl: linkedinUrl(profileUrl) || profileUrl },
      })
    : null;
  if (byUrl) return byUrl.company || null;
  const byName = await db.linkedinConnection.findMany({
    where: { name: { equals: name, mode: "insensitive" } },
    take: 2,
  });
  // Two connections with the same name cannot tell which company is meant.
  return byName.length === 1 ? byName[0].company || null : null;
}
```

- [ ] **Step 4: Run, expect PASS:** `npx tsx --test tests/linkedin-connections.test.ts && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/lib/linkedin/connections.ts tests/linkedin-connections.test.ts
git commit -m "feat(linkedin): store connections and look them up by company"
```

---

### Task 5: Sync, worker, command, overview API

**Files:**
- Create: `src/lib/linkedin/sync.ts`, `scripts/linkedin-sync.ts`, `src/app/api/linkedin/route.ts`
- Modify: `scripts/worker.ts`, `package.json`
- Test: `tests/integration/linkedin.test.ts`

Rules: lease `LinkedinSync` id `linkedin` for 10 minutes; hourly runs; snapshot (INBOX within window + CONNECTIONS) when `lastSnapshotAt` is null or older than 24 hours; changelog since `lastSuccessAt - 1h` (first run: 30 days ago); window for messages: first run 30 days, later `lastSuccessAt - 1h`. Order of work: connections first (so sender companies resolve), then messages oldest first. A message is processed only if it is a candidate: its thread is linked to a card, OR its sender company matches a board company (`keysMatch`), OR `mentionsHiring(subject + "\n" + body)`. Others are counted `ignored` and not stored (as Gmail does for non-candidates). Scheduled runs require the data token and `mailLive()`.

- [ ] **Step 1: Write failing integration test** `tests/integration/linkedin.test.ts`. Read `tests/integration/mail.test.ts` first and copy its setup pattern (how it creates a synthetic job + application, how it cleans up, and how it sets `mailLive`). Test cases, each with a fake client object `{ snapshot, changes }`:

```ts
// 1. A rejection from a stored connection at the card's company updates that card:
//    seed LinkedinConnection { profileUrl: "https://www.linkedin.com/in/test-li-1",
//      name: "Test Sender", company: "<synthetic company>", companyKey: companyKey(...) }
//    fake snapshot INBOX row from "Test Sender" with SENDER PROFILE URL above,
//      CONTENT "Unfortunately we decided not to move forward with your application.",
//      DATE = now - 1 day;
//    fake CONNECTIONS returns the same person;
//    run syncLinkedin({ client, ai: <stub returning rejection, high, agreed via rules> , now })
//    expect: the card status "rejected"; one MailMessage with gmailId starting "linkedin:".
// 2. The same message from an unknown sender (no connection) is stored with state "needs_review".
// 3. Running syncLinkedin twice stores nothing new the second time (counts.created/applied 0).
// 4. A personal message without hiring words or a known company is not stored.
// Cleanup: delete MailMessage rows with gmailId in the test ids, the synthetic job/application,
//   LinkedinConnection rows with profileUrl starting "https://www.linkedin.com/in/test-li-",
//   and the LinkedinSync row id "linkedin-test".
```

Use a sync id parameter so tests do not touch the real row: `syncLinkedin({ syncId: "linkedin-test", ... })`.

- [ ] **Step 2: Run, expect FAIL:** `npm run test:integration -- tests/integration/linkedin.test.ts` (or `npx tsx --test --test-concurrency=1 tests/integration/linkedin.test.ts`)

- [ ] **Step 3: Implement** `src/lib/linkedin/sync.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../db";
import { aiClassifier } from "../mail/ai";
import { mailLive, mentionsHiring, processMessage } from "../mail/store";
import type { AiClassifier, RawMail } from "../mail/types";
import { linkedinTokenPath, readLinkedinToken } from "./auth";
import { companyOfSender, keysMatch, refreshConnections } from "./connections";
import {
  LinkedinAuthError,
  linkedinDataClient,
  type LinkedinDataClient,
} from "./data";
import { fromChangelog, fromSnapshot, withinWindow } from "./messages";

const hour = 3600_000;
const day = 24 * hour;
const firstWindow = 30 * day;
const leaseMs = 10 * 60_000;

export type LinkedinCounts = {
  connections: number | null; // null: snapshot not ready or not due
  read: number;
  candidates: number;
  applied: number;
  attached: number;
  review: number;
  ignored: number;
  failed: number;
};

async function memberName(): Promise<string> {
  const contact = JSON.parse(
    await readFile(join(process.cwd(), "cv", "contact.json"), "utf8"),
  );
  // contact.json stores "Ogbonna Arinze"; LinkedIn shows "Arinze Ogbonna". Compare both orders.
  return String(contact.name ?? "");
}

export async function syncLinkedin(
  options: {
    client?: LinkedinDataClient;
    ai?: AiClassifier | null;
    now?: Date;
    syncId?: string;
    scheduled?: boolean;
  } = {},
): Promise<LinkedinCounts & { skipped: string | null }> {
  const id = options.syncId ?? "linkedin";
  const now = options.now ?? new Date();
  const counts: LinkedinCounts = {
    connections: null,
    read: 0,
    candidates: 0,
    applied: 0,
    attached: 0,
    review: 0,
    ignored: 0,
    failed: 0,
  };
  if (options.scheduled && !(await mailLive()))
    return { ...counts, skipped: "mail-not-live" };
  await db.linkedinSync.upsert({ where: { id }, create: { id }, update: {} });
  const lease = await db.linkedinSync.updateMany({
    where: { id, OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { leaseUntil: new Date(now.getTime() + leaseMs), lastCheckedAt: now },
  });
  if (!lease.count) return { ...counts, skipped: "busy" };
  const sync = await db.linkedinSync.findUniqueOrThrow({ where: { id } });
  try {
    const token = await readLinkedinToken(linkedinTokenPath("data"));
    if (!options.client && !token)
      throw new LinkedinAuthError(
        "LinkedIn is not connected: run npm run linkedin:connect -- --data",
      );
    const client =
      options.client ?? linkedinDataClient({ token: token!.accessToken });
    const since = sync.lastSuccessAt
      ? new Date(sync.lastSuccessAt.getTime() - hour)
      : new Date(now.getTime() - firstWindow);
    const snapshotDue =
      !sync.lastSnapshotAt || now.getTime() - sync.lastSnapshotAt.getTime() > day;
    const me = await memberName();
    const isMe = (name: string) => {
      const parts = (s: string) => s.toLowerCase().split(/\s+/).sort().join(" ");
      return parts(name) === parts(me);
    };
    const mails = new Map<string, RawMail>();
    let snapshotRead = false;
    if (snapshotDue) {
      const people = await client.snapshot("CONNECTIONS");
      if (people) counts.connections = await refreshConnections(people);
      const inbox = await client.snapshot("INBOX");
      if (inbox) {
        snapshotRead = true;
        for (const row of inbox) {
          const mail = isMe(row.FROM ?? "") ? null : fromSnapshot(row, me);
          if (mail && withinWindow(mail, since)) mails.set(mail.gmailId, mail);
        }
      }
    }
    for (const event of await client.changes(since)) {
      const mail = fromChangelog(event, me);
      if (mail && !isMe(mail.fromName) && withinWindow(mail, since) && !mails.has(mail.gmailId))
        mails.set(mail.gmailId, mail);
    }
    counts.read = mails.size;
    const board = await db.application.findMany({
      select: { job: { select: { company: true } } },
    });
    const companies = [...new Set(board.map((a) => a.job.company))];
    const linkedThreads = new Set(
      (
        await db.mailMessage.findMany({
          where: { threadId: { startsWith: "linkedin:" }, applicationId: { not: null } },
          select: { threadId: true },
        })
      ).map((m) => m.threadId),
    );
    const ai = options.ai === undefined ? aiClassifier() : options.ai;
    for (const mail of [...mails.values()].sort(
      (a, b) => a.receivedAt.getTime() - b.receivedAt.getTime(),
    )) {
      try {
        const company = await companyOfSender(mail.fromAddress, mail.fromName);
        if (company) mail.senderCompany = company;
        const candidate =
          linkedThreads.has(mail.threadId) ||
          (company && companies.some((c) => keysMatch(c, company))) ||
          mentionsHiring(`${mail.subject}\n${mail.bodyText}`);
        if (!candidate) {
          counts.ignored++;
          continue;
        }
        counts.candidates++;
        const { state, decision } = await processMessage(mail, {
          ai,
          dryRun: false,
          now,
        });
        if (decision.action === "update") counts.applied++;
        else if (decision.action === "attach") counts.attached++;
        else if (state === "needs_review") counts.review++;
        else counts.ignored++;
      } catch {
        counts.failed++;
      }
    }
    await db.linkedinSync.update({
      where: { id },
      data: {
        lastSuccessAt: now,
        lastError: null,
        lastCounts: counts,
        nextRunAt: new Date(now.getTime() + hour),
        ...(snapshotRead || counts.connections !== null ? { lastSnapshotAt: now } : {}),
      },
    });
    return { ...counts, skipped: null };
  } catch (error) {
    await db.linkedinSync.update({
      where: { id },
      data: {
        lastError: error instanceof Error ? error.message : "LinkedIn check failed",
        nextRunAt: new Date(now.getTime() + hour),
      },
    });
    throw error;
  } finally {
    await db.linkedinSync.update({ where: { id }, data: { leaseUntil: null } });
  }
}

export async function linkedinOverview() {
  const token = await readLinkedinToken(linkedinTokenPath("data"));
  const sync = await db.linkedinSync.findUnique({ where: { id: "linkedin" } });
  const expiresAt = token?.expiresAt ? new Date(token.expiresAt) : null;
  return {
    connected: !!token,
    expiresAt,
    expiresSoon: !!expiresAt && expiresAt.getTime() - Date.now() < 14 * day,
    lastCheckedAt: sync?.lastCheckedAt ?? null,
    lastSuccessAt: sync?.lastSuccessAt ?? null,
    lastError: sync?.lastError ?? null,
    lastCounts: (sync?.lastCounts as LinkedinCounts | null) ?? null,
    connections: await db.linkedinConnection.count(),
  };
}

export async function linkedinDue(now = new Date()) {
  if (!(await readLinkedinToken(linkedinTokenPath("data")))) return false;
  const sync = await db.linkedinSync.findUnique({ where: { id: "linkedin" } });
  return (
    !sync ||
    (sync.nextRunAt <= now && (!sync.leaseUntil || sync.leaseUntil < now))
  );
}
```

Check while implementing: the `decision`/`state` names returned by `processMessage` (store.ts:1111) are `{ id, state, decision }`; `decision.action` values are `update | attach | create | review | ignore` (see `count()` in store.ts:334). Adjust the counting if the names differ.

- [ ] **Step 4: Script** `scripts/linkedin-sync.ts` (pattern of `scripts/mail-sync.ts`):

```ts
import "dotenv/config";
import { db } from "../src/lib/db";
import { syncLinkedin } from "../src/lib/linkedin/sync";

async function main() {
  const result = await syncLinkedin();
  if (result.skipped) {
    console.error(
      result.skipped === "busy"
        ? "A LinkedIn check is already running. Try again in a few minutes."
        : `Nothing was checked (${result.skipped}).`,
    );
    process.exitCode = 1;
    return;
  }
  const { skipped, ...counts } = result;
  console.log("LinkedIn check", counts);
}
main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "LinkedIn check failed");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
```

`package.json` scripts: add `"linkedin:sync": "tsx scripts/linkedin-sync.ts"`.

- [ ] **Step 5: Worker.** In `scripts/worker.ts`: import `{ linkedinDue, syncLinkedin }`; in the `tick` handler after the mail block add:

```ts
      if ((await mailLive()) && (await linkedinDue()))
        await queue.add("linkedin-sync", {}, {
          jobId: "linkedin-sync",
          removeOnComplete: true,
          removeOnFail: true,
        });
```

and in the job switch add a branch:

```ts
    if (job.name === "linkedin-sync") {
      await syncLinkedin({ scheduled: true }).catch((error) =>
        console.error(`[worker] linkedin: ${error instanceof Error ? error.message : error}`),
      );
      return;
    }
```

(Match the existing structure of the worker's job handler; read the whole file first.)

- [ ] **Step 6: API route** `src/app/api/linkedin/route.ts`:

```ts
import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { linkedinOverview } from "@/lib/linkedin/sync";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await linkedinOverview());
  } catch (e) {
    return errorResponse(e);
  }
}
```

- [ ] **Step 7: Run tests:** `npx tsx --test --test-concurrency=1 tests/integration/linkedin.test.ts && npx tsc --noEmit && npm test`. Expected PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/linkedin/sync.ts scripts/linkedin-sync.ts scripts/worker.ts package.json src/app/api/linkedin tests/integration/linkedin.test.ts
git commit -m "feat(linkedin): hourly LinkedIn message and connection sync"
```

---

### Task 6: Connections on the Referrals tab with LinkedIn message drafts

**Files:**
- Modify: `src/lib/referrals/templates.ts` (`makeDrafts`)
- Modify: `src/app/api/jobs/[id]/referrals/route.ts` (GET adds `connections`, POST adds `add-connection`)
- Modify: `src/components/referrals.tsx`
- Test: `tests/referrals.test.ts` (unit), `tests/integration/referrals.test.ts`

- [ ] **Step 1: Failing unit test** (append to `tests/referrals.test.ts`; read the file for its existing `makeDrafts` fixture and reuse it):

```ts
test("drafts for an existing connection message them instead of asking to connect", () => {
  const drafts = makeDrafts(job, { name: "Grace Hopper", email: "" }, profile, {
    connected: true,
  });
  assert.doesNotMatch(drafts.connection, /Open to connecting/);
  assert.match(drafts.connection, /^Hi Grace,/);
  assert.match(drafts.connection, new RegExp(job.company));
  assert.ok(drafts.connection.length <= 1900, "fits a LinkedIn message");
  assert.ok(!drafts.connection.includes("—"));
});
```

- [ ] **Step 2: Implement** in `makeDrafts`, add a fourth optional parameter `options: { connected?: boolean } = {}` and, when `connected`, set `connection` to a direct message:

```ts
  const direct = `${greeting}\n\nHope you're well. I've applied for the ${job.title} role at ${job.company} and would value your view of the team and how engineering works there.\n\n${proof}\n\nIf you think I'd be a good fit, would you be open to referring me or pointing me to the hiring manager? Happy to send my CV.\n\nRole: ${job.applyUrl}\n\nThanks,\n${profile.contact.name}`;
```

and return `connection: options.connected ? direct : <existing connection note>`. Keep the other fields unchanged.

- [ ] **Step 3: API.** In `src/app/api/jobs/[id]/referrals/route.ts`:
  - GET: load the job's company (`db.job.findUnique({ where: { id: jobId }, select: { company: true } })`), call `connectionsAt(company)`, and return `connections: list.map(c => ({ id, name, position, company, profileUrl, connectedOn, saved: contacts.some(x => x.linkedin === c.profileUrl) }))` alongside the existing fields.
  - POST: add union member `z.object({ action: z.literal("add-connection"), connectionId: z.string().min(1).max(100) })`. Handler: load the connection by id (404 error if missing), then:

```ts
      const c = await db.linkedinConnection.findUniqueOrThrow({ where: { id: body.connectionId } });
      return NextResponse.json(
        await saveContact(jobId, {
          name: c.name,
          title: c.position,
          email: "",
          linkedin: c.profileUrl,
          sourceUrl: c.profileUrl,
          sourceKind: "LinkedIn connection",
          sourceNote: `1st-degree LinkedIn connection${c.connectedOn ? ` since ${c.connectedOn.toISOString().slice(0, 10)}` : ""}; current company per LinkedIn: ${c.company}`,
          emailStatus: "No email found",
        }, { connected: true }),
        { status: 201 },
      );
```

  - In `src/lib/referrals/store.ts` `saveContact(jobId, contact, options: { connected?: boolean } = {})` passes `options` to `makeDrafts`.

- [ ] **Step 4: UI** in `src/components/referrals.tsx`: extend `Data` with `connections: { id: string; name: string; position: string; company: string; profileUrl: string; connectedOn: string | null; saved: boolean }[]`. Above the contacts list render, when `data.connections.length`:

```tsx
<section className="card referral-connections" aria-label="Your LinkedIn connections here">
  <h3>You know {data.connections.length} {data.connections.length === 1 ? "person" : "people"} at {company}</h3>
  <ul>
    {data.connections.map((c) => (
      <li key={c.id}>
        <a href={c.profileUrl} target="_blank" rel="noreferrer">{c.name}</a>
        <span className="muted"> · {c.position || "Position not shown"}</span>
        <button
          disabled={busy || c.saved}
          onClick={() =>
            act(
              () => api(`/api/jobs/${jobId}/referrals`, "POST", { action: "add-connection", connectionId: c.id }).then(load),
              `${c.name} added as a referral contact`,
            )
          }
        >
          {c.saved ? "Added" : "Add as referral contact"}
        </button>
      </li>
    ))}
  </ul>
</section>
```

Use the existing `act`, `api`, `load`, `busy` in that component and its existing class names for buttons (read the file).

- [ ] **Step 5: Integration test** (append to `tests/integration/referrals.test.ts`, following its setup): seed a `LinkedinConnection` at the synthetic job's company; GET returns it in `connections` with `saved: false`; POST `add-connection` creates one referral with `linkedin` = profile URL and `drafts.connection` starting with `Hi <first name>,`; a second POST does not create a duplicate (upsert by identity); GET now shows `saved: true`. Clean up the seeded connection.

- [ ] **Step 6: Run:** `npm test && npx tsx --test --test-concurrency=1 tests/integration/referrals.test.ts && npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add src/lib/referrals src/app/api/jobs src/components/referrals.tsx tests/referrals.test.ts tests/integration/referrals.test.ts
git commit -m "feat(referrals): show LinkedIn connections at the company and add them as contacts"
```

---

### Task 7: LinkedIn status on the overview; LinkedIn links

**Files:**
- Modify: `src/components/mail.tsx` (link helper, `LinkedinConnectionCard`)
- Modify: `src/components/dashboard.tsx` (render the card next to `MailConnection` at ~line 1736, fetch `/api/linkedin`)

- [ ] **Step 1:** In `mail.tsx` replace the `gmail` helper with:

```ts
const threadLink = (threadId: string) =>
  threadId.startsWith("linkedin:")
    ? `https://www.linkedin.com/messaging/thread/${encodeURIComponent(threadId.slice(9))}/`
    : `https://mail.google.com/mail/u/0/#all/${threadId}`;
```

and update its uses; where the UI says "Open in Gmail", show "Open on LinkedIn" for `linkedin:` threads.

- [ ] **Step 2:** Add `export function LinkedinConnectionCard({ status })` in `mail.tsx`, same markup/classes as `MailConnection`: title "LinkedIn updates · read-only"; not connected: "Run `npm run linkedin:connect -- --data`"; connected: "N connections. Messages checked every hour while Jobdesk is running."; `expiresSoon`: warning "Access expires <date>: run `npm run linkedin:connect -- --data`"; `lastError` in `danger`; health tag and "Last check …" like Gmail.

- [ ] **Step 3:** In `dashboard.tsx`, fetch `/api/linkedin` where the mail overview is fetched (same effect/refresh), store it in state, and render `<LinkedinConnectionCard status={linkedin} />` right after `<MailConnection … />`.

- [ ] **Step 4:** `npx tsc --noEmit && npm test`; with the dev server running, open https://jobdesk.localhost and confirm the card renders (screenshot to `.context/linkedin-card.png`).

- [ ] **Step 5: Commit**

```bash
git add src/components/mail.tsx src/components/dashboard.tsx
git commit -m "feat(dashboard): LinkedIn status card and LinkedIn thread links"
```

---

### Task 8: Docs and live run

- [ ] **Step 1:** README: under "LinkedIn jobs" add a "LinkedIn messages and connections" paragraph: what is read, hourly schedule, `npm run linkedin:sync`, that messages follow mail rules and never create cards, that connections appear on each job's Referrals tab, token expiry and reconnect command, data stays local.
- [ ] **Step 2:** Live: `npm run linkedin:sync` once; report counts only (no message content). Expected: connections ~1.5k, read = messages in the last 30 days from others, few candidates.
- [ ] **Step 3:** Commit `docs: LinkedIn sync usage`.

---

## Self-review

- Spec coverage: client (T2), messages (T3), company-of-sender rule (T1 matcher + T4 `companyOfSender` + T5), connections table/lookup (T1, T4), sync/worker/command (T5), UI Referrals + overview + links (T6, T7), privacy (no git, local DB), errors (T2 auth/retry, T5 lastError, T7 expiry), testing (each task). The spec's "card shows connection count" is delivered on the job's Referrals tab only; the list view count is left out (YAGNI) and noted in README.
- Types: `RawMail.senderCompany` (T1) used in T5; `LinkedinDataClient` (T2) used in T5; `companyKey/keysMatch/rank/toConnection/refreshConnections/connectionsAt/companyOfSender` (T4) used in T5/T6; `makeDrafts(..., { connected })` and `saveContact(..., { connected })` (T6).
