import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { hash } from "../../src/lib/domain";
import { classify } from "../../src/lib/mail/classify";
import {
  MailAuthError,
  MailNotFoundError,
  MailProviderError,
} from "../../src/lib/mail/gmail";
import { matchMail, normalizeCompany } from "../../src/lib/mail/match";
import { classifyByRules } from "../../src/lib/mail/rules";
import {
  addInterview,
  applyProposals,
  completeNextStep,
  discardProposals,
  ignoreMail,
  isCandidate,
  leaseKeeper,
  mailForApplication,
  mailLive,
  mailOverview,
  processMessage,
  proposalSummary,
  interviewsFromStoredMail,
  reclassifyMail,
  requeueStalePrep,
  resolveReview,
  setMailLive,
  syncMail,
  undoMail,
  unlinkMail,
} from "../../src/lib/mail/store";
import type {
  AiClassifier,
  BoardApplication,
  Classification,
  MailClient,
  RawMail,
} from "../../src/lib/mail/types";

// This runs against the local Jobdesk database, which holds real applications. Every row it
// writes carries the random tag below, the fake Gmail client only returns these mails, and
// the test refuses to start when one of them could match a real application. Its check
// state (lease, window, live switch) lives under its own id, so the real MailSync row and
// the real `mailLive` setting are never written. Claude is a function in this file.
const tag = randomUUID().replaceAll("-", "").slice(0, 12);
const prefix = `mailtest-${tag}-`;
const checkId = `mailtest-${tag}`;
const liveKey = `mailLive:${checkId}`;
process.env.MAIL_SYNC_ID = checkId;
delete process.env.MAIL_SECOND_OPINION;
const company = (letter: string) => `Mailtest${tag}${letter}`;
const now = new Date();
const daysAgo = (days: number) => new Date(now.valueOf() - days * 86_400_000);
const dueIn = (days: number) =>
  new Date(
    `${new Date(now.valueOf() + days * 86_400_000).toISOString().slice(0, 10)}T00:00:00Z`,
  );
const due = dueIn(5);
const mail = (name: string, values: Partial<RawMail>): RawMail => ({
  gmailId: `${prefix}${name}`,
  threadId: `${prefix}thread-${name}`,
  fromAddress: "no-reply@ashbyhq.com",
  fromName: "",
  subject: "",
  receivedAt: daysAgo(1),
  bodyText: "",
  fromMe: false,
  ...values,
});
const [a, b, c, d, h, k, n, p, q, r, s, u, v] = [..."abcdhknpqrsuv"].map(
  company,
);
const own = (name: string) => ({
  fromAddress: `jobs@${name.toLowerCase()}.example`,
  fromName: `${name} Recruiting`,
});
const turnedDown = (name: string) =>
  `Hi Arinze,\n\nThank you for your interest in ${name}. Unfortunately, we have decided not to move forward with your application.`;
// A rejection through the hiring system for the card at `name`, which has this `role`.
const rejectionFor = (key: string, name: string, role: string, days: number) =>
  mail(key, {
    fromName: `${name} Hiring Team`,
    subject: `Update on your application to ${name}`,
    receivedAt: daysAgo(days),
    bodyText: `Hi Arinze,\n\nUnfortunately, we have decided not to move forward with your application for the ${role} role.`,
  });
const newsletter = mail("newsletter", {
  fromAddress: `news@nlx${tag}.example`,
  subject: "Five long reads for the weekend",
  bodyText: "Nothing here is about work.",
});
const confirmation = mail("confirmation", {
  fromName: `${a} Hiring Team`,
  subject: `Thanks for applying to ${a}!`,
  receivedAt: daysAgo(3),
  bodyText: `Hi Arinze,\n\nWe have received your application for the Senior Frontend Engineer role at ${a}. Our team will review it and get back to you.`,
});
const interview = mail("interview", {
  ...own(a),
  subject: `Invitation to interview at ${a}`,
  receivedAt: daysAgo(1),
  bodyText: `Hi Arinze,\n\nWe would like to invite you to an interview for the Senior Frontend Engineer role. Please book a slot by ${due.toISOString().slice(0, 10)}.`,
});
const secondRound = mail("second-round", {
  ...own(a),
  subject: `Invitation to second interview at ${a}`,
  receivedAt: daysAgo(0.5),
  bodyText: `Hi Arinze,\n\nWe would like to invite you to a second interview for the Senior Frontend Engineer role. Please confirm your availability by ${dueIn(7).toISOString().slice(0, 10)}.`,
});
const lateOlder = mail("late-older", {
  ...own(a),
  subject: `Invitation to interview at ${a}`,
  receivedAt: daysAgo(2),
  bodyText: `Hi Arinze,\n\nWe would like to invite you to an interview for the Senior Frontend Engineer role. Please send us your availability by ${dueIn(3).toISOString().slice(0, 10)}.`,
});
// Older than the interview invitation that will have moved the card by the time these arrive.
const olderRejection = rejectionFor(
  "older-rejection",
  a,
  "Senior Frontend Engineer",
  1.5,
);
const olderRejectionDry = rejectionFor(
  "older-rejection-dry",
  a,
  "Senior Frontend Engineer",
  2,
);
const rejection = mail("rejection", {
  fromName: `${b} Hiring Team`,
  subject: `${b}: We're moving forward with other candidates`,
  bodyText: turnedDown(b),
});
// A second mail in the thread of the mail that created the card for b.
const threadMate = mail("thread-mate", {
  threadId: rejection.threadId,
  fromName: `${b} Hiring Team`,
  subject: `Update on your application to ${b}`,
  receivedAt: daysAgo(0.5),
  bodyText:
    "Hi Arinze,\n\nUnfortunately, we have decided not to move forward with your application.",
});
// No hiring system behind it and no role in it: not enough to start a card.
const noRole = mail("no-role", {
  ...own(n),
  subject: `${n}: We're moving forward with other candidates`,
  bodyText: turnedDown(n),
});
const rejectionH = rejectionFor("rejection-h", h, "Backend Engineer", 1);
const rejectionQ = rejectionFor("rejection-q", q, "Data Engineer", 1);
const rejectionR = rejectionFor("rejection-r", r, "Data Engineer", 1);
const rejectionS = rejectionFor("rejection-s", s, "Data Engineer", 1);
const ownName = mail("own-name", {
  fromName: "Ashby",
  subject: "Ogbonna - We have received your application!",
  bodyText:
    "Hi Ogbonna, We have received your application and will review it shortly.",
});
const proposedReceipt = mail("proposed-receipt", {
  fromName: `${d} Hiring Team`,
  subject: `Thanks for applying to ${d}!`,
  receivedAt: daysAgo(6),
  bodyText: `Hi Arinze,\n\nWe have received your application for the Fullstack Engineer role at ${d}.`,
});
// A receipt for a card that is still only prepared: it needs the second reader.
const proposedReceiptH = mail("proposed-receipt-h", {
  fromName: `${h} Hiring Team`,
  subject: `Thanks for applying to ${h}!`,
  receivedAt: daysAgo(5),
  bodyText: `Hi Arinze,\n\nWe have received your application for the Backend Engineer role at ${h}.`,
});
const proposedClosing = mail("proposed-closing", {
  fromName: `${d} Hiring Team`,
  subject: `${d}: We're moving forward with other candidates`,
  receivedAt: daysAgo(2.2),
  bodyText: turnedDown(d),
});
const proposedRejection = rejectionFor(
  "proposed-rejection",
  c,
  "Product Engineer",
  1,
);
const proposedK = rejectionFor("proposed-k", k, "Platform Engineer", 0.75);
const proposedU = rejectionFor("proposed-u", u, "Platform Engineer", 0.6);
const proposedV = rejectionFor("proposed-v", v, "Platform Engineer", 0.55);
const waiting = {
  subject: "Update on your application",
  bodyText: "Thank you for your patience, we will get back to you next week.",
};
const undecided = ["e", "f", "g", "t"].map((letter) =>
  mail(`undecided-${letter}`, { ...own(company(letter)), ...waiting }),
);
const undecidedP = mail("undecided-p", { ...own(p), ...waiting });
const secondReceipt = mail("second-receipt", {
  fromName: `${a} Hiring Team`,
  subject: `Thanks for applying to ${a}!`,
  receivedAt: daysAgo(0.4),
  bodyText: `Hi Arinze,\n\nWe have received your application for the Senior Frontend Engineer role at ${a}.`,
});
const laterRejection = mail("later-rejection", {
  fromName: `${a} Hiring Team`,
  subject: `${a}: We're moving forward with other candidates`,
  receivedAt: daysAgo(0.25),
  bodyText: turnedDown(a),
});
const myReply = mail("my-reply", {
  threadId: confirmation.threadId,
  fromAddress: "arinzeogbo@gmail.com",
  fromName: "Arinze Ogbonna",
  subject: `Re: Thanks for applying to ${a}!`,
  receivedAt: daysAgo(2.5),
  bodyText: "Thank you, looking forward to hearing from you.",
  fromMe: true,
});
const myOther = mail("my-other", {
  fromAddress: "arinzeogbo@gmail.com",
  fromName: "Arinze Ogbonna",
  subject: "Dinner on Friday",
  bodyText: "Are you free?",
  fromMe: true,
});
const handover = mail("handover", {
  fromName: `${a} Hiring Team`,
  subject: `Thanks for applying to ${a}!`,
  receivedAt: daysAgo(0.05),
  bodyText: "We have received your application.",
});
const stuckMail = mail("stuck", {
  fromAddress: `news@nlx${tag}.example`,
  subject: "This one loaded in the end",
});
// Interview confirmations. Recruitee, through the employer's own tenant: the sender names
// the company, so the interview is added without asking anyone.
const [w, x, y, z] = [..."wxyz"].map(company);
const iv = {
  // Thursday 10 June 2027, 10:15 to 10:45 in Berlin (CEST): 08:15 to 08:45 UTC.
  startsAt: new Date("2027-06-10T08:15:00Z"),
  endsAt: new Date("2027-06-10T08:45:00Z"),
  step: "Interview Thu 10 Jun, 10:15",
};
const recruitee = (name: string, event: string) =>
  `Interview with ${name}
When
<b>Thursday</b> 10 June 2027 at <b>10:15 - 10:45</b>
Europe/Berlin (+02:00)

Can't make it?
Reschedule
https://careers.example.com/v/i/s/${event}/reschedule

Company
${name}
Interviewers
Mara Lindqvist
Candidate

Event link
https://careers.example.com/v/events/${event}

Powered by Recruitee`;
const receiptW = mail("receipt-w", {
  fromName: `${w} Hiring Team`,
  subject: `Thanks for applying to ${w}!`,
  receivedAt: daysAgo(0.5),
  bodyText: `Hi Arinze,\n\nWe have received your application for the Frontend Engineer role at ${w}.`,
});
const confirmed = mail("interview-confirmed", {
  fromAddress: `e+${tag}@${w.toLowerCase()}.recruitee.com`,
  fromName: `${w} Recruiting`,
  subject:
    "Confirmation: Video interview on Thursday, 10 June 2027 at 10:15 - 10:45 with Mara Lindqvist",
  receivedAt: daysAgo(0.3),
  bodyText: recruitee(w, `evt-w-${tag}`),
});
// The same confirmation, forwarded from a private mailbox: the text names the company, the
// sender does not confirm it.
const forwarded = mail("interview-forwarded", {
  fromAddress: `friend${tag}@gmail.com`,
  fromName: "A Friend",
  subject:
    "Confirmation: Video interview on Thursday, 10 June 2027 at 10:15 - 10:45 with Mara Lindqvist",
  receivedAt: daysAgo(0.3),
  bodyText: recruitee(x, `evt-x-${tag}`),
});
// A calendar invitation whose time is only in its calendar part, which is not stored.
const invitation = mail("interview-invitation", {
  ...own(y),
  subject: `Technical interview with ${y}`,
  receivedAt: daysAgo(0.2),
  bodyText: `${y} has invited you to a technical interview. Join with Google Meet: https://meet.google.com/abc-defg-hij`,
  calendar: `BEGIN:VCALENDAR
METHOD:REQUEST
BEGIN:VEVENT
DTSTART;TZID=Europe/Berlin:20270611T140000
DTEND;TZID=Europe/Berlin:20270611T150000
SUMMARY:Technical interview
LOCATION:https://meet.google.com/abc-defg-hij
ORGANIZER;CN=Jo Smith:mailto:jo@${y.toLowerCase()}.example
END:VEVENT
END:VCALENDAR`,
});
// A calendar invitation from a private mailbox: offered in review, with the time that only its
// calendar part holds.
const forwardedInvite = mail("invite-forwarded", {
  fromAddress: `friend${tag}@gmail.com`,
  fromName: "A Friend",
  subject: `Technical interview with ${x}`,
  receivedAt: daysAgo(0.25),
  bodyText: `Forwarding the invitation from ${x}. Join with Google Meet: https://meet.google.com/xyz-abcd-efg`,
  calendar: invitation.calendar,
});
const synthetic = [
  forwardedInvite,
  receiptW,
  confirmed,
  forwarded,
  invitation,
  newsletter,
  confirmation,
  interview,
  secondRound,
  lateOlder,
  olderRejection,
  olderRejectionDry,
  rejection,
  threadMate,
  noRole,
  rejectionH,
  rejectionQ,
  rejectionR,
  rejectionS,
  ownName,
  proposedReceipt,
  proposedReceiptH,
  proposedClosing,
  proposedRejection,
  proposedK,
  proposedU,
  proposedV,
  ...undecided,
  undecidedP,
  secondReceipt,
  laterRejection,
  myReply,
  myOther,
  handover,
  stuckMail,
];
const ref = (name: string) => ({
  id: `${prefix}${name}`,
  threadId: `${prefix}thread-${name}`,
});
const deleted = ref("deleted");
const stuck = ref("stuck");

// Mails the client lists and returns, plus ids it lists but no longer finds.
// `asked` records every message that was fetched.
const asked: string[] = [];
function fake(mails: RawMail[], gone: (typeof deleted)[] = []): MailClient {
  return {
    list: async () => [
      ...mails.map((item) => ({ id: item.gmailId, threadId: item.threadId })),
      ...gone,
    ],
    get: async (id) => {
      asked.push(id);
      const found = mails.find((item) => item.gmailId === id);
      if (!found) throw new MailNotFoundError("Gmail returned HTTP 404");
      return found;
    },
  };
}
// Claude as a second reader that sees what the rules see, unless `says` holds its answer
// for a mail. Mail the rules cannot decide gets no answer. `read` records what it was sent.
const read: string[] = [];
const says = new Map<string, Partial<Classification> | null>();
const reading = (values: Partial<Classification>): Classification => ({
  category: "rejection",
  confidence: "high",
  decidedBy: "ai",
  evidenceQuote: "we will get back to you next week.",
  company: null,
  role: null,
  nextStep: null,
  deadline: null,
  ...values,
});
const claude: AiClassifier = async (item) => {
  read.push(item.gmailId);
  const rule = classifyByRules(item);
  const answer = says.get(item.gmailId);
  if (answer === null || (!answer && !rule)) return null;
  return reading({ ...rule, confidence: "high", ...answer, decidedBy: "ai" });
};
const check = (mails: RawMail[], gone: (typeof deleted)[] = []) =>
  syncMail({ client: fake(mails, gone), ai: claude, now });
const job = (name: string, title: string) => ({
  canonicalKey: `${prefix}${name}`,
  title,
  company: name,
  location: "Berlin",
  countries: ["DE"],
  description: "Synthetic mail pipeline fixture.",
  applyUrl: `https://example.com/${prefix}${name}`,
  track: "Frontend",
  skills: [],
  score: 50,
  reasons: [],
  contentHash: `${prefix}${name}`,
});
const stored = (item: RawMail) =>
  db.mailMessage.findUniqueOrThrow({ where: { gmailId: item.gmailId } });
const card = (id: string) =>
  db.application.findUniqueOrThrow({ where: { id }, include: { job: true } });
const checkState = () =>
  db.mailSync.findUniqueOrThrow({ where: { id: checkId } });
type Ledger = {
  attempts: Record<string, number>;
  givenUp: string[];
  dryRun?: { startedAt: string; completedAt: string };
  aiCalls: number;
  aiFailures: number;
};
const ledger = async () => (await checkState()).lastCounts as Ledger;
// Only this run's rows, so that work in the dashboard during the test cannot fail a step.
const fixtures = { job: { company: { startsWith: `Mailtest${tag}` } } };
const counts = async () => ({
  mail: await db.mailMessage.count({
    where: { gmailId: { startsWith: prefix } },
  }),
  events: await db.applicationEvent.count({ where: { application: fixtures } }),
  applications: await db.application.count({ where: fixtures }),
});
const iso = (date: Date | null | undefined) => date?.toISOString() ?? null;
const nothingApplied = {
  applied: 0,
  attached: 0,
  created: 0,
  review: 0,
  ignored: 0,
  diverged: 0,
  heldBack: 0,
  failed: 0,
  interviews: 0,
  complete: true,
};

// Steps depend on each other and on the cleanup below running last, so they are plain awaited
// blocks: subtests are not awaited by Node 24 and would outlive the cleanup.
async function step(name: string, run: () => void | Promise<void>) {
  try {
    await run();
  } catch (error) {
    if (error instanceof Error) error.message = `${name}: ${error.message}`;
    throw error;
  }
}

test("lease renewals are taken one at a time and never touch a lease that was lost", async () => {
  const leaseMs = 15 * 60_000;
  const row = { lease: null as Date | null };
  const pause = () => new Promise((done) => setTimeout(done, 1));
  const same = (held: Date) => row.lease?.valueOf() === held.valueOf();
  let clock = Date.now();
  // Extended last 61 seconds ago, so the first call must extend it, and forty arrive at once.
  const claimed = new Date(clock - 61_000 + leaseMs);
  row.lease = claimed;
  const lease = leaseKeeper(
    {
      swap: async (held, next) => {
        await pause();
        if (!same(held)) return false;
        row.lease = next;
        return true;
      },
      holds: async (held) => {
        await pause();
        return same(held);
      },
    },
    claimed,
    () => clock,
  );
  const crowd = () =>
    Promise.all(Array.from({ length: 40 }, () => lease.renew()));
  assert.ok((await crowd()).every(Boolean));
  assert.equal(lease.lost, false);
  assert.equal(row.lease.valueOf(), clock + leaseMs);
  // The same when the minute passes in the middle of a run.
  clock += 61_000;
  assert.ok((await crowd()).every(Boolean));
  assert.equal(row.lease.valueOf(), clock + leaseMs);
  assert.equal(await lease.write({}), true);
  // Another process holds the lease now: nothing of it is extended, written or cleared.
  const theirs = new Date(clock + 2 * leaseMs);
  row.lease = theirs;
  clock += 61_000;
  assert.ok((await crowd()).every((kept) => kept === false));
  assert.equal(lease.lost, true);
  assert.equal(await lease.write({}), false);
  assert.equal(await lease.release(), false);
  assert.equal(row.lease, theirs);
});

test("mail pipeline against the local database, synthetic rows only", async () => {
  const realApplications = await db.application.findMany({
    orderBy: { id: "asc" },
    include: { job: { select: { company: true, title: true } } },
  });
  const before = {
    mail: await db.mailMessage.count(),
    mailEvents: await db.applicationEvent.count({
      where: { mailMessageId: { not: null } },
    }),
    fromEmail: await db.application.count({ where: { origin: "email" } }),
    sync: await db.mailSync.findUnique({ where: { id: "gmail" } }),
    live: await db.setting.findUnique({ where: { key: "mailLive" } }),
    source: await db.source.findUnique({ where: { key: "mail" } }),
    // Mail is live on this database: the worker may store new mail and change cards while this
    // runs. Rows that exist now must come out exactly as they are.
    mailRows: await db.mailMessage.findMany({
      orderBy: { id: "asc" },
      select: {
        id: true,
        state: true,
        applicationId: true,
        category: true,
        decidedBy: true,
        matchReason: true,
        correctedFrom: true,
        proposal: true,
      },
    }),
    interviews: await db.interview.findMany({ orderBy: { id: "asc" } }),
  };
  const realBoard: BoardApplication[] = realApplications.map((item) => ({
    id: item.id,
    company: item.job.company,
    title: item.job.title,
    status: item.status,
    origin: item.origin,
    submittedAt: item.submittedAt,
    threadIds: [],
  }));
  // Nothing has been written yet: these stop the test before it can reach real data.
  assert.ok(
    realBoard.every(
      (item) => !normalizeCompany(item.company).startsWith("mailtest"),
    ),
    "a real application looks like a test fixture",
  );
  for (const item of synthetic) {
    const match = matchMail(item, await classify(item, null), realBoard);
    assert.equal(
      match.kind,
      "none",
      `synthetic mail "${item.subject}" matches a real application`,
    );
  }
  assert.equal(
    await db.mailMessage.count({ where: { state: "proposed" } }),
    0,
    "a real backfill is waiting to be applied; this test plans, discards and applies proposals and must not run now",
  );
  assert.ok(
    !before.sync?.leaseUntil || before.sync.leaseUntil < new Date(),
    "a real mail check is running",
  );

  let failure: unknown = null;
  let strays = 0;
  try {
    const fixture = async (
      name: string,
      title: string,
      status = "submitted",
    ) => {
      const made = await db.job.create({ data: job(name, title) });
      return db.application.create({
        data: {
          jobId: made.id,
          status,
          submittedAt: status === "submitted" ? daysAgo(10) : null,
          createdAt: daysAgo(30),
        },
      });
    };
    const appA = await fixture(a, "Senior Frontend Engineer", "prepared");
    const appC = await fixture(c, "Product Engineer");
    const appH = await fixture(h, "Backend Engineer", "prepared");
    const appK = await fixture(k, "Platform Engineer");
    const appQ = await fixture(q, "Data Engineer");
    const appR = await fixture(r, "Data Engineer");
    const appS = await fixture(s, "Data Engineer");
    const appU = await fixture(u, "Platform Engineer");
    const appV = await fixture(v, "Platform Engineer");
    const appW = await fixture(w, "Frontend Engineer", "prepared");
    const appX = await fixture(x, "Frontend Engineer");
    const appY = await fixture(y, "Frontend Engineer");
    const appZ = await fixture(z, "Frontend Engineer");

    await step("prefilter", () => {
      const board = {
        companies: [normalizeCompany(a)],
        threadIds: new Set([`${prefix}linked`]),
      };
      const fromBoard = { ...newsletter, ...own(a) };
      const subject = (text: string) => ({ ...newsletter, subject: text });
      assert.equal(isCandidate(newsletter, board), false);
      assert.equal(isCandidate(confirmation, board), true);
      assert.equal(isCandidate(fromBoard, board), true);
      // A mass mailing from an employer on the board is a newsletter, not application mail.
      assert.equal(isCandidate({ ...fromBoard, bulk: true }, board), false);
      assert.equal(
        isCandidate(
          { ...fromBoard, bulk: true, subject: "Your application" },
          board,
        ),
        true,
      );
      assert.equal(
        isCandidate(
          { ...fromBoard, bulk: true, threadId: `${prefix}linked` },
          board,
        ),
        true,
      );
      assert.equal(isCandidate({ ...confirmation, bulk: true }, board), true);
      for (const kept of [
        "Deine Bewerbung bei uns",
        "Your job offer",
        "Offer letter attached",
        "Neues Stellenangebot",
        "Einladung zum Vorstellungsgespräch",
        "Termin Kennenlerngespräch",
        "Update on your candidacy",
        "We received your candidature",
        "We're moving forward with other candidates",
      ])
        assert.equal(isCandidate(subject(kept), board), true, kept);
      for (const dropped of [
        "A special offer for you",
        "An dieser Stelle vielen Dank",
        "Meet the candidates for mayor",
        "Ein Gespräch über Rente",
      ])
        assert.equal(isCandidate(subject(dropped), board), false, dropped);
      const sent = { ...confirmation, fromMe: true };
      assert.equal(isCandidate(sent, board), false);
      assert.equal(
        isCandidate({ ...sent, threadId: `${prefix}linked` }, board),
        true,
      );
    });

    await step(
      "0. no check changes a card before a dry run has been applied",
      async () => {
        const first = await check([confirmation]);
        assert.equal(first.skipped, true);
        assert.equal(first.reason, "not-live");
        assert.deepEqual(asked, []);
        assert.equal(await mailLive(), false);
        assert.equal((await mailOverview()).connection.live, false);
        assert.equal(await db.mailSync.count({ where: { id: checkId } }), 0);
        // Applying needs a dry run that ran to its end.
        await assert.rejects(
          applyProposals(now),
          /Run npm run mail:backfill first and read its report/,
        );
        assert.equal(await mailLive(), false);
        const dry = await syncMail({
          client: fake([]),
          ai: claude,
          dryRun: true,
          now,
        });
        assert.equal(dry.skipped, false);
        const run = (await ledger()).dryRun;
        assert.ok(run?.startedAt && run.completedAt);
        // A dry run reads; it does not move the window that live checks go on from.
        assert.equal((await checkState()).lastSuccessAt, null);
        assert.equal(await mailLive(), false);
        assert.deepEqual(await applyProposals(now), nothingApplied);
        assert.equal(await mailLive(), true);
        assert.equal((await mailOverview()).connection.live, true);
        assert.deepEqual(
          await db.setting.findUnique({ where: { key: liveKey } }),
          { key: liveKey, value: true },
        );
        // Live checks go on from where that dry run started reading, and the report is spent.
        assert.equal(iso((await checkState()).lastSuccessAt), run.startedAt);
        assert.equal((await ledger()).dryRun, undefined);
        await assert.rejects(applyProposals(now), /mail:backfill first/);
        // The switch can be turned off again, and only an applied dry run turns it on.
        await setMailLive(false);
        assert.equal((await check([confirmation])).reason, "not-live");
        assert.deepEqual(asked, []);
        await setMailLive(true);
      },
    );

    await step(
      "1. a receipt both readers agree on marks a prepared card submitted",
      async () => {
        const result = await check([newsletter, confirmation]);
        assert.equal(result.skipped, false);
        assert.equal(result.listed, 2);
        assert.equal(result.candidates, 1);
        assert.equal(result.applied, 1);
        // Claude is asked about the one receipt that would change a card, not the newsletter.
        assert.deepEqual(read, [confirmation.gmailId]);
        assert.equal(result.aiCalls, 1);
        assert.equal((await ledger()).aiCalls, 1);
        const application = await card(appA.id);
        assert.equal(application.status, "submitted");
        assert.equal(
          iso(application.submittedAt),
          iso(confirmation.receivedAt),
        );
        assert.equal(application.origin, "jobdesk");
        const row = await stored(confirmation);
        assert.equal(row.applicationId, appA.id);
        assert.equal(row.state, "applied");
        assert.equal(row.category, "confirmation");
        assert.match(row.decidedBy, /\+ai$/);
        assert.equal(
          row.matchReason,
          "Confirmation of receipt, card marked as submitted. Match: company.",
        );
        assert.equal(
          await db.mailMessage.count({
            where: { gmailId: newsletter.gmailId },
          }),
          0,
        );
        const event = await db.applicationEvent.findFirstOrThrow({
          where: { mailMessageId: row.id },
        });
        assert.equal(event.status, "submitted");
        assert.equal((event.previous as { status: string }).status, "prepared");
        const sync = await checkState();
        assert.equal(sync.lastError, null);
        assert.equal(sync.leaseUntil, null);
        assert.ok(sync.lastSuccessAt);
      },
    );

    await step(
      "2. an interview mail moves the card and sets the next step",
      async () => {
        const result = await check([newsletter, confirmation, interview]);
        assert.equal(result.candidates, 1);
        assert.equal(result.applied, 1);
        const application = await card(appA.id);
        assert.equal(application.status, "interview");
        assert.match(application.nextStep ?? "", /book a slot/);
        assert.equal(iso(application.nextStepDueAt), iso(due));
        assert.equal(iso(application.lastMailAt), iso(interview.receivedAt));
        assert.equal(
          iso(application.submittedAt),
          iso(confirmation.receivedAt),
        );
        const row = await stored(interview);
        const event = await db.applicationEvent.findFirstOrThrow({
          where: { mailMessageId: row.id },
        });
        assert.equal(event.status, "interview");
        assert.equal(
          (event.previous as { status: string }).status,
          "submitted",
        );
        const overview = await mailOverview();
        assert.ok(
          overview.actions.some(
            (item) =>
              item.applicationId === appA.id &&
              item.jobId === appA.jobId &&
              item.status === "interview",
          ),
        );
        const timeline = await mailForApplication(appA.id);
        assert.deepEqual(
          timeline.map((item) => [item.id, item.undoable, item.unlinkable]),
          [
            [row.id, true, false],
            [(await stored(confirmation)).id, false, false],
          ],
        );
      },
    );

    await step(
      "3. undo restores the card and sends the mail to review",
      async () => {
        const row = await stored(interview);
        await undoMail(row.id);
        const application = await card(appA.id);
        assert.equal(application.status, "submitted");
        assert.equal(application.nextStep, null);
        assert.equal(application.nextStepDueAt, null);
        assert.equal(iso(application.lastMailAt), iso(confirmation.receivedAt));
        const after = await stored(interview);
        assert.equal(after.state, "needs_review");
        assert.equal(after.applicationId, null);
        assert.equal(
          await db.applicationEvent.count({ where: { mailMessageId: row.id } }),
          0,
        );
        const review = (await mailOverview()).review.find(
          (item) => item.id === row.id,
        );
        assert.ok(review);
        assert.deepEqual(review.candidates, [
          {
            applicationId: appA.id,
            company: a,
            title: "Senior Frontend Engineer",
            status: "submitted",
          },
        ]);
        await assert.rejects(undoMail(row.id), /undone/);
      },
    );

    await step(
      "4. an agreed rejection from an unknown company creates a card, given a hiring system or a role",
      async () => {
        const result = await check([
          newsletter,
          confirmation,
          interview,
          rejection,
          noRole,
        ]);
        assert.equal(result.candidates, 2);
        assert.equal(result.created, 1);
        assert.equal(result.review, 1);
        const row = await stored(rejection);
        assert.equal(row.state, "applied");
        assert.ok(row.applicationId);
        const application = await card(row.applicationId);
        assert.equal(application.origin, "email");
        assert.equal(application.status, "rejected");
        assert.equal(application.submittedAt, null);
        // Dated by the mail, so that the matcher's age guard treats older mail the same way
        // when it is applied as when it was planned.
        assert.equal(iso(application.createdAt), iso(rejection.receivedAt));
        assert.equal(application.job.company, b);
        assert.equal(application.job.title, "Role not stated");
        assert.equal(application.job.liveStatus, "unverified");
        assert.equal(
          application.job.canonicalKey,
          hash(`mail:${rejection.threadId}`),
        );
        assert.equal(
          application.job.applyUrl,
          `https://mail.google.com/mail/u/0/#all/${rejection.threadId}`,
        );
        const listing = await db.listing.findFirstOrThrow({
          where: { jobId: application.jobId },
          include: { source: true },
        });
        assert.equal(listing.source.key, "mail");
        assert.equal(listing.source.kind, "mail");
        assert.equal(listing.source.enabled, false);
        const event = await db.applicationEvent.findFirstOrThrow({
          where: { mailMessageId: row.id },
        });
        assert.equal(event.status, "rejected");
        assert.equal(event.previous, null);
        const held = await stored(noRole);
        assert.equal(held.state, "needs_review");
        assert.match(held.matchReason, /states no role/);
        assert.equal(await db.job.count({ where: { company: n } }), 0);
      },
    );

    await step("5. the same check twice changes nothing", async () => {
      const mails = [newsletter, confirmation, interview, rejection, noRole];
      const state = async () => ({
        counts: await counts(),
        cards: await db.application.findMany({
          where: fixtures,
          orderBy: { id: "asc" },
        }),
        mail: await db.mailMessage.findMany({
          where: { gmailId: { startsWith: prefix } },
          orderBy: { id: "asc" },
        }),
      });
      const earlier = await state();
      const result = await check(mails);
      assert.deepEqual(
        [
          result.listed,
          result.candidates,
          result.applied,
          result.attached,
          result.created,
          result.review,
          result.ignored,
        ],
        [5, 0, 0, 0, 0, 0, 0],
      );
      assert.deepEqual(await state(), earlier);
    });

    await step(
      "6. one reader is not enough: disagreement, no Claude, second opinion off",
      async () => {
        const untouched = async (id: string) => {
          const application = await card(id);
          assert.equal(application.status, "submitted");
          assert.equal(application.lastMailAt, null);
        };
        // Claude reads the rejection as an interview invitation.
        says.set(rejectionQ.gmailId, { category: "interview" });
        const split = await check([rejectionQ]);
        assert.equal(split.review, 1);
        assert.equal(split.applied, 0);
        const disputed = await stored(rejectionQ);
        assert.equal(disputed.state, "needs_review");
        assert.match(disputed.decidedBy, / vs ai:interview$/);
        assert.match(
          disputed.matchReason,
          /^The rules and Claude read this email differently \(rejection vs interview\)\./,
        );
        await untouched(appQ.id);
        // No Claude at all: the rules alone do not close a card.
        const alone = await syncMail({
          client: fake([rejectionR]),
          ai: null,
          now,
        });
        assert.equal(alone.review, 1);
        assert.equal(alone.aiCalls, 0);
        assert.equal(
          (await stored(rejectionR)).matchReason,
          "Only the rules read this as a rejection; Claude has not confirmed it. Match: company.",
        );
        await untouched(appR.id);
        // Second opinion switched off: Claude is not sent mail the rules have decided.
        process.env.MAIL_SECOND_OPINION = "off";
        try {
          const sent = read.length;
          const off = await check([rejectionS]);
          assert.equal(off.review, 1);
          assert.equal(off.aiCalls, 0);
          assert.equal(read.length, sent);
          assert.equal(
            (await stored(rejectionS)).matchReason,
            "Only the rules read this as a rejection; Claude has not confirmed it. Match: company.",
          );
          await untouched(appS.id);
        } finally {
          delete process.env.MAIL_SECOND_OPINION;
        }
      },
    );

    await step(
      "7. a rejected Google token and a rate limit on the listing are reported, the window stays",
      async () => {
        const earlier = await checkState();
        for (const client of [
          {
            list: async () => {
              throw new MailAuthError("Google sign-in returned HTTP 400");
            },
            get: async () => confirmation,
          },
          {
            list: async () => [deleted],
            get: async () => {
              throw new MailAuthError("Gmail returned HTTP 401");
            },
          },
        ] satisfies MailClient[]) {
          const result = await syncMail({ client, ai: claude, now });
          assert.equal(result.skipped, false);
          assert.equal(result.listed + result.candidates + result.applied, 0);
          const sync = await checkState();
          assert.equal(
            sync.lastError,
            "Reconnect Gmail: run npm run mail:connect",
          );
          assert.equal(iso(sync.lastSuccessAt), iso(earlier.lastSuccessAt));
          assert.equal(sync.leaseUntil, null);
        }
        assert.equal(
          (await mailOverview()).connection.lastError,
          "Reconnect Gmail: run npm run mail:connect",
        );
        // A rate limit on the listing stops the check and pushes the next one out.
        await assert.rejects(
          syncMail({
            client: {
              list: async () => {
                throw new MailProviderError("Gmail returned HTTP 429", 3600);
              },
              get: async () => confirmation,
            },
            ai: claude,
            now,
          }),
          /429/,
        );
        const limited = await checkState();
        assert.equal(limited.lastError, "Gmail returned HTTP 429");
        assert.equal(limited.leaseUntil, null);
        assert.equal(iso(limited.lastSuccessAt), iso(earlier.lastSuccessAt));
        assert.ok(limited.nextRunAt.valueOf() > Date.now() + 50 * 60_000);
      },
    );

    await step(
      "8. a message that cannot be read holds the window until it is read or given up",
      async () => {
        // Deleted between the listing and the fetch: nothing to wait for.
        const start = await checkState();
        const clean = await check([confirmation], [deleted]);
        assert.equal(clean.listed, 2);
        assert.equal(clean.failed, 0);
        const moved = await checkState();
        assert.equal(moved.lastError, null);
        assert.ok(moved.lastSuccessAt! > start.lastSuccessAt!);
        assert.deepEqual((await ledger()).attempts, {});

        // Two messages fail, each in its own way. The third is read and handled all the same.
        let listed = [stuck, ref("own-name"), ref("rejection-h")];
        const readable = new Map([[rejectionH.gmailId, rejectionH]]);
        const client: MailClient = {
          list: async () => listed,
          get: async (id) => {
            asked.push(id);
            const found = readable.get(id);
            if (found) return found;
            throw id === ownName.gmailId
              ? new Error("The operation was aborted due to timeout")
              : new MailProviderError("Gmail returned HTTP 503");
          },
        };
        const run = async (options = {}) => {
          asked.length = 0;
          const result = await syncMail({
            client,
            ai: claude,
            now,
            ...options,
          });
          return { result, sync: await checkState(), ...(await ledger()) };
        };
        const first = await run();
        assert.equal(first.result.failed, 2);
        assert.equal(first.result.review, 1);
        assert.equal(
          first.sync.lastError,
          "2 emails could not be read and will be retried.",
        );
        assert.equal(iso(first.sync.lastSuccessAt), iso(moved.lastSuccessAt));
        assert.deepEqual(first.attempts, {
          [stuck.id]: 1,
          [ownName.gmailId]: 1,
        });
        // The next listing no longer holds them: both are asked for by id anyway.
        listed = [];
        readable.set(ownName.gmailId, ownName);
        const second = await run();
        assert.deepEqual(asked.sort(), [ownName.gmailId, stuck.id].sort());
        assert.equal(second.result.failed, 1);
        assert.equal(second.result.review, 1);
        assert.equal(
          second.sync.lastError,
          "1 email could not be read and will be retried.",
        );
        assert.equal(iso(second.sync.lastSuccessAt), iso(moved.lastSuccessAt));
        assert.deepEqual(second.attempts, { [stuck.id]: 2 });
        for (const tries of [3, 4]) {
          const next = await run();
          assert.deepEqual(next.attempts, { [stuck.id]: tries });
          assert.equal(iso(next.sync.lastSuccessAt), iso(moved.lastSuccessAt));
        }
        // The fifth failure in a row: given up, listed apart, and the window moves again.
        const given = `1 email could not be read after 5 tries. Run npm run mail:sync -- --retry to try again.`;
        const fifth = await run();
        assert.deepEqual(fifth.attempts, {});
        assert.deepEqual(fifth.givenUp, [stuck.id]);
        assert.ok(fifth.sync.lastSuccessAt! > moved.lastSuccessAt!);
        assert.equal((await mailOverview()).connection.lastError, given);
        // It is not asked for again, also when a listing holds it, and stays named.
        listed = [stuck];
        const sixth = await run();
        assert.deepEqual(asked, []);
        assert.deepEqual(sixth.givenUp, [stuck.id]);
        assert.equal(sixth.sync.lastError, null);
        assert.equal((await mailOverview()).connection.lastError, given);

        // Five messages in a row that cannot be read: Gmail is down, the check stops.
        const down = [1, 2, 3, 4, 5, 6].map((i) => ref(`down-${i}`));
        listed = down;
        await assert.rejects(run(), /503/);
        const stopped = await checkState();
        assert.equal(stopped.lastError, "Gmail returned HTTP 503");
        assert.equal(stopped.leaseUntil, null);
        assert.equal(iso(stopped.lastSuccessAt), iso(sixth.sync.lastSuccessAt));
        assert.deepEqual((await ledger()).givenUp, [stuck.id]);
        assert.match(
          (await mailOverview()).connection.lastError ?? "",
          /^Gmail returned HTTP 503 1 email could not be read after 5 tries/,
        );
        // --retry asks for the given-up message again; it loads now and leaves the list.
        listed = [];
        readable.set(stuck.id, stuckMail);
        const retried = await run({ retryGivenUp: true });
        assert.deepEqual(asked, [stuck.id]);
        assert.deepEqual(retried.givenUp, []);
        assert.equal((await mailOverview()).connection.lastError, null);

        // The mail that came through on its second try names the mailbox owner as employer.
        const row = await stored(ownName);
        assert.equal(row.state, "needs_review");
        assert.equal(row.applicationId, null);
        assert.equal(
          row.matchReason,
          "No company name could be read from this mail. Match: no application at Ogbonna.",
        );
        assert.equal(await db.job.count({ where: { company: "Ogbonna" } }), 0);
        await ignoreMail(row.id);
        const ignored = await stored(ownName);
        assert.equal(ignored.state, "ignored");
        assert.equal(ignored.correctedFrom, "confirmation");
      },
    );

    await step(
      "9. a rejection on a card that was never submitted waits for review",
      async () => {
        const row = await stored(rejectionH);
        assert.equal(row.state, "needs_review");
        assert.equal(row.applicationId, null);
        assert.equal(
          row.matchReason,
          "The card was never recorded as submitted. Match: company.",
        );
        const application = await card(appH.id);
        assert.equal(application.status, "prepared");
        assert.equal(application.lastMailAt, null);
        const review = (await mailOverview()).review.find(
          (item) => item.id === row.id,
        );
        assert.deepEqual(
          review?.candidates.map((item) => item.applicationId),
          [appH.id],
        );
      },
    );

    await step(
      "10. a person's confirmation moves the card; a later mail only replaces the next step",
      async () => {
        const row = await stored(interview);
        await resolveReview(row.id, {
          category: "interview",
          applicationId: appA.id,
        });
        // Confirmed by a person: no second reader is needed for the card to move.
        const application = await card(appA.id);
        assert.equal(application.status, "interview");
        assert.match(application.nextStep ?? "", /book a slot/);
        const after = await stored(interview);
        assert.equal(after.state, "applied");
        assert.equal(after.decidedBy, "user");
        assert.equal(after.applicationId, appA.id);
        assert.ok(
          !(await mailOverview()).review.some((item) => item.id === row.id),
        );
        await assert.rejects(
          resolveReview(row.id, { category: "interview", applicationId: null }),
          /review/,
        );

        // Second-round invitation: same stage, new next step, and it can be undone.
        const result = await check([secondRound]);
        assert.equal(result.applied, 1);
        const refreshed = await card(appA.id);
        assert.equal(refreshed.status, "interview");
        assert.match(refreshed.nextStep ?? "", /confirm your availability/);
        assert.equal(iso(refreshed.nextStepDueAt), iso(dueIn(7)));
        const second = await stored(secondRound);
        assert.equal(second.state, "applied");
        const event = await db.applicationEvent.findFirstOrThrow({
          where: { mailMessageId: second.id },
        });
        assert.equal(event.status, "interview");
        const previous = event.previous as { status: string; nextStep: string };
        assert.equal(previous.status, "interview");
        assert.match(previous.nextStep, /book a slot/);
        assert.equal(
          (await mailForApplication(appA.id)).find(
            (item) => item.id === second.id,
          )?.undoable,
          true,
        );
        await undoMail(second.id);
        const restored = await card(appA.id);
        assert.equal(restored.status, "interview");
        assert.match(restored.nextStep ?? "", /book a slot/);
        assert.equal(iso(restored.nextStepDueAt), iso(due));
        assert.equal(iso(restored.lastMailAt), iso(interview.receivedAt));
        assert.equal((await stored(secondRound)).state, "needs_review");
      },
    );

    await step(
      "11. an older mail that arrives late changes nothing a newer one set",
      async () => {
        const events = (await counts()).events;
        const earlier = await card(appA.id);
        // An older invitation would only replace the next step: it is linked instead.
        const result = await check([lateOlder]);
        assert.equal(result.applied, 0);
        assert.equal(result.attached, 1);
        const row = await stored(lateOlder);
        assert.equal(row.state, "attached");
        assert.equal(row.applicationId, appA.id);
        assert.equal(
          row.matchReason,
          "A newer email already set this card's next step. Match: company.",
        );
        // An older rejection would change the status: a person decides.
        const late = await check([olderRejection]);
        assert.equal(late.applied, 0);
        assert.equal(late.review, 1);
        const held = await stored(olderRejection);
        assert.equal(held.state, "needs_review");
        assert.equal(held.applicationId, null);
        assert.match(held.decidedBy, /\+ai$/);
        assert.equal(
          held.matchReason,
          "A newer email already changed this card. Match: company.",
        );
        const application = await card(appA.id);
        assert.equal(application.status, "interview");
        assert.equal(application.nextStep, earlier.nextStep);
        assert.equal(iso(application.nextStepDueAt), iso(due));
        assert.equal(iso(application.lastMailAt), iso(interview.receivedAt));
        assert.equal((await counts()).events, events);

        // The linked mail can be taken off the card again.
        const entry = (await mailForApplication(appA.id)).find(
          (item) => item.id === row.id,
        );
        assert.equal(entry?.unlinkable, true);
        assert.equal(entry?.undoable, false);
        await assert.rejects(undoMail(row.id), /undone/);
        await assert.rejects(
          unlinkMail((await stored(interview)).id),
          /linked to a card/,
        );
        await unlinkMail(row.id);
        const unlinked = await stored(lateOlder);
        assert.equal(unlinked.state, "needs_review");
        assert.equal(unlinked.applicationId, null);
        assert.equal(unlinked.correctedFrom, "interview");
        assert.ok(
          !(await mailForApplication(appA.id)).some(
            (item) => item.id === row.id,
          ),
        );
        await assert.rejects(unlinkMail(row.id), /linked to a card/);
      },
    );

    await step(
      "12. a dry run only proposes; it can be resumed, redone, held back and is applied as reported",
      async () => {
        const mails = [
          confirmation,
          interview,
          rejection,
          proposedClosing,
          olderRejectionDry,
          proposedRejection,
          proposedK,
          proposedU,
          proposedV,
          proposedReceipt,
          proposedReceiptH,
        ];
        const dryRun = () =>
          syncMail({ client: fake(mails), ai: claude, dryRun: true, now });
        const earlier = await counts();
        const window = iso((await checkState()).lastSuccessAt);
        const untouched = await card(appC.id);
        const sent = read.length;
        const result = await dryRun();
        assert.equal(result.candidates, 8);
        assert.equal(result.created, 1);
        assert.equal(result.applied, 6);
        assert.equal(result.review, 1);
        // Claude read the six rejections, and the receipt that would mark a prepared card
        // submitted. The other receipt comes from a hiring system and states the role, so the
        // card it creates needs no second reader.
        assert.equal(result.aiCalls, 7);
        assert.ok(read.slice(sent).includes(proposedReceiptH.gmailId));
        assert.ok(!read.slice(sent).includes(proposedReceipt.gmailId));
        const confirmedReceipt = await stored(proposedReceiptH);
        assert.match(confirmedReceipt.decidedBy, /\+ai$/);
        assert.equal(
          (confirmedReceipt.proposal as { decision: { status: string } })
            .decision.status,
          "submitted",
        );
        // Nothing moved: not the cards, and not the window live checks go on from.
        assert.deepEqual(await card(appC.id), untouched);
        assert.deepEqual(await counts(), {
          ...earlier,
          mail: earlier.mail + 8,
        });
        assert.equal(await db.job.count({ where: { company: d } }), 0);
        assert.equal(iso((await checkState()).lastSuccessAt), window);
        assert.ok((await ledger()).dryRun?.completedAt);
        type Plan = {
          decision: { action: string; status: string; reason: string };
          card: { id: string; status: string | null };
        };
        const plan = async (item: RawMail) =>
          (await stored(item)).proposal as Plan;
        const row = await stored(proposedRejection);
        assert.equal(row.state, "proposed");
        assert.equal(row.applicationId, null);
        const proposal = await plan(proposedRejection);
        assert.equal(proposal.decision.action, "update");
        assert.equal(proposal.decision.status, "rejected");
        // The card as the report found it is kept with the proposal.
        assert.deepEqual(proposal.card, {
          id: appC.id,
          company: c,
          title: "Product Engineer",
          status: "submitted",
          nextStep: null,
        });
        // The receipt would create a card, and the later rejection is planned against that card.
        const receipt = await plan(proposedReceipt);
        const closing = await plan(proposedClosing);
        assert.equal(receipt.decision.action, "create");
        assert.equal(receipt.decision.status, "submitted");
        assert.equal(closing.decision.action, "update");
        assert.equal(closing.decision.status, "rejected");
        assert.equal(closing.card.id, receipt.card.id);
        assert.equal(closing.card.status, "submitted");
        // The order of mail is planned too: a rejection older than the card's newest mail.
        const older = await plan(olderRejectionDry);
        assert.equal(older.decision.action, "review");
        assert.equal(
          older.decision.reason,
          "A newer email already changed this card",
        );
        // While a report is open, scheduled checks wait and stored mail is not read again.
        const waitingCheck = await check([secondReceipt]);
        assert.equal(waitingCheck.skipped, true);
        assert.equal(waitingCheck.reason, "pending-proposals");
        assert.equal((await mailOverview()).connection.pendingProposals, 8);
        await assert.rejects(
          reclassifyMail({ ai: claude, now }),
          /^Error: Proposals are waiting\. Apply or discard them first, or run npm run mail:backfill again to redo the dry run with the current settings\.$/,
        );

        // The report data follows each card through its proposals and names every mail.
        const id = async (item: RawMail) => (await stored(item)).id;
        const summary = await proposalSummary();
        assert.equal(summary.total, 8);
        assert.deepEqual(summary.actions, {
          update: 6,
          attach: 0,
          create: 1,
          review: 1,
          ignore: 0,
        });
        assert.deepEqual(summary.categories, { confirmation: 2, rejection: 6 });
        assert.equal(summary.agreedChanges, 6);
        assert.equal(summary.receiptsWithoutClaude, 1);
        assert.deepEqual(summary.reviewReasons, [
          { reason: "A newer email already changed this card", mails: 1 },
        ]);
        assert.deepEqual(
          summary.created.map((item) => [
            item.company,
            item.title,
            item.status,
            item.mailIds,
            item.firstSubject,
          ]),
          [
            [
              d,
              "Fullstack Engineer",
              "rejected",
              [await id(proposedReceipt), await id(proposedClosing)],
              proposedReceipt.subject,
            ],
          ],
        );
        assert.deepEqual(
          summary.existing.map((item) => [
            item.applicationId,
            item.statusNow,
            item.statusAfter,
            item.mailIds,
          ]),
          [
            [appH.id, "prepared", "submitted", [await id(proposedReceiptH)]],
            [appC.id, "submitted", "rejected", [await id(proposedRejection)]],
            [appK.id, "submitted", "rejected", [await id(proposedK)]],
            [appU.id, "submitted", "rejected", [await id(proposedU)]],
            [appV.id, "submitted", "rejected", [await id(proposedV)]],
          ],
        );
        assert.deepEqual(
          summary.rejections.map((item) => [
            item.id,
            item.company,
            item.newCard,
          ]),
          [
            [await id(proposedClosing), d, true],
            [await id(proposedRejection), c, false],
            [await id(proposedK), k, false],
            [await id(proposedU), u, false],
            [await id(proposedV), v, false],
          ],
        );
        assert.deepEqual(
          summary.review.map((item) => item.id),
          [await id(olderRejectionDry)],
        );

        // Resumed: what is stored is neither fetched nor planned away.
        asked.length = 0;
        const resumed = await dryRun();
        assert.deepEqual(asked, []);
        assert.equal(resumed.candidates, 0);
        assert.equal(await id(proposedRejection), row.id);
        assert.ok((await ledger()).dryRun);
        // Thrown away: only the proposals go, with the note that a dry run completed.
        // The live switch and the window stay as they are.
        assert.equal(await discardProposals(), 8);
        assert.deepEqual(await counts(), earlier);
        assert.equal(await mailLive(), true);
        assert.equal(iso((await checkState()).lastSuccessAt), window);
        assert.equal((await ledger()).dryRun, undefined);
        assert.equal(await discardProposals(), 0);
        await assert.rejects(applyProposals(now), /mail:backfill first/);
        // Planned again from scratch, as after a change to the rules.
        const again = await dryRun();
        assert.equal(again.candidates, 8);
        assert.notEqual(await id(proposedRejection), row.id);

        // Between the report and --apply: one card is changed by hand, one proposal is
        // damaged, and the rejection that follows the receipt is kept out of this run, as if
        // the run were interrupted before reaching it.
        await db.application.update({
          where: { id: appK.id },
          data: { status: "withdrawn" },
        });
        await db.mailMessage.update({
          where: { gmailId: proposedU.gmailId },
          data: { proposal: { card: null } },
        });
        await db.mailMessage.update({
          where: { gmailId: proposedClosing.gmailId },
          data: { state: "parked" },
        });
        await assert.rejects(
          applyProposals(now, { hold: ["no-such-mail"] }),
          /No proposal has the mail id no-such-mail/,
        );
        assert.equal(
          await db.mailMessage.count({ where: { state: "proposed" } }),
          7,
        );
        const applied = await applyProposals(now, {
          hold: [await id(proposedV)],
        });
        assert.deepEqual(applied, {
          applied: 2,
          attached: 0,
          created: 1,
          review: 1,
          ignored: 0,
          diverged: 1,
          heldBack: 1,
          failed: 1,
          interviews: 0,
          complete: true,
        });
        const reviewed = async (item: RawMail, reason: string | RegExp) => {
          const kept = await stored(item);
          assert.equal(kept.state, "needs_review");
          assert.equal(kept.applicationId, null);
          assert.equal(kept.proposal, null);
          assert.match(
            kept.matchReason,
            typeof reason === "string" ? new RegExp(`^${reason}$`) : reason,
          );
        };
        const unmoved = async (appId: string, status: string) => {
          const application = await card(appId);
          assert.equal(application.status, status);
          assert.equal(application.lastMailAt, null);
          assert.equal(
            await db.applicationEvent.count({
              where: { applicationId: appId },
            }),
            0,
          );
        };
        // The card is not as the report found it.
        await reviewed(
          proposedK,
          "The card changed after the report was written\\. It was submitted then and is withdrawn now\\. Match: company\\.",
        );
        await unmoved(appK.id, "withdrawn");
        // Held back with --hold.
        await reviewed(proposedV, "Held back by you\\.");
        await unmoved(appV.id, "submitted");
        // One mail that fails does not stop the others.
        await reviewed(
          proposedU,
          "This email could not be applied \\(TypeError\\)\\.",
        );
        await unmoved(appU.id, "submitted");
        await reviewed(
          olderRejectionDry,
          "A newer email already changed this card\\. Match: company\\.",
        );
        // The receipt Claude confirmed in the dry run is applied without asking again.
        assert.equal((await card(appH.id)).status, "submitted");
        assert.equal(
          iso((await card(appH.id)).submittedAt),
          iso(proposedReceiptH.receivedAt),
        );
        const after = await stored(proposedRejection);
        assert.equal(after.state, "applied");
        assert.equal(after.applicationId, appC.id);
        assert.equal(after.proposal, null);
        assert.equal((await card(appC.id)).status, "rejected");
        const event = await db.applicationEvent.findFirstOrThrow({
          where: { mailMessageId: after.id },
        });
        assert.equal(
          (event.previous as { status: string }).status,
          "submitted",
        );
        assert.equal((await ledger()).dryRun, undefined);
        assert.equal(iso((await checkState()).lastSuccessAt), window);

        // The second run after the interruption: the rejection finds the card the receipt
        // created in the first run, through the mail that made it.
        const state = await checkState();
        await db.mailSync.update({
          where: { id: checkId },
          data: {
            lastCounts: {
              ...(state.lastCounts as object),
              dryRun: {
                startedAt: now.toISOString(),
                completedAt: now.toISOString(),
              },
            },
          },
        });
        await db.mailMessage.update({
          where: { gmailId: proposedClosing.gmailId },
          data: { state: "proposed" },
        });
        assert.deepEqual(await applyProposals(now), {
          ...nothingApplied,
          applied: 1,
        });
        const created = await db.application.findMany({
          where: { job: { company: d } },
        });
        assert.equal(created.length, 1);
        assert.equal(created[0].status, "rejected");
        assert.equal(created[0].origin, "email");
        assert.equal(
          iso(created[0].submittedAt),
          iso(proposedReceipt.receivedAt),
        );
        assert.equal(
          iso(created[0].createdAt),
          iso(proposedReceipt.receivedAt),
        );
        assert.equal(
          await db.mailMessage.count({
            where: { applicationId: created[0].id },
          }),
          2,
        );
        assert.equal(
          await db.mailMessage.count({ where: { state: "proposed" } }),
          0,
        );
      },
    );

    await step(
      "13. the mail that created a card cannot be undone once the card holds more; a new card from a mail of that thread stands apart",
      async () => {
        const row = await stored(rejection);
        const made = await card(row.applicationId!);
        const undoable = async () =>
          (await mailForApplication(made.id)).find((item) => item.id === row.id)
            ?.undoable;
        const refused = async () => {
          assert.equal(await undoable(), false);
          await assert.rejects(
            undoMail(row.id),
            /^Error: This card has other emails or notes\. Reject or correct the card by hand instead\.$/,
          );
          assert.equal((await stored(rejection)).state, "applied");
          assert.equal(
            await db.application.count({ where: { id: made.id } }),
            1,
          );
        };
        assert.equal(await undoable(), true);
        await db.application.update({
          where: { id: made.id },
          data: { notes: "Called them on Monday." },
        });
        await refused();
        await db.application.update({
          where: { id: made.id },
          data: { notes: "" },
        });
        // A second mail in the same thread: a rejection for a card already rejected is linked.
        const result = await check([threadMate]);
        assert.equal(result.attached, 1);
        const mate = await stored(threadMate);
        assert.equal(mate.applicationId, made.id);
        assert.equal(
          mate.matchReason,
          "Card is already rejected. Match: thread.",
        );
        await refused();
        // Taken off the card and given a card of its own: not the thread's old card again.
        await unlinkMail(mate.id);
        await resolveReview(mate.id, {
          category: "rejection",
          applicationId: "new",
        });
        const apart = await stored(threadMate);
        assert.equal(apart.state, "applied");
        assert.ok(apart.applicationId);
        assert.notEqual(apart.applicationId, made.id);
        const separate = await card(apart.applicationId);
        assert.equal(separate.status, "rejected");
        assert.equal(separate.job.company, b);
        assert.equal(
          separate.job.canonicalKey,
          hash(`mail:${threadMate.threadId}:${threadMate.gmailId}`),
        );
        assert.equal(
          await db.mailMessage.count({ where: { applicationId: made.id } }),
          1,
        );
        // The first card holds only its own mail again and can go with it.
        assert.equal(await undoable(), true);
        await undoMail(row.id);
        assert.equal(await db.application.count({ where: { id: made.id } }), 0);
        assert.equal(await db.job.count({ where: { id: made.jobId } }), 0);
        assert.equal((await stored(rejection)).state, "needs_review");
        assert.equal(
          await db.application.count({ where: { id: separate.id } }),
          1,
        );

        await completeNextStep(appA.id);
        const done = await card(appA.id);
        assert.equal(done.nextStep, null);
        assert.equal(done.nextStepDueAt, null);
        assert.equal(done.status, "interview");
      },
    );

    await step("14. a silent Claude API shows up as an error", async () => {
      let calls = 0;
      const result = await syncMail({
        client: fake(undecided),
        ai: async () => {
          calls++;
          return null;
        },
        now,
      });
      assert.equal(calls, 4);
      assert.equal(result.review, 4);
      assert.equal(result.aiCalls, 4);
      assert.equal(result.aiFailures, 4);
      const sync = await checkState();
      assert.equal(
        sync.lastError,
        "The Claude API did not answer. Check ANTHROPIC_API_KEY.",
      );
      assert.equal((await ledger()).aiFailures, 4);
      const review = (await mailOverview()).review.filter((item) =>
        undecided.some((other) => other.threadId === item.threadId),
      );
      assert.equal(review.length, 4);
      assert.ok(review.every((item) => item.candidates.length === 0));
      // A person may start a card where the pipeline would not: no role, no hiring system,
      // no second reader.
      const first = await stored(undecided[0]);
      await resolveReview(first.id, {
        category: "rejection",
        applicationId: "new",
      });
      const resolved = await stored(undecided[0]);
      assert.equal(resolved.state, "applied");
      assert.equal(resolved.correctedFrom, "unrelated");
      assert.ok(resolved.applicationId);
      const made = await card(resolved.applicationId);
      assert.equal(made.status, "rejected");
      assert.equal(made.origin, "email");
      assert.equal(made.job.title, "Role not stated");
      assert.equal(
        normalizeCompany(made.job.company),
        normalizeCompany(company("e")),
      );
      // Undoing the mail that created a card removes the card again.
      await undoMail(resolved.id);
      assert.equal(await db.application.count({ where: { id: made.id } }), 0);
      assert.equal(await db.job.count({ where: { id: made.jobId } }), 0);
      assert.equal((await stored(undecided[0])).state, "needs_review");
    });

    await step("15. own replies, single messages, repeats", async () => {
      const result = await check([myReply, myOther]);
      assert.equal(result.candidates, 1);
      assert.equal(result.ignored, 1);
      const reply = await stored(myReply);
      assert.equal(reply.state, "ignored");
      assert.equal(reply.decidedBy, "from-me");
      assert.equal(
        await db.mailMessage.count({ where: { gmailId: myOther.gmailId } }),
        0,
      );

      const events = (await counts()).events;
      const attached = await processMessage(secondReceipt, {
        ai: claude,
        dryRun: false,
        now,
      });
      assert.equal(attached.state, "attached");
      assert.equal(attached.decision.action, "attach");
      const application = await card(appA.id);
      assert.equal(application.status, "interview");
      assert.equal(iso(application.lastMailAt), iso(secondReceipt.receivedAt));
      assert.equal((await stored(secondReceipt)).applicationId, appA.id);
      assert.equal((await counts()).events, events);
      const again = await processMessage(secondReceipt, {
        ai: claude,
        dryRun: false,
        now,
      });
      assert.equal(again.id, attached.id);
      assert.equal(again.state, "attached");
      assert.equal(again.decision.action, "ignore");

      const proposed = await processMessage(laterRejection, {
        ai: claude,
        dryRun: true,
        now,
      });
      assert.equal(proposed.state, "proposed");
      assert.equal(proposed.decision.action, "update");
      assert.deepEqual(await card(appA.id), application);
      assert.equal((await counts()).events, events);
      // A proposal without a dry run that ran to its end is not applied.
      await assert.rejects(
        applyProposals(now),
        /The dry run did not finish\. Run npm run mail:backfill -- --resume/,
      );
      assert.equal((await stored(laterRejection)).state, "proposed");
      assert.equal(await discardProposals(), 1);
    });

    await step(
      "I1. an interview confirmation adds the interview and its next step; undoing an earlier mail leaves it",
      async () => {
        // The card is marked submitted by its receipt first.
        const receipt = await check([receiptW]);
        assert.equal(receipt.applied, 1);
        assert.equal((await card(appW.id)).status, "submitted");
        // The rules cannot place a Recruitee confirmation, so the mail waits in review. The
        // interview does not wait: the sender (the employer's own tenant) confirms the company.
        const result = await check([confirmed]);
        assert.equal(result.interviews, 1);
        const row = await stored(confirmed);
        assert.equal(row.state, "needs_review");
        const interviews = await db.interview.findMany({
          where: { applicationId: appW.id },
        });
        assert.equal(interviews.length, 1);
        const [added] = interviews;
        assert.equal(iso(added.startsAt), iso(iv.startsAt));
        assert.equal(iso(added.endsAt), iso(iv.endsAt));
        assert.equal(added.timezone, "Europe/Berlin");
        assert.equal(
          added.eventUrl,
          `https://careers.example.com/v/events/evt-w-${tag}`,
        );
        assert.equal(added.sourceMailId, row.id);
        assert.equal(added.status, "scheduled");
        // The interview changes the next step, never the stage.
        const application = await card(appW.id);
        assert.equal(application.status, "submitted");
        assert.equal(application.nextStep, iv.step);
        assert.equal(iso(application.nextStepDueAt), iso(iv.startsAt));
        assert.equal(
          await db.applicationEvent.count({
            where: {
              applicationId: appW.id,
              mailMessageId: null,
              note: { startsWith: "Interview scheduled" },
            },
          }),
          1,
        );
        // Added, so not offered again in review.
        const waiting = (await mailOverview()).review.find(
          (item) => item.id === row.id,
        );
        assert.ok(waiting);
        assert.equal(waiting.interview, null);
        // The same mail again: still one interview.
        const again = await check([receiptW, confirmed]);
        assert.equal(again.interviews, 0);
        assert.equal(
          await db.interview.count({ where: { applicationId: appW.id } }),
          1,
        );
        // The interview's event names no mail and keeps the status: it does not block undoing
        // the receipt before it, and the undo takes nothing of the interview away.
        const first = await stored(receiptW);
        assert.equal(
          (await mailForApplication(appW.id)).find(
            (item) => item.id === first.id,
          )?.undoable,
          true,
        );
        await undoMail(first.id);
        const restored = await card(appW.id);
        assert.equal(restored.status, "prepared");
        assert.equal(restored.submittedAt, null);
        assert.equal(restored.nextStep, iv.step);
        assert.equal(iso(restored.nextStepDueAt), iso(iv.startsAt));
        assert.equal(
          await db.interview.count({ where: { applicationId: appW.id } }),
          1,
        );
        assert.equal(
          await db.applicationEvent.count({
            where: {
              applicationId: appW.id,
              note: { startsWith: "Interview scheduled" },
            },
          }),
          1,
        );
      },
    );

    await step(
      "I2. an interview the sender does not confirm is offered in review, and a person adds it",
      async () => {
        const result = await check([forwarded]);
        assert.equal(result.interviews, 0);
        assert.equal(
          await db.interview.count({ where: { applicationId: appX.id } }),
          0,
        );
        const row = await stored(forwarded);
        assert.equal(row.state, "needs_review");
        const offered = (await mailOverview()).review.find(
          (item) => item.id === row.id,
        );
        assert.ok(offered?.interview);
        assert.equal(iso(offered.interview.startsAt), iso(iv.startsAt));
        assert.equal(offered.interview.provider, "recruitee");
        // JSON for the dashboard: the dates arrive as ISO strings.
        const json = JSON.parse(JSON.stringify(offered.interview));
        assert.equal(json.startsAt, iv.startsAt.toISOString());
        await assert.rejects(
          addInterview(row.id, "no-such-application"),
          /^Error: That application no longer exists\.$/,
        );
        await assert.rejects(
          addInterview("no-such-mail", appX.id),
          /^Error: This email is no longer stored\.$/,
        );
        const made = await addInterview(row.id, appX.id);
        assert.equal(made.created, true);
        const interview = await db.interview.findUniqueOrThrow({
          where: { id: made.interviewId },
        });
        assert.equal(interview.applicationId, appX.id);
        assert.equal(iso(interview.startsAt), iso(iv.startsAt));
        assert.equal((await card(appX.id)).nextStep, iv.step);
        // The card's stage is the person's to change; the mail waits in review as before.
        assert.equal((await card(appX.id)).status, "submitted");
        const after = await stored(forwarded);
        assert.equal(after.state, "needs_review");
        assert.equal(
          (await mailOverview()).review.find((item) => item.id === row.id)
            ?.interview ?? null,
          null,
        );
        // Added again: the same interview, not a second one.
        assert.equal((await addInterview(row.id, appX.id)).created, false);
        assert.equal(
          await db.interview.count({ where: { applicationId: appX.id } }),
          1,
        );
        // Only the calendar part has the time, and the calendar part is not stored: the offer
        // keeps what was read when the mail arrived.
        await check([forwardedInvite]);
        const invite = await stored(forwardedInvite);
        assert.equal(invite.state, "needs_review");
        assert.equal(invite.bodyText.includes("DTSTART"), false);
        const fromCalendar = (await mailOverview()).review.find(
          (item) => item.id === invite.id,
        );
        assert.equal(
          iso(fromCalendar?.interview?.startsAt),
          "2027-06-11T12:00:00.000Z",
        );
        // A mail with no interview in it cannot be added as one.
        await assert.rejects(
          addInterview((await stored(rejectionH)).id, appX.id),
          /^Error: No interview time or event link could be read from this email\.$/,
        );
      },
    );

    await step(
      "I3. mail stored before interviews were read: the one-off import, dry run first, safe to repeat",
      async () => {
        // Stored the way older mail is: linked to the card, no interview read from it yet.
        const old = await db.mailMessage.create({
          data: {
            gmailId: `${prefix}stored-confirmation`,
            threadId: `${prefix}thread-stored-confirmation`,
            fromAddress: `e+${tag}@${z.toLowerCase()}.recruitee.com`,
            fromName: `${z} Recruiting`,
            subject:
              "Confirmation: Video interview on Thursday, 10 June 2027 at 10:15 - 10:45 with Mara Lindqvist",
            receivedAt: daysAgo(4),
            bodyText: recruitee(z, `evt-z-${tag}`),
            category: "interview",
            confidence: "high",
            decidedBy: "interview.invitation.subject+ai",
            state: "attached",
            applicationId: appZ.id,
          },
        });
        const events = (await counts()).events;
        const dry = await interviewsFromStoredMail({
          dryRun: true,
          only: [old.id],
        });
        assert.equal(dry.read, 1);
        assert.equal(dry.added, 1);
        assert.equal(dry.interviews[0].company, z);
        assert.equal(iso(dry.interviews[0].startsAt), iso(iv.startsAt));
        // Nothing of it was written.
        assert.equal(
          await db.interview.count({ where: { applicationId: appZ.id } }),
          0,
        );
        assert.equal((await card(appZ.id)).nextStep, null);
        assert.equal((await counts()).events, events);
        const first = await interviewsFromStoredMail({ only: [old.id] });
        assert.deepEqual([first.added, first.updated], [1, 0]);
        assert.equal(
          await db.interview.count({ where: { applicationId: appZ.id } }),
          1,
        );
        assert.equal((await card(appZ.id)).nextStep, iv.step);
        const written = (await counts()).events;
        const second = await interviewsFromStoredMail({ only: [old.id] });
        assert.deepEqual([second.added, second.updated], [0, 1]);
        assert.equal(
          await db.interview.count({ where: { applicationId: appZ.id } }),
          1,
        );
        assert.equal((await counts()).events, written);
        assert.equal(await mailLive(), true);
      },
    );

    await step(
      "I4. a dry run lists the interview it would add, read from the calendar part, and --apply adds it",
      async () => {
        const dryRun = await syncMail({
          client: fake([invitation]),
          ai: claude,
          dryRun: true,
          now,
        });
        assert.equal(dryRun.candidates, 1);
        const summary = await proposalSummary();
        assert.deepEqual(
          summary.interviews.map((item) => [
            item.id,
            item.company,
            iso(item.startsAt),
          ]),
          [[(await stored(invitation)).id, y, "2027-06-11T12:00:00.000Z"]],
        );
        assert.equal(
          await db.interview.count({ where: { applicationId: appY.id } }),
          0,
        );
        const applied = await applyProposals(now);
        assert.equal(applied.interviews, 1);
        assert.equal(applied.complete, true);
        const [added] = await db.interview.findMany({
          where: { applicationId: appY.id },
        });
        // The time came from the calendar part, which was never stored.
        assert.equal(iso(added?.startsAt), "2027-06-11T12:00:00.000Z");
        assert.equal(iso(added?.endsAt), "2027-06-11T13:00:00.000Z");
        assert.equal(
          (await stored(invitation)).bodyText.includes("DTSTART"),
          false,
        );
      },
    );

    await step(
      "I5. prep left running by a stopped worker is queued again after 90 minutes",
      async () => {
        const make = (prepStatus: string) =>
          db.interview.create({
            data: { applicationId: appW.id, prepStatus, title: "Prep test" },
          });
        const stale = await make("running");
        const fresh = await make("running");
        const queued = await make("queued");
        await db.$executeRaw`UPDATE "Interview" SET "updatedAt" = now() - interval '91 minutes' WHERE id IN (${stale.id}, ${queued.id})`;
        const only = [stale.id, fresh.id, queued.id];
        assert.equal(await requeueStalePrep({ only }), 1);
        const status = async (id: string) =>
          (await db.interview.findUniqueOrThrow({ where: { id } })).prepStatus;
        assert.equal(await status(stale.id), "queued");
        assert.equal(await status(fresh.id), "running");
        assert.equal(await status(queued.id), "queued");
        assert.equal(await requeueStalePrep({ only }), 0);
        await db.interview.deleteMany({ where: { id: { in: only } } });
      },
    );

    await step(
      "16. reclassify applies what both readers now agree on, within its limits",
      async () => {
        const others = await db.mailMessage.count({
          where: {
            NOT: { gmailId: { startsWith: prefix } },
            decidedBy: { not: "user" },
            OR: [{ decidedBy: "none" }, { state: "needs_review" }],
          },
        });
        if (others) {
          // reclassifyMail() reads every stored mail that waits; real ones must not meet a fake classifier.
          console.log(
            "Skipped the reclassify step: real mail is waiting for review.",
          );
          return;
        }
        const stale = await syncMail({
          client: fake([undecidedP]),
          ai: null,
          now,
        });
        assert.equal(stale.review, 1);
        // undecided[2] was corrected by the user at some point and is back in review.
        await db.mailMessage.update({
          where: { gmailId: undecided[2].gmailId },
          data: { correctedFrom: "confirmation" },
        });
        const role = "Backend Engineer";
        says.set(undecidedP.gmailId, { company: p, role });
        says.set(undecided[2].gmailId, { company: company("g"), role });
        says.set(undecided[1].gmailId, { company: company("f"), role });
        says.set(undecided[3].gmailId, { company: company("t"), role });
        const mine = await stored(undecided[0]);
        const undone = await stored(secondRound);
        const disputed = await stored(rejectionQ);
        const sent = read.length;
        const result = await reclassifyMail({
          ai: async (item) => {
            // The user files one mail while Claude is still being asked about it, and
            // another check touches a second one.
            if (item.gmailId === undecided[1].gmailId)
              await ignoreMail((await stored(undecided[1])).id);
            if (item.gmailId === undecided[3].gmailId)
              await db.mailMessage.update({
                where: { gmailId: item.gmailId },
                data: { matchReason: "Touched by another check." },
              });
            return claude(item);
          },
          now,
        });
        const { checked, aiCalls, ...outcome } = result;
        assert.ok(checked >= 6);
        assert.equal(aiCalls, read.length - sent);
        assert.ok(aiCalls >= 6);
        assert.deepEqual(outcome, {
          changed: 4,
          applied: 2,
          attached: 0,
          created: 0,
          review: 2,
          ignored: 0,
        });
        // The rules read these rejections alone before; now Claude agrees and the cards close.
        for (const [item, appId] of [
          [rejectionR, appR.id],
          [rejectionS, appS.id],
        ] as const) {
          const row = await stored(item);
          assert.equal(row.state, "applied");
          assert.match(row.decidedBy, /\+ai$/);
          assert.equal(row.applicationId, appId);
          assert.equal((await card(appId)).status, "rejected");
        }
        // Claude alone reads this as a rejection: stored as its guess, nothing is created.
        const guessed = await stored(undecidedP);
        assert.equal(guessed.state, "needs_review");
        assert.equal(guessed.category, "rejection");
        assert.equal(guessed.decidedBy, "ai");
        assert.match(
          guessed.matchReason,
          /^Only Claude read this as a rejection/,
        );
        assert.equal(await db.job.count({ where: { company: p } }), 0);
        // Handled by the user during the wait: left exactly as the user left it.
        const raced = await stored(undecided[1]);
        assert.equal(raced.state, "ignored");
        assert.equal(raced.decidedBy, "user");
        // Touched by another check during the wait: left as that check left it.
        const touched = await stored(undecided[3]);
        assert.equal(touched.decidedBy, "none");
        assert.equal(touched.matchReason, "Touched by another check.");
        // Corrected by the user before: the guess is updated, and it stays in review.
        const corrected = await stored(undecided[2]);
        assert.equal(corrected.state, "needs_review");
        assert.equal(corrected.category, "rejection");
        assert.match(corrected.matchReason, /stays in review/);
        // Filed or undone by the user, still disputed, or unchanged: not touched.
        assert.deepEqual(await stored(undecided[0]), mine);
        assert.deepEqual(await stored(secondRound), undone);
        assert.deepEqual(await stored(rejectionQ), disputed);
        assert.equal((await card(appQ.id)).status, "submitted");
        assert.equal((await stored(proposedK)).state, "needs_review");
        assert.equal((await card(appK.id)).status, "withdrawn");
        assert.equal((await stored(olderRejection)).state, "needs_review");
        assert.equal((await card(appA.id)).status, "interview");
        assert.equal((await checkState()).lastError, null);
      },
    );

    await step(
      "17. a check that lost its lease stops and leaves the other check's lease alone",
      async () => {
        const earlier = await checkState();
        const taken = new Date(Date.now() + 3_600_000);
        const result = await syncMail({
          client: {
            list: async () => [ref("handover")],
            get: async () => {
              // Another process claims the lease while this one is busy (or was asleep).
              await db.mailSync.update({
                where: { id: checkId },
                data: { leaseUntil: taken },
              });
              return handover;
            },
          },
          ai: claude,
          now,
        });
        assert.equal(result.skipped, false);
        assert.equal(result.reason, "lease-lost");
        assert.equal(result.candidates, 0);
        assert.equal(
          await db.mailMessage.count({ where: { gmailId: handover.gmailId } }),
          0,
        );
        const sync = await checkState();
        assert.equal(iso(sync.leaseUntil), iso(taken));
        assert.equal(iso(sync.lastCheckedAt), iso(earlier.lastCheckedAt));
        assert.equal(iso(sync.lastSuccessAt), iso(earlier.lastSuccessAt));
        // While that lease is held, nothing else starts.
        const busy = await check([handover]);
        assert.equal(busy.skipped, true);
        assert.equal(busy.reason, "busy");
        await assert.rejects(reclassifyMail({ ai: null, now }), /is running/);
        assert.equal(iso((await checkState()).leaseUntil), iso(taken));
      },
    );
  } catch (error) {
    failure = error;
  } finally {
    delete process.env.MAIL_SECOND_OPINION;
    // Nothing synthetic may have reached a real card: no event naming a synthetic mail, no
    // interview from one.
    const ours = (
      await db.mailMessage.findMany({
        where: { gmailId: { startsWith: prefix } },
        select: { id: true },
      })
    ).map((item) => item.id);
    strays += await db.applicationEvent.count({
      where: { mailMessageId: { in: ours }, NOT: { application: fixtures } },
    });
    strays += await db.interview.count({
      where: { sourceMailId: { in: ours }, NOT: { application: fixtures } },
    });
    // Before anything is removed: no synthetic mail may hang on a card that is not a fixture.
    strays = await db.mailMessage.count({
      where: {
        gmailId: { startsWith: prefix },
        applicationId: { not: null },
        NOT: { application: fixtures },
      },
    });
    const threadKeys = synthetic.flatMap((item) => [
      hash(`mail:${item.threadId}`),
      hash(`mail:${item.threadId}:${item.gmailId}`),
    ]);
    const jobs = await db.job.findMany({
      where: {
        OR: [
          { canonicalKey: { startsWith: prefix } },
          { canonicalKey: { in: threadKeys } },
          { company: { startsWith: `Mailtest${tag}` } },
        ],
      },
      select: { id: true },
    });
    const jobIds = jobs.map((item) => item.id);
    await db.applicationEvent.deleteMany({
      where: { application: { jobId: { in: jobIds } } },
    });
    await db.mailMessage.deleteMany({
      where: { gmailId: { startsWith: prefix } },
    });
    await db.application.deleteMany({ where: { jobId: { in: jobIds } } });
    await db.listing.deleteMany({ where: { jobId: { in: jobIds } } });
    await db.job.deleteMany({ where: { id: { in: jobIds } } });
    if (!before.source) {
      const source = await db.source.findUnique({
        where: { key: "mail" },
        include: { _count: { select: { listings: true } } },
      });
      if (source && !source._count.listings)
        await db.source.delete({ where: { id: source.id } });
    }
    await db.mailSync.deleteMany({ where: { id: checkId } });
    await db.setting.deleteMany({ where: { key: liveKey } });
  }

  // The real board carries no trace of this run. Mail is live on this database, so the
  // worker may have stored mail and moved cards meanwhile: what is compared is what only this
  // run could have touched, and real cards are compared only when no real check ran.
  assert.equal(strays, 0, "something synthetic reached a real application");
  const sync = await db.mailSync.findUnique({ where: { id: "gmail" } });
  const quiet = iso(sync?.lastCheckedAt) === iso(before.sync?.lastCheckedAt);
  if (quiet) {
    // No real check ran: the real check state is exactly as it was.
    assert.deepEqual(sync, before.sync);
    const mailFields = (item: (typeof realApplications)[number]) => ({
      origin: item.origin,
      nextStep: item.nextStep,
      nextStepDueAt: item.nextStepDueAt,
      lastMailAt: item.lastMailAt,
    });
    const earlier = new Map(realApplications.map((item) => [item.id, item]));
    const current = await db.application.findMany({
      where: { id: { in: [...earlier.keys()] } },
      include: { job: { select: { company: true, title: true } } },
    });
    for (const item of current)
      assert.deepEqual(
        mailFields(item),
        mailFields(earlier.get(item.id)!),
        `mail fields changed on the real application at ${item.job.company}`,
      );
  } else
    console.log(
      "A real mail check ran during this test: real cards were not compared field by field.",
    );
  // Stored real mail is never rewritten by a check, so it must be exactly as it was.
  const mailNow = new Map(
    (
      await db.mailMessage.findMany({
        where: { id: { in: before.mailRows.map((item) => item.id) } },
        select: {
          id: true,
          state: true,
          applicationId: true,
          category: true,
          decidedBy: true,
          matchReason: true,
          correctedFrom: true,
          proposal: true,
        },
      })
    ).map((item) => [item.id, item]),
  );
  for (const item of before.mailRows)
    assert.deepEqual(
      mailNow.get(item.id),
      item,
      `real mail ${item.id} changed`,
    );
  // Real interviews: none added from synthetic mail (above), none changed or removed.
  const interviewsNow = new Map(
    (
      await db.interview.findMany({
        where: { id: { in: before.interviews.map((item) => item.id) } },
      })
    ).map((item) => [item.id, item]),
  );
  for (const item of before.interviews)
    assert.deepEqual(
      interviewsNow.get(item.id)?.sourceMailId,
      item.sourceMailId,
      `real interview ${item.id} changed`,
    );
  assert.deepEqual(
    await db.setting.findUnique({ where: { key: "mailLive" } }),
    before.live,
  );
  assert.equal(
    (await db.source.findUnique({ where: { key: "mail" } }))?.id,
    before.source?.id,
  );
  assert.equal(await db.job.count({ where: fixtures.job }), 0);
  assert.equal(
    await db.mailSync.count({ where: { id: { startsWith: "mailtest-" } } }),
    0,
  );
  assert.equal(
    await db.setting.count({ where: { key: { startsWith: "mailLive:" } } }),
    0,
  );
  if (failure) throw failure;
});
test.after(() => db.$disconnect());
