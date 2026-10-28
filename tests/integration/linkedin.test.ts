import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { classify } from "../../src/lib/mail/classify";
import { matchMail, normalizeCompany } from "../../src/lib/mail/match";
import { classifyByRules } from "../../src/lib/mail/rules";
import { mailLive, resolveReview, setMailLive } from "../../src/lib/mail/store";
import type {
  AiClassifier,
  BoardApplication,
  Classification,
} from "../../src/lib/mail/types";
import {
  companyKey,
  companyOfSender,
} from "../../src/lib/linkedin/connections";
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
// The fake CONNECTIONS export is always marked incomplete and lists synthetic people only: a
// complete connections snapshot replaces the stored ones, which would remove the member's
// real connections, while an incomplete one only adds and updates the rows it lists.
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
// The message names the company; the sender's stored connection only confirms it.
const turnedDown = (name: string) =>
  `Hi Arinze,\n\nThank you for your application to ${name}. Unfortunately we decided not to move forward with your application.`;
// 1. From a stored connection at card A's company, by profile URL.
const known = row({
  name: "known",
  from: `Litest${tag} Sender`,
  url: profile(1),
  content: turnedDown(a),
  at: daysAgo(1),
});
// The same rejection from someone who is not a connection.
const stranger = row({
  name: "stranger",
  from: `Litest${tag} Stranger`,
  url: profile(9),
  content: turnedDown(a),
  at: daysAgo(1),
});
// From a stored connection at card B's company; LinkedIn gave no profile URL.
const nameOnly = row({
  name: "name-only",
  from: `Litest${tag} Namesake`,
  url: "",
  content: turnedDown(b),
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
    content: { content: { string: turnedDown(a) } },
  },
  processedActivity: {
    "author~": {
      localizedFirstName: `Litest${tag}`,
      localizedLastName: "Sender",
      vanityName: `test-li-${tag}-1`,
    },
  },
};

// One synthetic connection at card A's company, never one of the member's real ones.
const colleagues = [
  {
    "First Name": `Litest${tag}`,
    "Last Name": "Colleague",
    URL: profile(3),
    Company: a,
    Position: "Software Engineer",
  },
];
const asked: string[] = [];
const fake = (
  rows: Record<string, string>[],
  events: ChangelogEvent[] = [],
  options: {
    // null: LinkedIn has not prepared the domain; "fail": the read throws.
    connections?: Record<string, string>[] | null | "fail";
    inbox?: "ready" | null;
    hook?: (step: string) => Promise<void> | void; // runs as each read starts
  } = {},
): LinkedinDataClient => ({
  snapshot: async (domain: SnapshotDomain) => {
    asked.push(`snapshot:${domain}`);
    await options.hook?.(`snapshot:${domain}`);
    if (domain === "INBOX")
      return options.inbox === null ? null : { rows, complete: true };
    const people =
      options.connections === undefined ? colleagues : options.connections;
    if (people === "fail") throw new Error("LinkedIn answered 502");
    return people && { rows: people, complete: false };
  },
  changes: async (since: Date) => {
    asked.push("changes");
    await options.hook?.("changes");
    return events.filter(
      (event) => Number(event.processedAt) >= since.valueOf(),
    );
  },
});
// A changelog message from the stored connection at card A's company.
const fromKnown = (
  name: string,
  at: Date,
  text: string,
  firstName = `Litest${tag}`,
): ChangelogEvent => ({
  resourceName: "messages",
  method: "CREATE",
  processedAt: at.valueOf() + 100,
  activity: {
    thread: `urn:li:messagingThread:${conversation(name)}`,
    createdAt: at.valueOf(),
    content: { content: { string: text } },
  },
  processedActivity: {
    "author~": {
      localizedFirstName: firstName,
      localizedLastName: "Sender",
      vanityName: `test-li-${tag}-1`,
    },
  },
});
const thread = (name: string) => ({
  threadId: `linkedin:${conversation(name)}`,
});
const state = () =>
  db.linkedinSync.findUniqueOrThrow({ where: { id: syncId } });
const setState = (data: {
  lastSuccessAt?: Date | null;
  lastSnapshotAt?: Date | null;
}) => db.linkedinSync.update({ where: { id: syncId }, data });
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
    where: { gmailId: fromSnapshot(item)!.gmailId },
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
    live: await db.setting.findUnique({ where: { key: "mailLive" } }),
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
    const mail = { ...fromSnapshot(item)!, senderCompany };
    const match = matchMail(mail, await classify(mail, null), realBoard);
    assert.equal(match.kind, "none", "a synthetic message matches a real card");
  }
  assert.equal(
    await db.linkedinSync.count({ where: { id: syncId } }),
    0,
    "a LinkedIn test run did not clean up",
  );
  assert.equal(await mailLive(), false, "the test's live switch is already on");

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
      "0. scheduled and manual runs wait for the mail live switch",
      async () => {
        for (const scheduled of [true, false]) {
          const result = await run(fake(inbox, [knownEvent]), { scheduled });
          assert.equal(result.skipped, "mail-not-live");
        }
        assert.deepEqual(asked, []);
        assert.equal(await db.linkedinSync.count({ where: { id: syncId } }), 0);
        // This file's own switch (MAIL_SYNC_ID), never the real one.
        await setMailLive(true);
      },
    );

    await step(
      "0b. a check waits while a mail dry run's proposals wait",
      async () => {
        const waiting = await db.mailMessage.create({
          data: {
            gmailId: `linkedin:test-li-${tag}-proposed`,
            threadId: `linkedin:${conversation("proposed")}`,
            fromAddress: "",
            subject: "Synthetic proposal",
            receivedAt: daysAgo(1),
            bodyText: "Synthetic, never applied.",
            category: "unrelated",
            confidence: "high",
            decidedBy: "test",
            state: "proposed",
          },
        });
        try {
          const result = await run(fake(inbox, [knownEvent]));
          assert.equal(result.skipped, "pending-proposals");
          assert.deepEqual(asked, []);
          assert.equal(
            await db.linkedinSync.count({ where: { id: syncId } }),
            0,
          );
        } finally {
          await db.mailMessage.delete({ where: { id: waiting.id } });
        }
      },
    );

    await step(
      "a profile URL that is not stored is not looked up by name",
      async () => {
        assert.equal(await companyOfSender("", `Litest${tag} Namesake`), b);
        assert.equal(
          await companyOfSender(profile(5), `Litest${tag} Namesake`),
          null,
        );
        assert.equal(
          await companyOfSender(
            profile(1).replace(`test-li-${tag}-1`, `TEST-LI-${tag}-1`),
            "",
          ),
          a,
        );
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
        // The synthetic connection was added; an incomplete snapshot removes none.
        assert.equal(result.connections, 1);
        assert.equal(
          (await companyOfSender(profile(3), ""))?.valueOf(),
          a,
          "the connection snapshot was not stored",
        );
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
        const byKnown = await stored(known);
        assert.match(byKnown.gmailId, /^linkedin:/);
        assert.equal(byKnown.applicationId, appA.id);
        assert.equal(byKnown.senderCompany, a);

        const fromStranger = await stored(stranger);
        assert.equal(fromStranger.state, "needs_review");
        assert.equal(fromStranger.applicationId, null);
        assert.match(
          fromStranger.matchReason,
          /^The LinkedIn sender's company is unknown or does not match\./,
        );
        // A reviewer cannot start a card from a LinkedIn message.
        await assert.rejects(
          resolveReview(fromStranger.id, {
            category: "rejection",
            applicationId: "new",
          }),
          {
            message:
              "LinkedIn messages cannot start a card. Add the application by hand, then link this message to it.",
          },
        );
        assert.equal((await stored(stranger)).state, "needs_review");

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

        const after = await state();
        assert.equal(after.leaseUntil, null);
        assert.equal(after.lastError, null);
        assert.equal(after.lastSuccessAt?.valueOf(), now.valueOf());
        // Both CONNECTIONS and INBOX were read.
        assert.equal(after.lastSnapshotAt?.valueOf(), now.valueOf());
        assert.equal(after.nextRunAt.valueOf(), now.valueOf() + 3600_000);
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
      "connections are read daily; the inbox only when the last success is over 20 days old",
      async () => {
        // A day-old snapshot and a recent success: the changelog covers the window.
        await setState({
          lastSnapshotAt: daysAgo(2),
          lastSuccessAt: daysAgo(1),
        });
        asked.length = 0;
        let result = await run(fake(inbox, [knownEvent]));
        assert.deepEqual(asked, ["snapshot:CONNECTIONS", "changes"]);
        assert.equal(result.connections, 1);
        assert.equal((await state()).lastSnapshotAt?.valueOf(), now.valueOf());

        // CONNECTIONS not ready: no snapshot is recorded, so the next hour asks again.
        await setState({
          lastSnapshotAt: daysAgo(2),
          lastSuccessAt: daysAgo(1),
        });
        asked.length = 0;
        result = await run(fake(inbox, [knownEvent], { connections: null }));
        assert.deepEqual(asked, ["snapshot:CONNECTIONS", "changes"]);
        assert.equal(result.connections, null);
        let after = await state();
        assert.equal(after.lastSnapshotAt?.valueOf(), daysAgo(2).valueOf());
        assert.equal(after.lastSuccessAt?.valueOf(), now.valueOf());

        // Last success 21 days ago: the inbox is read too. Not ready: asked again next hour.
        await setState({
          lastSnapshotAt: daysAgo(2),
          lastSuccessAt: daysAgo(21),
        });
        asked.length = 0;
        result = await run(fake(inbox, [knownEvent], { inbox: null }));
        assert.deepEqual(asked, [
          "snapshot:CONNECTIONS",
          "snapshot:INBOX",
          "changes",
        ]);
        assert.equal(result.connections, 1);
        after = await state();
        assert.equal(after.lastSnapshotAt?.valueOf(), daysAgo(2).valueOf());
      },
    );

    await step(
      "a failed connections refresh is recorded and the messages are still processed",
      async () => {
        await setState({
          lastSnapshotAt: daysAgo(2),
          lastSuccessAt: daysAgo(1),
        });
        const late = fromKnown("late", daysAgo(0.5), turnedDown(a));
        const result = await run(
          fake(inbox, [knownEvent, late], { connections: "fail" }),
        );
        assert.equal(result.skipped, null);
        assert.equal(result.connections, null);
        assert.equal(result.candidates, 2);
        assert.equal(await db.mailMessage.count({ where: thread("late") }), 1);
        const after = await state();
        assert.match(
          after.lastError ?? "",
          /connections.*LinkedIn answered 502/,
        );
        assert.equal(after.lastSuccessAt?.valueOf(), now.valueOf());
        assert.equal(after.lastSnapshotAt?.valueOf(), daysAgo(2).valueOf());
        assert.equal(after.leaseUntil, null);
      },
    );

    await step(
      "a message that fails is read again by the next check",
      async () => {
        // Postgres refuses a NUL in the sender's name, so storing this message throws. The id
        // depends on the conversation, time and text, so the clean copy below is the same message.
        const at = new Date(now.valueOf() - 30 * 60_000);
        const text = turnedDown(a);
        const broken = fromKnown("retry", at, text, `Litest${tag}\u0000`);
        const first = await run(fake(inbox, [broken]));
        assert.equal(first.failed, 1);
        assert.equal(await db.mailMessage.count({ where: thread("retry") }), 0);
        // The window of the next check starts an hour before the failed message.
        assert.equal((await state()).lastSuccessAt?.valueOf(), at.valueOf());

        const second = await run(fake(inbox, [fromKnown("retry", at, text)]));
        assert.equal(second.failed, 0);
        assert.equal(second.candidates, 1);
        assert.equal(await db.mailMessage.count({ where: thread("retry") }), 1);
        assert.equal((await state()).lastSuccessAt?.valueOf(), now.valueOf());
      },
    );

    await step("a long fetch keeps the lease", async () => {
      await setState({ lastSnapshotAt: daysAgo(2), lastSuccessAt: daysAgo(1) });
      // The lease's clock is moved past the 10-minute lease while CONNECTIONS is read.
      const realNow = Date.now;
      let shift = 0;
      let leaseAtChanges: Date | null = null;
      Date.now = () => realNow() + shift;
      try {
        const result = await run(
          fake(inbox, [knownEvent], {
            hook: async (at) => {
              if (at === "snapshot:CONNECTIONS") shift = 11 * 60_000;
              if (at === "changes") leaseAtChanges = (await state()).leaseUntil;
            },
          }),
        );
        assert.equal(result.skipped, null);
        const held = leaseAtChanges as Date | null;
        assert.ok(
          held && held.valueOf() > Date.now(),
          "the lease ran out while the snapshot was read",
        );
      } finally {
        Date.now = realNow;
      }
      assert.equal((await state()).leaseUntil, null);
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
        const after = await state();
        assert.equal(after.lastError, "LinkedIn answered 500");
        assert.equal(after.leaseUntil, null);
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
  assert.deepEqual(
    await db.setting.findUnique({ where: { key: "mailLive" } }),
    before.live,
  );
  assert.equal(await db.mailMessage.count({ where: ours }), 0);
});

test.after(() => db.$disconnect());
