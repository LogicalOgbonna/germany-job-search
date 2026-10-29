import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { db } from "../../src/lib/db";
import {
  createInterview,
  deleteInterview,
  findPrepFile,
  formatInterviewTime,
  homeTimezone,
  interviewDetail,
  interviewStepText,
  interviewsForApplication,
  requestPrep,
  syncQuestions,
  upcomingInterviews,
  updateInterview,
  updateQuestion,
  upsertInterviewFromMail,
} from "../../src/lib/interviews/store";
import type {
  ParsedInterview,
  PrepQuestion,
  PrepSheet,
} from "../../src/lib/interviews/types";
import * as listRoute from "../../src/app/api/interviews/route";
import * as itemRoute from "../../src/app/api/interviews/[id]/route";
import * as questionRoute from "../../src/app/api/interviews/[id]/questions/[qid]/route";
import * as prepRoute from "../../src/app/api/interviews/[id]/prep/route";
import * as thankYouRoute from "../../src/app/api/interviews/[id]/thank-you/route";

// This runs against the local Jobdesk database, which holds real applications. Every row it
// writes belongs to a job whose company starts with `Ivtest-<tag>` or a mail whose gmailId
// starts with `ivtest-<tag>-`, and everything is removed in `finally`.
const tag = randomUUID().replaceAll("-", "").slice(0, 10);
const companyPrefix = `Ivtest-${tag}`;
const mailPrefix = `ivtest-${tag}-`;
const hour = 3_600_000;
const day = 24 * hour;

test("interview time on the card reads like the confirmation", () => {
  const start = new Date("2026-10-22T08:15:00Z");
  assert.equal(
    formatInterviewTime(start, "Europe/Berlin"),
    "Thu 22 Oct, 10:15",
  );
  assert.equal(
    interviewStepText(start, "Europe/Berlin"),
    "Interview Thu 22 Oct, 10:15",
  );
  // The card is read in Berlin: a confirmation in another zone still shows Berlin time.
  assert.equal(homeTimezone, "Europe/Berlin");
  assert.equal(
    interviewStepText(start, "America/New_York"),
    "Interview Thu 22 Oct, 10:15",
  );
  assert.equal(
    formatInterviewTime(start, "America/New_York"),
    "Thu 22 Oct, 04:15",
  );
});

test("findPrepFile matches normalised company and role folders, newest date first", async () => {
  const root = await mkdtemp(join(tmpdir(), "ivtest-jobs-"));
  const previous = process.env.JOBS_ROOT;
  process.env.JOBS_ROOT = root;
  const prep = async (date: string, company: string, role: string) => {
    const dir = join(root, date, company, role);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "intro_prep.md"), `# ${date} ${company}`);
  };
  try {
    await prep("01-09-2026", "acme", "senior_frontend_engineer");
    await prep("15-10-2026", "acme", "senior_frontend_engineer");
    await prep("20-10-2026", "acme", "staff_engineer");
    // Newest folder for the role, but no prep file in it.
    await mkdir(join(root, "18-10-2026", "acme", "senior_frontend_engineer"), {
      recursive: true,
    });
    await prep("03-03-2026", "societe_generale", "frontend_developer_react");
    await prep(
      "04-04-2026",
      "wolt",
      "senior_frontend_engineer_growth_and_marketing",
    );
    await mkdir(join(root, "not-a-date", "acme", "senior_frontend_engineer"), {
      recursive: true,
    });

    const found = await findPrepFile(
      "Acme GmbH",
      "Senior Frontend Engineer (m/f/d)",
    );
    assert.ok(found);
    assert.equal(
      found.path,
      join(
        root,
        "15-10-2026",
        "acme",
        "senior_frontend_engineer",
        "intro_prep.md",
      ),
    );
    assert.equal(found.markdown, "# 15-10-2026 acme");
    assert.equal(
      (await findPrepFile("ACME Technologies SE", "Senior Frontend Engineer"))
        ?.markdown,
      "# 15-10-2026 acme",
    );
    assert.equal(
      (await findPrepFile("Société Générale", "Frontend Developer (React)"))
        ?.markdown,
      "# 03-03-2026 societe_generale",
    );
    assert.equal(
      (
        await findPrepFile(
          "Wolt",
          "Senior Frontend Engineer, Growth & Marketing (all genders)",
        )
      )?.markdown,
      "# 04-04-2026 wolt",
    );
    assert.equal(await findPrepFile("Acme", "Backend Engineer"), null);
    assert.equal(
      await findPrepFile("Other Company", "Senior Frontend Engineer"),
      null,
    );
  } finally {
    if (previous === undefined) delete process.env.JOBS_ROOT;
    else process.env.JOBS_ROOT = previous;
    await rm(root, { recursive: true, force: true });
  }

  // Read only, against this repository's own jobs folder when it is there.
  const real = join(
    process.cwd(),
    "jobs/12-10-2026/distribusion/senior_frontend_engineer/intro_prep.md",
  );
  if (existsSync(real) && !process.env.JOBS_ROOT) {
    const found = await findPrepFile(
      "Distribusion Technologies GmbH",
      "Senior Frontend Engineer (all genders)",
    );
    assert.equal(
      found?.path,
      "jobs/12-10-2026/distribusion/senior_frontend_engineer/intro_prep.md",
    );
  }
});

const sheet = (questions: string[]): PrepSheet => ({
  version: 1,
  stage: "talent",
  generatedAt: new Date().toISOString(),
  model: "fake",
  logistics: [],
  company: { summary: "", facts: [], reasons: [] },
  role: { responsibilities: [], challenges: [], mustHave: [], niceToHave: [] },
  matches: [],
  transferable: [],
  gaps: [],
  scripts: { whyCompany: "", lookingFor: "", aboutMe: "" },
  questions: questions.map((question): PrepQuestion => ({
    question,
    outline: [`First point for ${question}`, "Second point"],
    evidence: [{ claim: "Claim", quote: "A quoted line", role: "Some Role" }],
  })),
  askThem: [],
  checklist: [],
  warnings: [],
  dropped: [],
});

const parsed = (values: Partial<ParsedInterview>): ParsedInterview => ({
  startsAt: null,
  endsAt: null,
  timezone: "Europe/Berlin",
  meetingUrl: null,
  eventUrl: null,
  rescheduleUrl: null,
  interviewers: [],
  title: "Video interview",
  provider: "recruitee",
  cancelled: false,
  ...values,
});

const origin = "http://localhost:3000";
const request = (
  path: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = { origin },
) =>
  new NextRequest(`${origin}${path}`, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = <T>(value: T) => ({ params: Promise.resolve(value) });
const STEP = /^Interview [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]+, \d{2}:\d{2}$/;

test("interview store and API against the local database, synthetic rows only", async () => {
  const startedAt = new Date();
  const ours = { job: { company: { startsWith: companyPrefix } } };
  const notOurs = { NOT: { job: { company: { startsWith: companyPrefix } } } };
  // Nothing has been written yet: stop before touching anything if the tag is not unique.
  assert.equal(
    await db.job.count({ where: { company: { startsWith: companyPrefix } } }),
    0,
  );
  assert.equal(
    await db.mailMessage.count({
      where: { gmailId: { startsWith: mailPrefix } },
    }),
    0,
  );
  const realCards = await db.application.findMany({
    where: notOurs,
    select: { id: true, nextStep: true, nextStepDueAt: true },
  });
  const before = {
    interviews: await db.interview.count({ where: { application: notOurs } }),
    questions: await db.interviewQuestion.count({
      where: { interview: { application: notOurs } },
    }),
    practice: await db.practiceSession.count({
      where: { interview: { application: notOurs } },
    }),
  };
  const root = await mkdtemp(join(tmpdir(), "ivtest-jobs-"));
  const previousRoot = process.env.JOBS_ROOT;
  process.env.JOBS_ROOT = root;
  const jobIds: string[] = [];
  const makeCard = async (
    letter: string,
    card: { nextStep?: string; nextStepDueAt?: Date } = {},
  ) => {
    const company = `${companyPrefix}${letter}`;
    const job = await db.job.create({
      data: {
        canonicalKey: `${mailPrefix}${letter}`,
        title: "Senior Frontend Engineer",
        company,
        location: "Berlin",
        countries: ["DE"],
        description: "Synthetic interview fixture.",
        applyUrl: `https://example.com/${mailPrefix}${letter}`,
        track: "Frontend",
        skills: [],
        score: 50,
        reasons: [],
        contentHash: `${mailPrefix}${letter}`,
      },
    });
    jobIds.push(job.id);
    return db.application.create({
      data: {
        jobId: job.id,
        status: "interview",
        submittedAt: new Date(Date.now() - 10 * day),
        notes: "Salary expectation recorded",
        ...card,
      },
    });
  };
  const card = (id: string) =>
    db.application.findUniqueOrThrow({ where: { id } });
  const row = (id: string) => db.interview.findUniqueOrThrow({ where: { id } });
  const mail = (
    name: string,
    applicationId: string,
    receivedAt: Date,
    thread = name,
  ) =>
    db.mailMessage.create({
      data: {
        gmailId: `${mailPrefix}${name}`,
        threadId: `${mailPrefix}thread-${thread}`,
        fromAddress: "no-reply@example.com",
        subject: `Confirmation ${name}`,
        receivedAt,
        bodyText: "Synthetic confirmation.",
        category: "interview",
        confidence: "high",
        decidedBy: "rules",
        state: "applied",
        applicationId,
      },
    });
  try {
    const now = new Date();
    const at = (ms: number) => new Date(now.valueOf() + ms);

    // Create: the card's earlier mail step gives way to the interview.
    const a = await makeCard("a", {
      nextStep: "Reply to the recruiter",
      nextStepDueAt: at(day),
    });
    const first = await createInterview(a.id, {
      stage: "talent",
      startsAt: at(3 * day),
      endsAt: at(3 * day + 30 * 60_000),
      timezone: "Europe/Berlin",
      interviewers: [{ name: "Synthetic Recruiter", role: "Talent" }],
      meetingUrl: "https://meet.example.com/abc",
    });
    let cardA = await card(a.id);
    assert.equal(
      cardA.nextStep,
      interviewStepText(at(3 * day), "Europe/Berlin"),
    );
    assert.match(cardA.nextStep!, STEP);
    assert.equal(cardA.nextStepDueAt?.valueOf(), at(3 * day).valueOf());
    assert.equal(cardA.status, "interview");
    const scheduled = await db.applicationEvent.findMany({
      where: { applicationId: a.id },
    });
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0].status, "interview");
    assert.match(scheduled[0].note ?? "", /^Interview scheduled/);
    assert.equal(scheduled[0].mailMessageId, null);
    assert.equal((await row(first.id)).title, "Talent screen");

    // A step due later than the interview, set by something else, is kept.
    const b = await makeCard("b", {
      nextStep: "Offer call",
      nextStepDueAt: at(30 * day),
    });
    const other = await createInterview(b.id, {
      stage: "final",
      title: "Final round",
      startsAt: at(3 * day + hour),
    });
    assert.equal((await card(b.id)).nextStep, "Offer call");

    // Several rounds: the card shows the soonest.
    const second = await createInterview(a.id, {
      stage: "technical",
      startsAt: at(day),
    });
    cardA = await card(a.id);
    assert.equal(cardA.nextStep, interviewStepText(at(day), "Europe/Berlin"));
    const undated = await createInterview(a.id, { stage: "other" });
    const recent = await createInterview(a.id, {
      stage: "assessment",
      startsAt: at(-hour),
    });
    const past = await createInterview(a.id, {
      stage: "assessment",
      startsAt: at(-5 * hour),
    });
    assert.equal(
      (await card(a.id)).nextStep,
      interviewStepText(at(day), "Europe/Berlin"),
      "an interview in the past does not replace the next step",
    );

    // Upcoming: within the last 2 hours or later, soonest first, undated last.
    const ids = new Set([
      first.id,
      second.id,
      undated.id,
      recent.id,
      past.id,
      other.id,
    ]);
    const upcoming = (await upcomingInterviews(now)).filter((item) =>
      ids.has(item.id),
    );
    assert.deepEqual(
      upcoming.map((item) => item.id),
      [recent.id, second.id, first.id, other.id, undated.id],
    );
    assert.equal(upcoming[2].company, `${companyPrefix}a`);
    assert.equal(upcoming[2].role, "Senior Frontend Engineer");
    assert.equal(upcoming[2].jobId, a.jobId);
    assert.equal(upcoming[2].meetingUrl, "https://meet.example.com/abc");
    assert.equal(upcoming[2].prepStatus, "none");
    assert.deepEqual(
      (await interviewsForApplication(a.id)).map((item) => item.id),
      [past.id, recent.id, second.id, first.id, undated.id],
    );

    // Moving an interview moves the card's step.
    await updateInterview(second.id, { startsAt: at(2 * day) });
    cardA = await card(a.id);
    assert.equal(
      cardA.nextStep,
      interviewStepText(at(2 * day), "Europe/Berlin"),
    );
    assert.equal(cardA.nextStepDueAt?.valueOf(), at(2 * day).valueOf());
    assert.ok(
      await db.applicationEvent.findFirst({
        where: { applicationId: a.id, note: { startsWith: "Interview moved" } },
      }),
    );

    // Cancelling the round on the card falls back to the next round, then clears.
    await updateInterview(second.id, { status: "cancelled" });
    cardA = await card(a.id);
    assert.equal(
      cardA.nextStep,
      interviewStepText(at(3 * day), "Europe/Berlin"),
    );
    assert.ok(
      await db.applicationEvent.findFirst({
        where: {
          applicationId: a.id,
          note: { startsWith: "Interview cancelled" },
        },
      }),
    );
    await updateInterview(first.id, { status: "cancelled" });
    cardA = await card(a.id);
    assert.equal(cardA.nextStep, null);
    assert.equal(cardA.nextStepDueAt, null);
    assert.equal(cardA.status, "interview");
    assert.equal(
      (await upcomingInterviews(now)).some((item) => item.id === first.id),
      false,
    );

    // Debrief next steps become the card's step, without a due date.
    await updateInterview(recent.id, {
      status: "done",
      debrief: "Went well",
      nextSteps: "Send references to the recruiter",
      notes: "Prepared notes",
      checklist: [{ label: "Test the camera", done: true }],
    });
    cardA = await card(a.id);
    assert.equal(cardA.nextStep, "Send references to the recruiter");
    assert.equal(cardA.nextStepDueAt, null);
    const done = await row(recent.id);
    assert.equal(done.debrief, "Went well");
    assert.deepEqual(done.checklist, [
      { label: "Test the camera", done: true },
    ]);

    // Deleting the interview on the card clears its step.
    const fifth = await createInterview(a.id, {
      stage: "final",
      startsAt: at(5 * day),
    });
    assert.equal(
      (await card(a.id)).nextStep,
      interviewStepText(at(5 * day), "Europe/Berlin"),
    );
    await deleteInterview(fifth.id);
    assert.equal((await card(a.id)).nextStep, null);
    await assert.rejects(deleteInterview(fifth.id), /no longer exists/);

    // Bad input is refused with a readable message.
    await assert.rejects(
      createInterview(a.id, { stage: "talent", timezone: "Mars/Olympus" }),
      /time zone/,
    );
    await assert.rejects(
      createInterview(a.id, {
        stage: "talent",
        startsAt: at(day),
        endsAt: at(day - hour),
      }),
      /end/i,
    );
    await assert.rejects(
      createInterview("no-such-application", { stage: "talent" }),
      /application/,
    );
    const unsafe = await createInterview(a.id, {
      stage: "other",
      meetingUrl: "javascript:alert(1)",
    });
    assert.equal((await row(unsafe.id)).meetingUrl, null);

    // From mail: the same event link is the same interview, rescheduled.
    const c = await makeCard("c");
    const m1 = await mail("m1", c.id, at(-3 * day));
    const eventUrl = `https://example.recruitee.com/events/${tag}`;
    const fromMail = await upsertInterviewFromMail({
      applicationId: c.id,
      mailId: m1.id,
      receivedAt: m1.receivedAt,
      parsed: parsed({
        startsAt: at(4 * day),
        endsAt: at(4 * day + 30 * 60_000),
        eventUrl,
        rescheduleUrl: `${eventUrl}/reschedule`,
        meetingUrl: "https://meet.example.com/xyz",
        interviewers: [{ name: "Synthetic Interviewer" }],
      }),
    });
    assert.ok(fromMail);
    assert.equal(fromMail.created, true);
    let mailed = await row(fromMail.interviewId);
    assert.equal(mailed.sourceMailId, m1.id);
    assert.equal(mailed.title, "Video interview");
    assert.equal(mailed.eventUrl, eventUrl);
    assert.deepEqual(mailed.interviewers, [{ name: "Synthetic Interviewer" }]);
    assert.equal(
      (await card(c.id)).nextStep,
      interviewStepText(at(4 * day), "Europe/Berlin"),
    );
    const again = await upsertInterviewFromMail({
      applicationId: c.id,
      mailId: m1.id,
      receivedAt: m1.receivedAt,
      parsed: parsed({ startsAt: at(4 * day), eventUrl }),
    });
    assert.deepEqual(again, {
      interviewId: fromMail.interviewId,
      created: false,
    });

    const m2 = await mail("m2", c.id, at(-2 * day));
    const moved = await upsertInterviewFromMail({
      applicationId: c.id,
      mailId: m2.id,
      receivedAt: m2.receivedAt,
      parsed: parsed({ startsAt: at(6 * day), eventUrl }),
    });
    assert.deepEqual(moved, {
      interviewId: fromMail.interviewId,
      created: false,
    });
    mailed = await row(fromMail.interviewId);
    assert.equal(mailed.startsAt?.valueOf(), at(6 * day).valueOf());
    assert.equal(mailed.meetingUrl, "https://meet.example.com/xyz");
    assert.equal(mailed.sourceMailId, m2.id);
    assert.equal(
      (await card(c.id)).nextStep,
      interviewStepText(at(6 * day), "Europe/Berlin"),
    );

    // An older mail read later does not undo the newer one.
    const m0 = await mail("m0", c.id, at(-4 * day));
    const stale = await upsertInterviewFromMail({
      applicationId: c.id,
      mailId: m0.id,
      receivedAt: m0.receivedAt,
      parsed: parsed({ startsAt: at(4 * day), eventUrl }),
    });
    assert.deepEqual(stale, {
      interviewId: fromMail.interviewId,
      created: false,
    });
    assert.equal(
      (await row(fromMail.interviewId)).startsAt?.valueOf(),
      at(6 * day).valueOf(),
    );

    // The same time (within 5 minutes) without an event link is the same interview.
    const m3 = await mail("m3", c.id, at(-day));
    const sameTime = await upsertInterviewFromMail({
      applicationId: c.id,
      mailId: m3.id,
      receivedAt: m3.receivedAt,
      parsed: parsed({
        startsAt: at(6 * day + 3 * 60_000),
        provider: "calendly",
        title: null,
      }),
    });
    assert.deepEqual(sameTime, {
      interviewId: fromMail.interviewId,
      created: false,
    });
    assert.equal((await row(fromMail.interviewId)).eventUrl, eventUrl);

    // A different event at a different time is a new interview.
    const m4 = await mail("m4", c.id, at(-day));
    const secondRound = await upsertInterviewFromMail({
      applicationId: c.id,
      mailId: m4.id,
      receivedAt: m4.receivedAt,
      parsed: parsed({
        startsAt: at(8 * day),
        eventUrl: `${eventUrl}-2`,
        title: "Technical interview",
      }),
    });
    assert.ok(secondRound);
    assert.equal(secondRound.created, true);
    assert.notEqual(secondRound.interviewId, fromMail.interviewId);
    assert.equal((await row(secondRound.interviewId)).stage, "technical");
    // A reschedule that states the old time moves that round.
    const m5 = await mail("m5", c.id, at(-hour), "m4");
    const threadUpdate = await upsertInterviewFromMail({
      applicationId: c.id,
      mailId: m5.id,
      receivedAt: m5.receivedAt,
      parsed: parsed({ startsAt: at(9 * day), previousStartsAt: at(8 * day) }),
    });
    assert.deepEqual(threadUpdate, {
      interviewId: secondRound.interviewId,
      created: false,
    });
    assert.equal(
      (await row(secondRound.interviewId)).startsAt?.valueOf(),
      at(9 * day).valueOf(),
    );

    // Cancelled confirmation; and a mail with neither time nor link adds nothing.
    const m6 = await mail("m6", c.id, at(-hour / 2));
    await upsertInterviewFromMail({
      applicationId: c.id,
      mailId: m6.id,
      receivedAt: m6.receivedAt,
      parsed: parsed({ eventUrl, cancelled: true }),
    });
    assert.equal((await row(fromMail.interviewId)).status, "cancelled");
    assert.equal(
      (await card(c.id)).nextStep,
      interviewStepText(at(9 * day), "Europe/Berlin"),
    );
    assert.equal(
      await upsertInterviewFromMail({
        applicationId: c.id,
        mailId: m6.id,
        receivedAt: m6.receivedAt,
        parsed: parsed({}),
      }),
      null,
    );
    assert.equal(
      await db.interview.count({ where: { applicationId: c.id } }),
      2,
    );

    // Rounds in one thread, reschedules, Google links that differ only in a token.
    const d = await makeCard("d");
    const upsert = async (
      name: string,
      values: Partial<ParsedInterview>,
      options: {
        thread?: string;
        receivedAt?: Date;
        applicationId?: string;
      } = {},
    ) => {
      const applicationId = options.applicationId ?? d.id;
      const stored =
        (await db.mailMessage.findUnique({
          where: { gmailId: `${mailPrefix}${name}` },
        })) ??
        (await mail(
          name,
          applicationId,
          options.receivedAt ?? at(-day),
          options.thread ?? name,
        ));
      return upsertInterviewFromMail({
        applicationId,
        mailId: stored.id,
        receivedAt: stored.receivedAt,
        parsed: parsed(values),
      });
    };
    const roundOne = await upsert(
      "d1",
      { startsAt: at(4 * day), title: "Intro call" },
      { thread: "T", receivedAt: at(-5 * day) },
    );
    const roundTwo = await upsert(
      "d2",
      { startsAt: at(8 * day), title: "Technical interview" },
      { thread: "T", receivedAt: at(-4 * day) },
    );
    assert.ok(roundOne && roundTwo);
    assert.equal(roundTwo.created, true, "a second round in the thread is new");
    assert.notEqual(roundTwo.interviewId, roundOne.interviewId);
    // A cancellation without time or link, in a thread with two rounds: nothing to tell.
    assert.equal(
      await upsert(
        "d3",
        { cancelled: true, title: null },
        { thread: "T", receivedAt: at(-3 * day) },
      ),
      null,
    );
    assert.equal((await row(roundOne.interviewId)).status, "scheduled");
    assert.equal((await row(roundTwo.interviewId)).status, "scheduled");
    const rescheduled = await upsert(
      "d4",
      { startsAt: at(5 * day), previousStartsAt: at(4 * day), title: null },
      { thread: "U", receivedAt: at(-2 * day) },
    );
    assert.deepEqual(rescheduled, {
      interviewId: roundOne.interviewId,
      created: false,
    });
    assert.equal(
      (await row(roundOne.interviewId)).startsAt?.valueOf(),
      at(5 * day).valueOf(),
    );
    assert.equal(
      (await row(roundTwo.interviewId)).startsAt?.valueOf(),
      at(8 * day).valueOf(),
    );
    assert.equal((await card(d.id)).nextStep, interviewStepText(at(5 * day)));
    const google = (tok: string) =>
      `https://calendar.google.com/calendar/event?action=VIEW&eid=SYNTH${tag}&tok=${tok}&ctz=Europe%2FBerlin&hl=en&es=0`;
    const roundThree = await upsert(
      "d5",
      {
        startsAt: at(15 * day),
        eventUrl: google("AAA"),
        provider: "google-calendar",
      },
      { thread: "V", receivedAt: at(-2 * day) },
    );
    const updatedInvite = await upsert(
      "d6",
      {
        startsAt: at(16 * day),
        eventUrl: google("BBB"),
        provider: "google-calendar",
      },
      { thread: "W", receivedAt: at(-day) },
    );
    assert.ok(roundThree);
    assert.deepEqual(updatedInvite, {
      interviewId: roundThree.interviewId,
      created: false,
    });
    assert.equal(
      (await row(roundThree.interviewId)).startsAt?.valueOf(),
      at(16 * day).valueOf(),
    );
    // A cancellation in a thread with exactly one round cancels that round.
    const threadCancel = await upsert(
      "d7",
      { cancelled: true, title: null },
      { thread: "V", receivedAt: at(-hour) },
    );
    assert.deepEqual(threadCancel, {
      interviewId: roundThree.interviewId,
      created: false,
    });
    assert.equal((await row(roundThree.interviewId)).status, "cancelled");
    assert.equal(
      await db.interview.count({ where: { applicationId: d.id } }),
      3,
    );

    // Reading the same mail again changes nothing the person edited.
    await updateInterview(roundOne.interviewId, {
      startsAt: at(5 * day + hour),
    });
    await updateInterview(roundTwo.interviewId, { status: "cancelled" });
    const editedCard = await card(d.id);
    const editedRows = await db.interview.findMany({
      where: { applicationId: d.id },
      orderBy: { id: "asc" },
    });
    for (const name of ["d1", "d2", "d4", "d5", "d6", "d7"]) {
      const result = await upsert(name, {
        startsAt: name === "d2" ? at(8 * day) : at(4 * day),
        title: "Changed",
      });
      assert.equal(result?.created, false, name);
    }
    assert.deepEqual(
      await db.interview.findMany({
        where: { applicationId: d.id },
        orderBy: { id: "asc" },
      }),
      editedRows,
    );
    const cardAfter = await card(d.id);
    assert.equal(cardAfter.nextStep, editedCard.nextStep);
    assert.equal(
      cardAfter.nextStepDueAt?.valueOf(),
      editedCard.nextStepDueAt?.valueOf(),
    );

    // A reminder whose step the mail pipeline wrote over the interview's: the interview wins.
    await db.application.update({
      where: { id: d.id },
      data: { nextStep: "Read the reminder", nextStepDueAt: null },
    });
    const reminder = await upsert(
      "d8",
      { startsAt: at(5 * day + hour), title: null },
      { thread: "X", receivedAt: at(-hour / 4) },
    );
    assert.deepEqual(reminder, {
      interviewId: roundOne.interviewId,
      created: false,
    });
    assert.equal(
      (await card(d.id)).nextStep,
      interviewStepText(at(5 * day + hour)),
    );

    // A confirmation stated in New York time: the card reads Berlin time.
    const e = await makeCard("e");
    await upsert(
      "e1",
      { startsAt: at(20 * day), timezone: "America/New_York" },
      { applicationId: e.id },
    );
    const cardE = await card(e.id);
    assert.equal(
      cardE.nextStep,
      `Interview ${formatInterviewTime(at(20 * day), "Europe/Berlin")}`,
    );
    assert.notEqual(
      cardE.nextStep,
      `Interview ${formatInterviewTime(at(20 * day), "America/New_York")}`,
    );
    assert.equal(
      (await db.interview.findFirstOrThrow({ where: { applicationId: e.id } }))
        .timezone,
      "America/New_York",
    );

    // After the call: an interview that has ended no longer holds the card's step.
    const f = await makeCard("f");
    const over = await createInterview(f.id, {
      stage: "talent",
      startsAt: at(-3 * hour),
      endsAt: at(-2 * hour),
    });
    const later = await createInterview(f.id, {
      stage: "technical",
      startsAt: at(6 * day),
    });
    await db.application.update({
      where: { id: f.id },
      data: {
        nextStep: interviewStepText(at(-3 * hour)),
        nextStepDueAt: at(-3 * hour),
      },
    });
    await upsert(
      "f1",
      { startsAt: at(-3 * hour), title: null },
      { applicationId: f.id },
    );
    assert.equal((await card(f.id)).nextStep, interviewStepText(at(6 * day)));
    await updateInterview(later.id, { status: "cancelled" });
    assert.equal((await card(f.id)).nextStep, null);
    await db.application.update({
      where: { id: f.id },
      data: {
        nextStep: interviewStepText(at(-3 * hour)),
        nextStepDueAt: at(-3 * hour),
      },
    });
    const overAgain = await upsert(
      "f2",
      { startsAt: at(-3 * hour), title: null },
      { applicationId: f.id },
    );
    assert.equal(overAgain?.interviewId, over.id);
    assert.equal(
      (await card(f.id)).nextStep,
      null,
      "the past interview's step is cleared",
    );

    // Prep cannot be queued again while it runs; queued twice is one request.
    await db.interview.update({
      where: { id: over.id },
      data: { prepStatus: "running" },
    });
    await assert.rejects(
      requestPrep(over.id),
      /A prep sheet is being generated\. Try again when it finishes\./,
    );
    assert.equal((await row(over.id)).prepStatus, "running");
    await db.interview.update({
      where: { id: over.id },
      data: { prepStatus: "queued", prepError: "kept" },
    });
    await requestPrep(over.id);
    assert.equal((await row(over.id)).prepError, "kept");
    await assert.rejects(requestPrep("no-such-interview"), /no longer exists/);

    // Questions: regeneration keeps notes on matching questions, marks the rest stale.
    await syncQuestions(
      first.id,
      sheet([
        "Why this company?",
        "Tell me about yourself",
        "What is your notice period?",
      ]),
    );
    let questions = await db.interviewQuestion.findMany({
      where: { interviewId: first.id },
      orderBy: { position: "asc" },
    });
    assert.deepEqual(
      questions.map((item) => item.question),
      [
        "Why this company?",
        "Tell me about yourself",
        "What is your notice period?",
      ],
    );
    assert.equal(
      questions[0].outline,
      "First point for Why this company?\nSecond point",
    );
    await updateQuestion(questions[1].id, {
      userNotes: "Start with Genentech",
      ready: true,
    });
    await updateQuestion(questions[2].id, { userNotes: "Three months" });
    await syncQuestions(
      first.id,
      sheet([
        "How do you test React code?",
        "Tell me about yourself.",
        "Why this company?",
      ]),
    );
    questions = await db.interviewQuestion.findMany({
      where: { interviewId: first.id },
      orderBy: { position: "asc" },
    });
    assert.deepEqual(
      questions.map((item) => [item.question, item.stale]),
      [
        ["How do you test React code?", false],
        ["Tell me about yourself.", false],
        ["Why this company?", false],
        ["What is your notice period?", true],
      ],
    );
    assert.equal(questions[1].userNotes, "Start with Genentech");
    assert.equal(questions[1].ready, true);
    assert.equal(questions[3].userNotes, "Three months");
    // A stale question that comes back is current again, notes intact.
    await syncQuestions(first.id, sheet(["What is your notice period"]));
    const back = await db.interviewQuestion.findFirstOrThrow({
      where: { interviewId: first.id, userNotes: "Three months" },
    });
    assert.equal(back.stale, false);
    assert.equal(back.position, 0);
    await assert.rejects(
      updateQuestion("no-such-question", { ready: true }),
      /no longer exists/,
    );

    // Prep request and detail.
    await db.interview.update({
      where: { id: first.id },
      data: { prepStatus: "failed", prepError: "Earlier failure" },
    });
    await requestPrep(first.id);
    const queued = await row(first.id);
    assert.equal(queued.prepStatus, "queued");
    assert.equal(queued.prepError, null);
    await db.practiceSession.create({
      data: {
        interviewId: first.id,
        stage: "talent",
        turns: [{ question: "Q1" }, { question: "Q2" }],
      },
    });
    await mkdir(
      join(root, "12-10-2026", `ivtest_${tag}a`, "senior_frontend_engineer"),
      {
        recursive: true,
      },
    );
    await writeFile(
      join(
        root,
        "12-10-2026",
        `ivtest_${tag}a`,
        "senior_frontend_engineer",
        "intro_prep.md",
      ),
      "# Synthetic prep",
    );
    const detail = await interviewDetail(first.id);
    assert.equal(detail.interview.id, first.id);
    assert.equal(detail.interview.prep, null);
    assert.equal(detail.interview.stage, "talent");
    assert.deepEqual(detail.interview.interviewers, [
      { name: "Synthetic Recruiter", role: "Talent" },
    ]);
    assert.equal(detail.application.id, a.id);
    assert.equal(detail.application.company, `${companyPrefix}a`);
    assert.equal(detail.application.role, "Senior Frontend Engineer");
    assert.equal(
      detail.application.description,
      "Synthetic interview fixture.",
    );
    assert.equal(detail.application.notes, "Salary expectation recorded");
    assert.equal(detail.questions.length, 4);
    assert.equal(detail.practice.length, 1);
    assert.equal(detail.practice[0].turns, 2);
    assert.equal(detail.prepFile?.markdown, "# Synthetic prep");
    assert.deepEqual(detail.mails, []);
    const detailC = await interviewDetail(fromMail.interviewId);
    assert.equal(detailC.mails.length, 7);
    assert.equal(detailC.mails[0].id, m6.id, "newest mail first");
    assert.equal(detailC.prepFile, null);
    await assert.rejects(
      interviewDetail("no-such-interview"),
      /no longer exists/,
    );

    // API routes.
    const refused = await listRoute.POST(
      request(
        "/api/interviews",
        "POST",
        { applicationId: c.id, stage: "talent" },
        {},
      ),
    );
    assert.equal(refused.status, 400);
    assert.match((await refused.json()).error, /dashboard/);
    const posted = await listRoute.POST(
      request("/api/interviews", "POST", {
        applicationId: c.id,
        stage: "technical",
        title: "Pairing session",
        startsAt: at(10 * day).toISOString(),
        timezone: "Europe/London",
        interviewers: [{ name: "Synthetic Engineer", linkedin: "" }],
        meetingUrl: "",
      }),
    );
    const postedBody = (await posted.json()) as { id: string; error?: string };
    assert.equal(posted.status, 200, postedBody.error ?? "");
    const { id: apiId } = postedBody;
    const apiRow = await row(apiId);
    assert.equal(apiRow.title, "Pairing session");
    assert.equal(apiRow.timezone, "Europe/London");
    assert.equal(apiRow.meetingUrl, null);
    const invalid = await listRoute.POST(
      request("/api/interviews", "POST", {
        applicationId: c.id,
        stage: "lunch",
      }),
    );
    assert.equal(invalid.status, 400);
    const badLink = await listRoute.POST(
      request("/api/interviews", "POST", {
        applicationId: c.id,
        stage: "talent",
        meetingUrl: "javascript:alert(1)",
      }),
    );
    assert.equal(badLink.status, 400);
    const list = (await (
      await listRoute.GET(request("/api/interviews", "GET"))
    ).json()) as { id: string }[];
    assert.ok(list.some((item) => item.id === apiId));
    const forCard = (await (
      await listRoute.GET(
        request(`/api/interviews?applicationId=${c.id}`, "GET"),
      )
    ).json()) as { id: string }[];
    assert.equal(forCard.length, 3);
    const got = await itemRoute.GET(
      request(`/api/interviews/${apiId}`, "GET"),
      params({ id: apiId }),
    );
    assert.equal(
      ((await got.json()) as { interview: { id: string } }).interview.id,
      apiId,
    );
    const patched = await itemRoute.PATCH(
      request(`/api/interviews/${apiId}`, "PATCH", {
        endsAt: at(10 * day + hour).toISOString(),
        notes: "API notes",
        status: "scheduled",
      }),
      params({ id: apiId }),
    );
    assert.equal(patched.status, 200);
    assert.equal((await row(apiId)).notes, "API notes");
    const apiQuestionSheet = sheet(["Walk me through a design"]);
    await syncQuestions(apiId, apiQuestionSheet);
    const apiQuestion = await db.interviewQuestion.findFirstOrThrow({
      where: { interviewId: apiId },
    });
    const questionPatched = await questionRoute.PATCH(
      request(`/api/interviews/${apiId}/questions/${apiQuestion.id}`, "PATCH", {
        userNotes: "Use the design system story",
        ready: true,
      }),
      params({ id: apiId, qid: apiQuestion.id }),
    );
    assert.equal(questionPatched.status, 200);
    assert.equal(
      (
        await db.interviewQuestion.findUniqueOrThrow({
          where: { id: apiQuestion.id },
        })
      ).userNotes,
      "Use the design system story",
    );
    const wrongParent = await questionRoute.PATCH(
      request(
        `/api/interviews/${first.id}/questions/${apiQuestion.id}`,
        "PATCH",
        {
          ready: false,
        },
      ),
      params({ id: first.id, qid: apiQuestion.id }),
    );
    assert.equal(wrongParent.status, 400);
    const prepped = await prepRoute.POST(
      request(`/api/interviews/${apiId}/prep`, "POST"),
      params({ id: apiId }),
    );
    assert.equal(prepped.status, 200);
    assert.equal((await row(apiId)).prepStatus, "queued");
    const prepModule = join(process.cwd(), "src/lib/interviews/prep.ts");
    if (!existsSync(prepModule)) {
      // Task 4 has not landed: the route says so instead of failing. With prep.ts present
      // this would call Claude, so it is not exercised here.
      const thanks = await thankYouRoute.POST(
        request(`/api/interviews/${apiId}/thank-you`, "POST"),
        params({ id: apiId }),
      );
      assert.equal(thanks.status, 400);
      assert.equal(
        (await thanks.json()).error,
        "Thank-you drafts are not available yet.",
      );
    }
    const deleted = await itemRoute.DELETE(
      request(`/api/interviews/${apiId}`, "DELETE"),
      params({ id: apiId }),
    );
    assert.equal(deleted.status, 200);
    assert.equal(await db.interview.count({ where: { id: apiId } }), 0);
  } finally {
    if (previousRoot === undefined) delete process.env.JOBS_ROOT;
    else process.env.JOBS_ROOT = previousRoot;
    await rm(root, { recursive: true, force: true });
    const cards = await db.application.findMany({
      where: { job: { company: { startsWith: companyPrefix } } },
      select: { id: true },
    });
    const cardIds = cards.map((item) => item.id);
    await db.interview.deleteMany({
      where: { applicationId: { in: cardIds } },
    });
    await db.applicationEvent.deleteMany({
      where: { applicationId: { in: cardIds } },
    });
    await db.mailMessage.deleteMany({
      where: { gmailId: { startsWith: mailPrefix } },
    });
    await db.application.deleteMany({ where: { id: { in: cardIds } } });
    await db.job.deleteMany({
      where: {
        OR: [
          { id: { in: jobIds } },
          { company: { startsWith: companyPrefix } },
        ],
      },
    });
  }

  // Nothing synthetic remains and nothing real was touched.
  assert.equal(
    await db.job.count({ where: { company: { startsWith: companyPrefix } } }),
    0,
  );
  assert.equal(await db.application.count({ where: ours }), 0);
  assert.equal(
    await db.mailMessage.count({
      where: { gmailId: { startsWith: mailPrefix } },
    }),
    0,
  );
  assert.equal(
    await db.interview.count({ where: { application: notOurs } }),
    before.interviews,
  );
  assert.equal(
    await db.interviewQuestion.count({
      where: { interview: { application: notOurs } },
    }),
    before.questions,
  );
  assert.equal(
    await db.practiceSession.count({
      where: { interview: { application: notOurs } },
    }),
    before.practice,
  );
  assert.equal(
    await db.applicationEvent.count({
      where: { at: { gte: startedAt }, note: { startsWith: "Interview " } },
    }),
    0,
    "an interview event was written on a real application",
  );
  // Other processes (the mail check, a submission in the dashboard) may change real cards
  // meanwhile; none of them writes an interview step.
  const earlier = new Map(realCards.map((item) => [item.id, item]));
  const current = await db.application.findMany({
    where: { id: { in: [...earlier.keys()] } },
    select: { id: true, nextStep: true, nextStepDueAt: true },
  });
  for (const item of current) {
    const was = earlier.get(item.id)!;
    if (item.nextStep !== was.nextStep)
      assert.doesNotMatch(item.nextStep ?? "", STEP);
  }
});
