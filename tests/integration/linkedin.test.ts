import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { classify } from "../../src/lib/mail/classify";
import { matchMail, normalizeCompany } from "../../src/lib/mail/match";
import { classifyByRules } from "../../src/lib/mail/rules";
import type {
  AiClassifier,
  BoardApplication,
  Classification,
} from "../../src/lib/mail/types";
import { companyKey } from "../../src/lib/linkedin/connections";
import type {
  ChangelogEvent,
  LinkedinDataClient,
  SnapshotDomain,
} from "../../src/lib/linkedin/data";
import { fromSnapshot } from "../../src/lib/linkedin/messages";
import { syncLinkedin } from "../../src/lib/linkedin/sync";

// Runs against the local Jobdesk database. Every row it writes carries the random tag below:
// synthetic companies, conversation ids and profile URLs. LinkedIn is a fake client in this
// file and is never called; Claude is a function in this file. The check state lives under
// its own LinkedinSync id and its own mail live switch, so the real rows are never written.
// The fake export has no CONNECTIONS (LinkedIn "not ready"): a complete connections snapshot
// replaces the stored ones, which would remove the member's real connections.
const tag = randomUUID().replaceAll("-", "").slice(0, 12);
const syncId = "linkedin-test";
const mailCheckId = `linkedintest-${tag}`;
process.env.MAIL_SYNC_ID = mailCheckId;
delete process.env.MAIL_SECOND_OPINION;
const me = `Litest${tag} Member`;
const company = (letter: string) => `Litest${tag}${letter}`;
const [a, b] = ["A", "B"].map(company);
const profile = (n: number) =>
  `https://www.linkedin.com/in/test-li-${tag}-${n}`;
const conversation = (name: string) => `test-li-${tag}-${name}`;
const now = new Date(Math.floor(Date.now() / 1000) * 1000);
const daysAgo = (days: number) => new Date(now.valueOf() - days * 86_400_000);
// The export's own date format: seconds, " UTC".
const stamp = (at: Date) =>
  `${at.toISOString().slice(0, 19).replace("T", " ")} UTC`;
const row = (values: {
  name: string;
  from: string;
  url: string;
  content: string;
  at: Date;
}) => ({
  "CONVERSATION ID": conversation(values.name),
  "CONVERSATION TITLE": "",
  FROM: values.from,
  "SENDER PROFILE URL": values.url,
  TO: me,
  DATE: stamp(values.at),
  SUBJECT: "",
  CONTENT: values.content,
  FOLDER: "INBOX",
});
const turnedDown =
  "Hi Arinze,\n\nUnfortunately we decided not to move forward with your application.";
// 1. From a stored connection at card A's company, by profile URL.
const known = row({
  name: "known",
  from: `Litest${tag} Sender`,
  url: profile(1),
  content: turnedDown,
  at: daysAgo(1),
});
// The same rejection from someone who is not a connection.
const stranger = row({
  name: "stranger",
  from: `Litest${tag} Stranger`,
  url: profile(9),
  content: turnedDown,
  at: daysAgo(1),
});
// From a stored connection at card B's company; LinkedIn gave no profile URL.
const nameOnly = row({
  name: "name-only",
  from: `Litest${tag} Namesake`,
  url: "",
  content: turnedDown,
  at: daysAgo(2),
});
// No hiring words, unknown sender: not stored.
const personal = row({
  name: "personal",
  from: `Litest${tag} Friend`,
  url: profile(7),
  content: "Hey, are you coming to the barbecue on Saturday?",
  at: daysAgo(1),
});
// The member's own reply, with the name the other way round than in contact.json.
const ownReply = row({
  name: "known",
  from: `Member Litest${tag}`,
  url: profile(0),
  content: "Thank you for letting me know about my application.",
  at: daysAgo(0.5),
});
// Older than the first check's 30 days.
const old = row({
  name: "old",
  from: `Litest${tag} Stranger`,
  url: profile(9),
  content: "About your application from last spring.",
  at: daysAgo(40),
});
const inbox = [known, stranger, nameOnly, personal, ownReply, old];
// The same rejection as `known`, read from the changelog: same id, so read once.
const knownEvent: ChangelogEvent = {
  resourceName: "messages",
  method: "CREATE",
  processedAt: daysAgo(1).valueOf() + 500,
  activity: {
    thread: `urn:li:messagingThread:${conversation("known")}`,
    createdAt: daysAgo(1).valueOf() + 400,
    content: { content: { string: turnedDown } },
  },
  processedActivity: {
    "author~": {
      localizedFirstName: `Litest${tag}`,
      localizedLastName: "Sender",
      vanityName: `test-li-${tag}-1`,
    },
  },
};

const asked: string[] = [];
const fake = (
  rows: Record<string, string>[],
  events: ChangelogEvent[] = [],
): LinkedinDataClient => ({
  snapshot: async (domain: SnapshotDomain) => {
    asked.push(`snapshot:${domain}`);
    return domain === "INBOX" ? rows : null;
  },
  changes: async (since: Date) => {
    asked.push("changes");
    return events.filter(
      (event) => Number(event.processedAt) >= since.valueOf(),
    );
  },
});
// Claude agrees with the rules, with high confidence.
const reading = (values: Partial<Classification>): Classification => ({
  category: "unrelated",
  confidence: "high",
  decidedBy: "ai",
  evidenceQuote: null,
  company: null,
  role: null,
  nextStep: null,
  deadline: null,
  ...values,
});
const claude: AiClassifier = async (item) =>
  reading({ ...classifyByRules(item), confidence: "high", decidedBy: "ai" });
const run = (client: LinkedinDataClient, extra: { scheduled?: boolean } = {}) =>
  syncLinkedin({ client, ai: claude, now, syncId, me, ...extra });
const job = (name: string, title: string) => ({
  canonicalKey: `litest-${tag}-${name}`,
  title,
  company: name,
  location: "Berlin",
  countries: ["DE"],
  description: "Synthetic LinkedIn sync fixture.",
  applyUrl: `https://example.com/litest-${tag}-${name}`,
  track: "Frontend",
  skills: [],
  score: 50,
  reasons: [],
  contentHash: `litest-${tag}-${name}`,
});
const ours = { threadId: { startsWith: `linkedin:test-li-${tag}-` } };
const stored = (item: Record<string, string>) =>
  db.mailMessage.findUniqueOrThrow({
    where: { gmailId: fromSnapshot(item, me)!.gmailId },
  });

async function step(name: string, work: () => Promise<void>) {
  try {
    await work();
  } catch (error) {
    if (error instanceof Error) error.message = `${name}: ${error.message}`;
    throw error;
  }
}

test("LinkedIn sync against the local database, synthetic rows only", async () => {
  const realApplications = await db.application.findMany({
    include: { job: { select: { company: true, title: true } } },
  });
  const realBoard: BoardApplication[] = realApplications.map((item) => ({
    id: item.id,
    company: item.job.company,
    title: item.job.title,
    status: item.status,
    origin: item.origin,
    submittedAt: item.submittedAt,
    threadIds: [],
  }));
  const before = {
    connections: await db.linkedinConnection.count(),
    sync: await db.linkedinSync.findUnique({ where: { id: "linkedin" } }),
  };
  // Nothing has been written yet: these stop the test before it can reach real data.
  assert.ok(
    realBoard.every(
      (item) => !normalizeCompany(item.company).startsWith("litest"),
    ),
    "a real application looks like a test fixture",
  );
  for (const [item, senderCompany] of [
    [known, a],
    [stranger, undefined],
    [nameOnly, b],
  ] as const) {
    const mail = { ...fromSnapshot(item, me)!, senderCompany };
    const match = matchMail(mail, await classify(mail, null), realBoard);
    assert.equal(match.kind, "none", "a synthetic message matches a real card");
  }
  assert.equal(
    await db.linkedinSync.count({ where: { id: syncId } }),
    0,
    "a LinkedIn test run did not clean up",
  );

  let strays = 0;
  try {
    const fixture = async (name: string, title: string) => {
      const made = await db.job.create({ data: job(name, title) });
      return db.application.create({
        data: {
          jobId: made.id,
          status: "submitted",
          submittedAt: daysAgo(10),
          createdAt: daysAgo(30),
        },
      });
    };
    const appA = await fixture(a, "Senior Frontend Engineer");
    const appB = await fixture(b, "Frontend Engineer");
    await db.linkedinConnection.createMany({
      data: [
        {
          profileUrl: profile(1),
          name: `Litest${tag} Sender`,
          company: a,
          companyKey: companyKey(a),
          position: "Engineering Manager",
        },
        {
          profileUrl: profile(2),
          name: `Litest${tag} Namesake`,
          company: b,
          companyKey: companyKey(b),
          position: "Recruiter",
        },
      ],
    });

    await step(
      "0. a scheduled run waits for the mail live switch",
      async () => {
        const result = await run(fake(inbox, [knownEvent]), {
          scheduled: true,
        });
        assert.equal(result.skipped, "mail-not-live");
        assert.deepEqual(asked, []);
        assert.equal(await db.linkedinSync.count({ where: { id: syncId } }), 0);
      },
    );

    await step(
      "1. a rejection from a known connection updates that card; one from a stranger waits for review",
      async () => {
        const result = await run(fake(inbox, [knownEvent]));
        assert.equal(result.skipped, null);
        assert.deepEqual(asked, [
          "snapshot:CONNECTIONS",
          "snapshot:INBOX",
          "changes",
        ]);
        // Not ready on LinkedIn's side: nothing was replaced.
        assert.equal(result.connections, null);
        // known (twice, one id), stranger, nameOnly, personal; not the own reply, not the old one.
        assert.equal(result.read, 4);
        assert.equal(result.candidates, 3);
        assert.equal(result.applied, 2);
        assert.equal(result.review, 1);
        assert.equal(result.ignored, 1);
        assert.equal(result.failed, 0);

        assert.equal(
          (await db.application.findUniqueOrThrow({ where: { id: appA.id } }))
            .status,
          "rejected",
        );
        const fromKnown = await stored(known);
        assert.match(fromKnown.gmailId, /^linkedin:/);
        assert.equal(fromKnown.applicationId, appA.id);
        assert.equal(fromKnown.senderCompany, a);

        const fromStranger = await stored(stranger);
        assert.equal(fromStranger.state, "needs_review");
        assert.equal(fromStranger.applicationId, null);

        // 2. No profile URL: the sender is found by name.
        const fromNamesake = await stored(nameOnly);
        assert.equal(fromNamesake.senderCompany, b);
        assert.equal(fromNamesake.applicationId, appB.id);
        assert.equal(
          (await db.application.findUniqueOrThrow({ where: { id: appB.id } }))
            .status,
          "rejected",
        );

        // 4. The personal message and the member's own reply are not stored.
        assert.equal(await db.mailMessage.count({ where: ours }), 3);

        const state = await db.linkedinSync.findUniqueOrThrow({
          where: { id: syncId },
        });
        assert.equal(state.leaseUntil, null);
        assert.equal(state.lastError, null);
        assert.equal(state.lastSuccessAt?.valueOf(), now.valueOf());
        assert.equal(state.lastSnapshotAt?.valueOf(), now.valueOf());
        assert.equal(state.nextRunAt.valueOf(), now.valueOf() + 3600_000);
      },
    );

    await step("3. running again stores nothing twice", async () => {
      asked.length = 0;
      // Within the hour: no snapshot is due, and the window starts an hour before the last run.
      const again = await run(fake(inbox, [knownEvent]));
      assert.deepEqual(asked, ["changes"]);
      assert.equal(again.read, 0);
      assert.equal(again.applied + again.review + again.attached, 0);
      // As a first run again: every message is read, and every one is already stored.
      await db.linkedinSync.delete({ where: { id: syncId } });
      const repeat = await run(fake(inbox, [knownEvent]));
      assert.equal(repeat.read, 4);
      assert.equal(repeat.candidates, 3);
      assert.equal(repeat.applied + repeat.review + repeat.attached, 0);
      assert.equal(repeat.ignored, 4);
      assert.equal(await db.mailMessage.count({ where: ours }), 3);
    });

    await step(
      "a failed LinkedIn read is recorded and frees the lease",
      async () => {
        const broken: LinkedinDataClient = {
          snapshot: async () => null,
          changes: async () => {
            throw new Error("LinkedIn answered 500");
          },
        };
        await assert.rejects(run(broken), /LinkedIn answered 500/);
        const state = await db.linkedinSync.findUniqueOrThrow({
          where: { id: syncId },
        });
        assert.equal(state.lastError, "LinkedIn answered 500");
        assert.equal(state.leaseUntil, null);
      },
    );

    await step("a check that holds the lease is not run twice", async () => {
      await db.linkedinSync.update({
        where: { id: syncId },
        data: { leaseUntil: new Date(Date.now() + 60_000) },
      });
      asked.length = 0;
      assert.equal((await run(fake(inbox))).skipped, "busy");
      assert.deepEqual(asked, []);
    });
  } finally {
    strays = await db.mailMessage.count({
      where: {
        ...ours,
        applicationId: { not: null },
        NOT: {
          application: { job: { company: { startsWith: `Litest${tag}` } } },
        },
      },
    });
    const jobs = await db.job.findMany({
      where: { canonicalKey: { startsWith: `litest-${tag}-` } },
      select: { id: true },
    });
    const jobIds = jobs.map((item) => item.id);
    await db.applicationEvent.deleteMany({
      where: { application: { jobId: { in: jobIds } } },
    });
    await db.mailMessage.deleteMany({ where: ours });
    await db.application.deleteMany({ where: { jobId: { in: jobIds } } });
    await db.job.deleteMany({ where: { id: { in: jobIds } } });
    await db.linkedinConnection.deleteMany({
      where: {
        profileUrl: { startsWith: "https://www.linkedin.com/in/test-li-" },
      },
    });
    await db.linkedinSync.deleteMany({ where: { id: syncId } });
    await db.setting.deleteMany({ where: { key: `mailLive:${mailCheckId}` } });
  }

  assert.equal(strays, 0, "a synthetic message reached a real application");
  assert.equal(await db.linkedinConnection.count(), before.connections);
  assert.deepEqual(
    await db.linkedinSync.findUnique({ where: { id: "linkedin" } }),
    before.sync,
  );
  assert.equal(await db.mailMessage.count({ where: ours }), 0);
});

test.after(() => db.$disconnect());
