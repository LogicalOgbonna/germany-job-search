import { readdir, readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import {
  interviewStages,
  type InterviewStage,
  type Interviewer,
  type ParsedInterview,
  type PracticeSummary,
  type PrepEvidence,
  type PrepSheet,
} from "./types";

type Tx = Prisma.TransactionClient;
export type InterviewStatus = "scheduled" | "done" | "cancelled";
export type ChecklistItem = { label: string; done: boolean };

export type InterviewInput = {
  stage: InterviewStage;
  title?: string;
  startsAt?: Date | null;
  endsAt?: Date | null;
  timezone?: string;
  interviewerTimezone?: string | null;
  interviewers?: Interviewer[];
  meetingUrl?: string | null;
  eventUrl?: string | null;
  rescheduleUrl?: string | null;
};

export type InterviewPatch = Partial<InterviewInput> & {
  status?: InterviewStatus;
  notes?: string;
  debrief?: string;
  nextSteps?: string;
  checklist?: ChecklistItem[];
  thankYouDraft?: string | null;
};

// Request bodies for the interview API routes (route files may not export helpers).
const link = z
  .union([z.literal(""), z.null(), z.url({ protocol: /^https?$/ }).max(2000)])
  .transform((value) => value || null);
const instant = z
  .union([z.iso.datetime({ offset: true }), z.null()])
  .transform((value) => (value ? new Date(value) : null));
const interviewerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  role: z.string().max(200).optional(),
  email: z.string().max(320).optional(),
  linkedin: z.string().max(2000).optional(),
});
export const interviewInputSchema = z.object({
  stage: z.enum(interviewStages),
  title: z.string().max(200).optional(),
  startsAt: instant.optional(),
  endsAt: instant.optional(),
  timezone: z.string().max(100).optional(),
  interviewerTimezone: z.string().max(100).nullable().optional(),
  interviewers: z.array(interviewerSchema).max(30).optional(),
  meetingUrl: link.optional(),
  eventUrl: link.optional(),
  rescheduleUrl: link.optional(),
});
export const interviewPatchSchema = interviewInputSchema.partial().extend({
  status: z.enum(["scheduled", "done", "cancelled"]).optional(),
  notes: z.string().max(50_000).optional(),
  debrief: z.string().max(50_000).optional(),
  nextSteps: z.string().max(2_000).optional(),
  checklist: z
    .array(z.object({ label: z.string().max(500), done: z.boolean() }))
    .max(200)
    .optional(),
});

const defaultTimezone = "Europe/Berlin";
// The candidate's own time zone: the card's next step is always read in it.
export const homeTimezone = "Europe/Berlin";
const hourMs = 3_600_000;
const stageTitles: Record<InterviewStage, string> = {
  talent: "Talent screen",
  technical: "Technical interview",
  assessment: "Assessment",
  final: "Final interview",
  other: "Interview",
};
// The shape interviewStepText writes, so a step set by an interview can be told apart from
// one set by a mail or by hand.
const interviewStep =
  /^Interview [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]+, \d{2}:\d{2}$/;

// "Thu 22 Oct, 10:15" in the interview's time zone.
export function formatInterviewTime(startsAt: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(startsAt);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")}, ${part("hour")}:${part("minute")}`;
}

// The card's next step for an interview: "Interview Thu 22 Oct, 10:15", always in
// homeTimezone (the interview page shows the interview's own zones). The second argument
// is accepted for older callers and ignored.
export function interviewStepText(startsAt: Date, _timezone?: string): string {
  return `Interview ${formatInterviewTime(startsAt, homeTimezone)}`;
}

function checkTimezone(timezone: string): string {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone });
    return timezone;
  } catch {
    throw new Error(`"${timezone}" is not a known time zone.`);
  }
}

// Links are shown as anchors in the dashboard: only http and https are kept.
function safeUrl(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function checkDate(value: Date | null | undefined, label: string) {
  if (value && Number.isNaN(value.valueOf()))
    throw new Error(`The ${label} time is not a valid date.`);
}

function cleanInterviewers(list: Interviewer[]): Interviewer[] {
  return list
    .map((item) => {
      const person: Interviewer = { name: item.name.trim() };
      if (item.role?.trim()) person.role = item.role.trim();
      if (item.email?.trim()) person.email = item.email.trim();
      const linkedin = safeUrl(item.linkedin);
      if (linkedin) person.linkedin = linkedin;
      return person;
    })
    .filter((item) => item.name);
}

function stageOf(value: string): InterviewStage {
  return (interviewStages as readonly string[]).includes(value)
    ? (value as InterviewStage)
    : "other";
}

// A best reading of the round from a confirmation's title; "other" when it does not say.
function stageFromTitle(title: string | null): InterviewStage {
  const text = (title ?? "").toLowerCase();
  if (/technical|coding|pair|system design|architecture|code review/.test(text))
    return "technical";
  if (/assessment|challenge|take[- ]home|case study|test task/.test(text))
    return "assessment";
  if (/final|onsite|on-site|leadership|founder|ceo|cto/.test(text))
    return "final";
  if (/talent|recruit|screen|intro|hr\b|people|culture|first call/.test(text))
    return "talent";
  return "other";
}

async function inTransaction<T>(
  client: Tx | undefined,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return client ? fn(client) : db.$transaction(fn);
}

// An interview still to come: scheduled, with a start, and not yet over (its end, or an
// hour after its start, is in the future).
const isAhead = (
  row: { status: string; startsAt: Date | null; endsAt: Date | null },
  now: Date,
) =>
  row.status === "scheduled" &&
  row.startsAt != null &&
  (row.endsAt ?? new Date(row.startsAt.valueOf() + hourMs)) > now;

async function soonestAhead(tx: Tx, applicationId: string, now: Date) {
  const rows = await tx.interview.findMany({
    where: { applicationId, startsAt: { not: null } },
    orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    select: { startsAt: true, endsAt: true, status: true },
  });
  rows.sort((a, b) => a.startsAt!.valueOf() - b.startsAt!.valueOf());
  return {
    soonest: rows.find((row) => isAhead(row, now))?.startsAt ?? null,
    // Steps of this card's interviews that are over, cancelled or done.
    stale: rows
      .filter((row) => !isAhead(row, now))
      .map((row) => interviewStepText(row.startsAt!)),
  };
}

// Points the card's next step at its soonest interview still to come. `previous` are step
// texts this change may have made stale (the interview's old time); they, and the steps of
// interviews that are over, are cleared when no interview is to come. A step due later than
// the interview and not written by an interview (a later stage's step) is kept.
async function syncCardStep(
  tx: Tx,
  applicationId: string,
  previous: string[],
  now = new Date(),
) {
  const card = await tx.application.findUnique({
    where: { id: applicationId },
    select: { nextStep: true, nextStepDueAt: true },
  });
  if (!card) return;
  const { soonest, stale } = await soonestAhead(tx, applicationId, now);
  const outdated = new Set([...previous, ...stale]);
  const step = card.nextStep;
  if (!soonest) {
    if (step != null && outdated.has(step))
      await tx.application.update({
        where: { id: applicationId },
        data: { nextStep: null, nextStepDueAt: null },
      });
    return;
  }
  const text = interviewStepText(soonest);
  if (step === text && card.nextStepDueAt?.valueOf() === soonest.valueOf())
    return;
  const ours = step != null && (outdated.has(step) || interviewStep.test(step));
  const laterStep =
    !ours &&
    step != null &&
    card.nextStepDueAt != null &&
    card.nextStepDueAt > soonest;
  if (laterStep) return;
  await tx.application.update({
    where: { id: applicationId },
    data: { nextStep: text, nextStepDueAt: soonest },
  });
}

// Recorded in ApplicationEvent.previous on events written for a mail, so that reading the
// same mail again is recognised. Mail events (mailMessageId set) are never of this shape.
type MailMark = { interviewId: string; interviewMail: string };

async function mailMarks(
  tx: Tx,
  applicationId: string,
): Promise<Map<string, string>> {
  const events = await tx.applicationEvent.findMany({
    where: { applicationId, mailMessageId: null },
    select: { previous: true },
  });
  const marks = new Map<string, string>();
  for (const event of events) {
    const mark = event.previous as Partial<MailMark> | null;
    if (
      mark &&
      typeof mark === "object" &&
      typeof mark.interviewMail === "string" &&
      typeof mark.interviewId === "string"
    )
      marks.set(mark.interviewMail, mark.interviewId);
  }
  return marks;
}

async function writeEvent(
  tx: Tx,
  applicationId: string,
  note: string,
  mark?: MailMark,
) {
  const card = await tx.application.findUniqueOrThrow({
    where: { id: applicationId },
    select: { status: true },
  });
  // The card's status does not change; the event only records the interview.
  await tx.applicationEvent.create({
    data: { applicationId, status: card.status, note, previous: mark },
  });
}

const when = (startsAt: Date | null, timezone: string) =>
  startsAt ? formatInterviewTime(startsAt, timezone) : "(time not set)";
const stepFor = (startsAt: Date | null) =>
  startsAt ? [interviewStepText(startsAt)] : [];

async function create(
  tx: Tx,
  applicationId: string,
  input: InterviewInput,
  sourceMailId?: string,
  status: InterviewStatus = "scheduled",
): Promise<{ id: string }> {
  const card = await tx.application.findUnique({
    where: { id: applicationId },
    select: { id: true },
  });
  if (!card) throw new Error("That application no longer exists.");
  const timezone = checkTimezone(input.timezone?.trim() || defaultTimezone);
  const interviewerTimezone = input.interviewerTimezone?.trim()
    ? checkTimezone(input.interviewerTimezone.trim())
    : null;
  checkDate(input.startsAt, "start");
  checkDate(input.endsAt, "end");
  if (input.startsAt && input.endsAt && input.endsAt < input.startsAt)
    throw new Error("The interview cannot end before it starts.");
  const stage = stageOf(input.stage);
  const row = await tx.interview.create({
    data: {
      applicationId,
      stage,
      title: input.title?.trim() || stageTitles[stage],
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      timezone,
      interviewerTimezone,
      interviewers: cleanInterviewers(input.interviewers ?? []),
      meetingUrl: safeUrl(input.meetingUrl),
      eventUrl: safeUrl(input.eventUrl),
      rescheduleUrl: safeUrl(input.rescheduleUrl),
      status,
      sourceMailId: sourceMailId ?? null,
    },
    select: { id: true, startsAt: true },
  });
  const mark = sourceMailId
    ? { interviewId: row.id, interviewMail: sourceMailId }
    : undefined;
  if (status === "scheduled") {
    await writeEvent(
      tx,
      applicationId,
      `Interview scheduled ${when(row.startsAt, timezone)}`,
      mark,
    );
    await syncCardStep(tx, applicationId, []);
  } else if (mark)
    await writeEvent(
      tx,
      applicationId,
      `Interview cancelled ${when(row.startsAt, timezone)}`,
      mark,
    );
  return { id: row.id };
}

// `mailId`: the change comes from that mail, which is recorded on the event it writes.
async function update(
  tx: Tx,
  id: string,
  patch: InterviewPatch,
  mailId?: string,
) {
  const current = await tx.interview.findUnique({ where: { id } });
  if (!current) throw new Error("That interview no longer exists.");
  const timezone =
    patch.timezone !== undefined
      ? checkTimezone(patch.timezone.trim() || defaultTimezone)
      : current.timezone;
  checkDate(patch.startsAt, "start");
  checkDate(patch.endsAt, "end");
  const startsAt =
    patch.startsAt !== undefined ? patch.startsAt : current.startsAt;
  const endsAt = patch.endsAt !== undefined ? patch.endsAt : current.endsAt;
  if (startsAt && endsAt && endsAt < startsAt)
    throw new Error("The interview cannot end before it starts.");
  const status = patch.status ?? (current.status as InterviewStatus);
  const data: Prisma.InterviewUpdateInput = {};
  if (patch.stage !== undefined) data.stage = stageOf(patch.stage);
  if (patch.title !== undefined)
    data.title =
      patch.title.trim() || stageTitles[stageOf(patch.stage ?? current.stage)];
  if (patch.startsAt !== undefined) data.startsAt = patch.startsAt;
  if (patch.endsAt !== undefined) data.endsAt = patch.endsAt;
  if (patch.timezone !== undefined) data.timezone = timezone;
  if (patch.interviewerTimezone !== undefined)
    data.interviewerTimezone = patch.interviewerTimezone?.trim()
      ? checkTimezone(patch.interviewerTimezone.trim())
      : null;
  if (patch.interviewers !== undefined)
    data.interviewers = cleanInterviewers(patch.interviewers);
  if (patch.meetingUrl !== undefined)
    data.meetingUrl = safeUrl(patch.meetingUrl);
  if (patch.eventUrl !== undefined) data.eventUrl = safeUrl(patch.eventUrl);
  if (patch.rescheduleUrl !== undefined)
    data.rescheduleUrl = safeUrl(patch.rescheduleUrl);
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.notes !== undefined) data.notes = patch.notes;
  if (patch.debrief !== undefined) data.debrief = patch.debrief;
  if (patch.nextSteps !== undefined) data.nextSteps = patch.nextSteps;
  if (patch.checklist !== undefined)
    data.checklist = patch.checklist
      .map((item) => ({ label: item.label.trim(), done: Boolean(item.done) }))
      .filter((item) => item.label);
  if (patch.thankYouDraft !== undefined)
    data.thankYouDraft = patch.thankYouDraft;
  await tx.interview.update({ where: { id }, data });

  const moved =
    (startsAt?.valueOf() ?? null) !== (current.startsAt?.valueOf() ?? null) ||
    timezone !== current.timezone;
  const statusChanged = status !== current.status;
  const mark = mailId ? { interviewId: id, interviewMail: mailId } : undefined;
  const note =
    statusChanged && status === "cancelled"
      ? `Interview cancelled ${when(current.startsAt, current.timezone)}`
      : statusChanged && status === "scheduled"
        ? `Interview scheduled ${when(startsAt, timezone)}`
        : moved && status === "scheduled" && startsAt
          ? `Interview moved to ${when(startsAt, timezone)}`
          : mark
            ? `Interview details confirmed by email ${when(startsAt, timezone)}`
            : null;
  if (note) await writeEvent(tx, current.applicationId, note, mark);
  if (moved || statusChanged)
    await syncCardStep(tx, current.applicationId, stepFor(current.startsAt));
  const nextSteps = patch.nextSteps?.trim();
  // A scheduled interview still ahead is the more urgent next step; the debrief text waits for it.
  const ahead =
    nextSteps &&
    (await soonestAhead(tx, current.applicationId, new Date())).soonest;
  if (nextSteps && !ahead && nextSteps !== current.nextSteps.trim())
    await tx.application.update({
      where: { id: current.applicationId },
      data: { nextStep: nextSteps.slice(0, 500), nextStepDueAt: null },
    });
}

export function createInterview(
  applicationId: string,
  input: InterviewInput,
): Promise<{ id: string }> {
  return inTransaction(undefined, (tx) => create(tx, applicationId, input));
}

export function updateInterview(
  id: string,
  patch: InterviewPatch,
): Promise<void> {
  return inTransaction(undefined, (tx) => update(tx, id, patch));
}

export async function deleteInterview(id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const current = await tx.interview.findUnique({ where: { id } });
    if (!current) throw new Error("That interview no longer exists.");
    // Questions and practice sessions go with it (cascade).
    await tx.interview.delete({ where: { id } });
    await syncCardStep(tx, current.applicationId, stepFor(current.startsAt));
  });
}

export type UpcomingInterview = {
  id: string;
  applicationId: string;
  jobId: string;
  company: string;
  role: string;
  stage: InterviewStage;
  title: string;
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string;
  meetingUrl: string | null;
  status: string;
  prepStatus: string;
};

// Scheduled interviews that start in the future or started within the last 2 hours, and
// those without a time; soonest first, undated last.
export async function upcomingInterviews(
  now: Date = new Date(),
): Promise<UpcomingInterview[]> {
  const rows = await db.interview.findMany({
    where: {
      status: "scheduled",
      OR: [
        { startsAt: { gte: new Date(now.valueOf() - 2 * 3_600_000) } },
        { startsAt: null },
      ],
    },
    orderBy: [
      { startsAt: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
    include: {
      application: {
        select: {
          jobId: true,
          job: { select: { company: true, title: true } },
        },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    applicationId: row.applicationId,
    jobId: row.application.jobId,
    company: row.application.job.company,
    role: row.application.job.title,
    stage: stageOf(row.stage),
    title: row.title,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timezone: row.timezone,
    meetingUrl: row.meetingUrl,
    status: row.status,
    prepStatus: row.prepStatus,
  }));
}

export async function interviewsForApplication(applicationId: string): Promise<
  Array<{
    id: string;
    stage: InterviewStage;
    title: string;
    startsAt: Date | null;
    endsAt: Date | null;
    timezone: string;
    status: string;
    prepStatus: string;
  }>
> {
  const rows = await db.interview.findMany({
    where: { applicationId },
    orderBy: [
      { startsAt: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
    select: {
      id: true,
      stage: true,
      title: true,
      startsAt: true,
      endsAt: true,
      timezone: true,
      status: true,
      prepStatus: true,
    },
  });
  return rows.map((row) => ({ ...row, stage: stageOf(row.stage) }));
}

export type InterviewDetail = {
  interview: {
    id: string;
    applicationId: string;
    stage: InterviewStage;
    title: string;
    startsAt: Date | null;
    endsAt: Date | null;
    timezone: string;
    interviewerTimezone: string | null;
    interviewers: Interviewer[];
    meetingUrl: string | null;
    eventUrl: string | null;
    rescheduleUrl: string | null;
    status: string;
    sourceMailId: string | null;
    prep: PrepSheet | null;
    prepStatus: string;
    prepError: string | null;
    prepGeneratedAt: Date | null;
    checklist: ChecklistItem[];
    notes: string;
    debrief: string;
    nextSteps: string;
    thankYouDraft: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  application: {
    id: string;
    jobId: string;
    status: string;
    notes: string;
    company: string;
    role: string;
    location: string;
    description: string;
  };
  questions: Array<{
    id: string;
    position: number;
    question: string;
    outline: string;
    evidence: unknown;
    userNotes: string;
    ready: boolean;
    stale: boolean;
  }>;
  practice: Array<{
    id: string;
    stage: string;
    startedAt: Date;
    endedAt: Date | null;
    turns: number;
    summary: PracticeSummary | null;
  }>;
  // The job folder's intro_prep.md, found whether or not a sheet has been generated.
  prepFile: { path: string; markdown: string } | null;
  mails: Array<{
    id: string;
    subject: string;
    fromName: string;
    fromAddress: string;
    receivedAt: Date;
    category: string;
    threadId: string;
  }>;
};

export async function interviewDetail(id: string): Promise<InterviewDetail> {
  const row = await db.interview.findUnique({
    where: { id },
    include: {
      application: { include: { job: true } },
      questions: { orderBy: [{ stale: "asc" }, { position: "asc" }] },
      practice: { orderBy: { startedAt: "desc" } },
    },
  });
  if (!row) throw new Error("That interview no longer exists.");
  const { application, questions, practice, ...interview } = row;
  const [prepFile, mails] = await Promise.all([
    findPrepFile(application.job.company, application.job.title),
    db.mailMessage.findMany({
      where: { applicationId: application.id },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        subject: true,
        fromName: true,
        fromAddress: true,
        receivedAt: true,
        category: true,
        threadId: true,
      },
    }),
  ]);
  return {
    interview: {
      ...interview,
      stage: stageOf(interview.stage),
      interviewers: (Array.isArray(interview.interviewers)
        ? interview.interviewers
        : []) as unknown as Interviewer[],
      checklist: (Array.isArray(interview.checklist)
        ? interview.checklist
        : []) as unknown as ChecklistItem[],
      prep: (interview.prep ?? null) as unknown as PrepSheet | null,
    },
    application: {
      id: application.id,
      jobId: application.jobId,
      status: application.status,
      notes: application.notes,
      company: application.job.company,
      role: application.job.title,
      location: application.job.location,
      description: application.job.description,
    },
    questions: questions.map((item) => ({
      id: item.id,
      position: item.position,
      question: item.question,
      outline: item.outline,
      evidence: item.evidence,
      userNotes: item.userNotes,
      ready: item.ready,
      stale: item.stale,
    })),
    practice: practice.map((item) => ({
      id: item.id,
      stage: item.stage,
      startedAt: item.startedAt,
      endedAt: item.endedAt,
      turns: Array.isArray(item.turns) ? item.turns.length : 0,
      summary: (item.summary ?? null) as unknown as PracticeSummary | null,
    })),
    prepFile,
    mails,
  };
}

const fiveMinutes = 5 * 60_000;
const near = (a: Date, b: Date) =>
  Math.abs(a.valueOf() - b.valueOf()) <= fiveMinutes;
// Query parameters that change between copies of the same event link.
const linkNoise =
  /^(tok|ctz|hl|es|lang|locale|tz|timezone|ref|source|utm_.*|sf|authuser)$/i;

// One key per event: a Google Calendar link by its `eid`, any other link without its
// host's "www.", trailing slashes, fragment and the parameters in linkNoise.
export function eventKey(link: string): string {
  try {
    const url = new URL(link);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const eid = url.searchParams.get("eid");
    if (eid && (host === "calendar.google.com" || host === "google.com"))
      return `google:${eid}`;
    const kept = [...url.searchParams.entries()]
      .filter(([name]) => !linkNoise.test(name))
      .sort(([a], [b]) => a.localeCompare(b));
    const query = new URLSearchParams(kept).toString();
    return `${host}${url.pathname.replace(/\/+$/, "")}${query ? `?${query}` : ""}`;
  } catch {
    return link.trim();
  }
}

// Called by the mail pipeline. Pass `client` to run inside the caller's transaction.
// Which interview the mail is about, in this order:
// (a) one this mail already created or updated: returned unchanged, so reading a mail again
//     never undoes the person's edits (null when they deleted that interview);
// (b) the same event (eventKey);
// (c) a reschedule whose previous start is within 5 minutes of a scheduled interview's;
// (d) a start within 5 minutes of an interview's;
// (e) a mail without a time (a link or a cancellation) in a thread with exactly one round
//     still open;
// otherwise a new interview (none for a mail with neither time nor link). Two different
// event links are never the same interview. A mail older than the one the interview was
// last updated from changes nothing. The card's step is synced in every case but (a).
export async function upsertInterviewFromMail(
  input: {
    applicationId: string;
    mailId: string;
    parsed: ParsedInterview;
    receivedAt: Date;
  },
  client?: Tx,
): Promise<{ interviewId: string; created: boolean } | null> {
  const { applicationId, mailId, parsed, receivedAt } = input;
  const eventUrl = safeUrl(parsed.eventUrl);
  if (!parsed.startsAt && !eventUrl && !parsed.cancelled) return null;
  return inTransaction(client, async (tx) => {
    const existing = await tx.interview.findMany({
      where: { applicationId },
      orderBy: { createdAt: "desc" },
    });
    const marks = await mailMarks(tx, applicationId);
    const done =
      existing.find((item) => item.sourceMailId === mailId) ??
      existing.find((item) => marks.get(mailId) === item.id);
    if (done) return { interviewId: done.id, created: false };
    if (marks.has(mailId)) return null;

    const key = eventUrl ? eventKey(eventUrl) : null;
    const otherEvent = (item: (typeof existing)[number]) =>
      Boolean(key && item.eventUrl && eventKey(item.eventUrl) !== key);
    const inThread = async () => {
      const mail = await tx.mailMessage.findUnique({
        where: { id: mailId },
        select: { threadId: true },
      });
      if (!mail) return undefined;
      const thread = new Set(
        (
          await tx.mailMessage.findMany({
            where: { threadId: mail.threadId },
            select: { id: true },
          })
        ).map((item) => item.id),
      );
      const open = existing.filter(
        (item) =>
          item.status !== "done" &&
          !otherEvent(item) &&
          ((item.sourceMailId != null && thread.has(item.sourceMailId)) ||
            [...marks].some(
              ([mail, interview]) => interview === item.id && thread.has(mail),
            )),
      );
      return open.length === 1 ? open[0] : undefined;
    };
    const previousStart = parsed.previousStartsAt ?? null;
    const same =
      (key
        ? existing.find(
            (item) => item.eventUrl && eventKey(item.eventUrl) === key,
          )
        : undefined) ??
      (previousStart
        ? existing.find(
            (item) =>
              item.status === "scheduled" &&
              !otherEvent(item) &&
              item.startsAt != null &&
              near(item.startsAt, previousStart),
          )
        : undefined) ??
      (parsed.startsAt
        ? existing.find(
            (item) =>
              !otherEvent(item) &&
              item.startsAt != null &&
              near(item.startsAt, parsed.startsAt!),
          )
        : await inThread());
    const timezone =
      parsed.timezone && validTimezone(parsed.timezone)
        ? parsed.timezone
        : undefined;
    if (!same) {
      if (!parsed.startsAt && !eventUrl) return null;
      const created = await create(
        tx,
        applicationId,
        {
          stage: stageFromTitle(parsed.title),
          title: parsed.title ?? undefined,
          startsAt: parsed.startsAt,
          endsAt:
            parsed.endsAt && parsed.startsAt && parsed.endsAt >= parsed.startsAt
              ? parsed.endsAt
              : null,
          timezone,
          interviewers: parsed.interviewers,
          meetingUrl: parsed.meetingUrl,
          eventUrl,
          rescheduleUrl: parsed.rescheduleUrl,
        },
        mailId,
        parsed.cancelled ? "cancelled" : "scheduled",
      );
      await syncCardStep(tx, applicationId, []);
      return { interviewId: created.id, created: true };
    }
    const last = same.sourceMailId
      ? await tx.mailMessage.findUnique({
          where: { id: same.sourceMailId },
          select: { receivedAt: true },
        })
      : null;
    if (last && last.receivedAt > receivedAt) {
      await syncCardStep(tx, applicationId, []);
      return { interviewId: same.id, created: false };
    }
    const patch: InterviewPatch = {};
    if (parsed.startsAt) {
      patch.startsAt = parsed.startsAt;
      // A new start without an end drops an end that would now come before it.
      patch.endsAt =
        parsed.endsAt && parsed.endsAt >= parsed.startsAt
          ? parsed.endsAt
          : same.endsAt && same.endsAt >= parsed.startsAt
            ? same.endsAt
            : null;
    } else if (
      parsed.endsAt &&
      (!same.startsAt || parsed.endsAt >= same.startsAt)
    )
      patch.endsAt = parsed.endsAt;
    if (timezone) patch.timezone = timezone;
    if (parsed.title) patch.title = parsed.title;
    if (parsed.interviewers.length) patch.interviewers = parsed.interviewers;
    if (safeUrl(parsed.meetingUrl)) patch.meetingUrl = parsed.meetingUrl;
    if (eventUrl) patch.eventUrl = eventUrl;
    if (safeUrl(parsed.rescheduleUrl))
      patch.rescheduleUrl = parsed.rescheduleUrl;
    if (parsed.cancelled) patch.status = "cancelled";
    else if (same.status === "cancelled") patch.status = "scheduled";
    await update(tx, same.id, patch, mailId);
    await tx.interview.update({
      where: { id: same.id },
      data: { sourceMailId: mailId },
    });
    // Also when nothing changed: a step the mail pipeline just wrote gives way to the interview.
    await syncCardStep(tx, applicationId, []);
    return { interviewId: same.id, created: false };
  });
}

function validTimezone(timezone: string): boolean {
  try {
    checkTimezone(timezone);
    return true;
  } catch {
    return false;
  }
}

// Lower case, letters and digits only, so "Tell me about yourself." matches
// "tell me about yourself".
function questionKey(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Replaces the questions with a new sheet's, in its order. A question whose text matches an
// existing one (normalised) keeps that row, with its notes and ready flag; existing
// questions not in the new sheet stay, marked stale, after the current ones.
export async function syncQuestions(
  interviewId: string,
  sheet: PrepSheet,
): Promise<void> {
  await db.$transaction(async (tx) => {
    const found = await tx.interview.findUnique({
      where: { id: interviewId },
      select: { id: true },
    });
    if (!found) throw new Error("That interview no longer exists.");
    const existing = await tx.interviewQuestion.findMany({
      where: { interviewId },
      orderBy: [{ stale: "asc" }, { position: "asc" }],
    });
    const used = new Set<string>();
    const fresh = sheet.questions.filter((item) => item.question?.trim());
    for (const [position, item] of fresh.entries()) {
      const key = questionKey(item.question);
      const match = existing.find(
        (row) => !used.has(row.id) && questionKey(row.question) === key,
      );
      const data = {
        position,
        question: item.question.trim(),
        outline: (item.outline ?? []).join("\n"),
        evidence: (item.evidence ?? []) as PrepEvidence[],
        stale: false,
      };
      if (match) {
        used.add(match.id);
        await tx.interviewQuestion.update({ where: { id: match.id }, data });
      } else
        await tx.interviewQuestion.create({ data: { interviewId, ...data } });
    }
    let position = fresh.length;
    for (const row of existing)
      if (!used.has(row.id))
        await tx.interviewQuestion.update({
          where: { id: row.id },
          data: { stale: true, position: position++ },
        });
  });
}

// `interviewId`, when given, must be the question's interview.
export async function updateQuestion(
  id: string,
  patch: { userNotes?: string; ready?: boolean },
  interviewId?: string,
): Promise<void> {
  const done = await db.interviewQuestion.updateMany({
    where: { id, ...(interviewId ? { interviewId } : {}) },
    data: {
      ...(patch.userNotes !== undefined ? { userNotes: patch.userNotes } : {}),
      ...(patch.ready !== undefined ? { ready: patch.ready } : {}),
    },
  });
  if (!done.count) throw new Error("That question no longer exists.");
}

// Words of a folder or name: lower case, accents removed, "&" read as "and", gender markers
// such as "(m/f/d)" or "(all genders)" dropped.
function words(name: string): string[] {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/\(\s*(?:[mwfdxi]\s*[/|,]\s*){1,3}[mwfdxi]\s*\)/g, " ")
    .replace(/\(\s*(?:all|any)\s+genders?\s*\)/g, " ")
    .replace(/\(\s*gn\s*\)/g, " ")
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const legalSuffixes = new Set([
  "gmbh",
  "mbh",
  "ag",
  "se",
  "kg",
  "kgaa",
  "co",
  "and",
  "ug",
  "gbr",
  "ohg",
  "ev",
  "inc",
  "ltd",
  "llc",
  "plc",
  "bv",
  "nv",
  "sa",
  "sas",
  "sarl",
  "srl",
  "spa",
  "oy",
  "ab",
  "as",
  "aps",
  "limited",
  "corp",
  "corporation",
  "technologies",
  "technology",
  "holding",
  "holdings",
]);

function companyKey(name: string): string {
  const list = words(name);
  while (list.length > 1 && legalSuffixes.has(list[list.length - 1]))
    list.pop();
  return list.join("_");
}

const roleKey = (name: string) => words(name).join("_");
const roleKeyBare = (name: string) => roleKey(name.replace(/\([^)]*\)/g, " "));

// The folder of generated job files: <cwd>/jobs, or JOBS_ROOT.
export function jobsRoot(): string {
  return resolve(process.env.JOBS_ROOT || join(process.cwd(), "jobs"));
}

async function folders(path: string): Promise<string[]> {
  try {
    return (await readdir(path, { withFileTypes: true }))
      .filter((item) => item.isDirectory())
      .map((item) => item.name);
  } catch {
    return [];
  }
}

// jobs/<DD-MM-YYYY>/<company>/<title>/intro_prep.md for this company and role, matched on
// normalised folder names (legal suffixes such as GmbH dropped from the company); the newest
// date wins. The path is relative to the working directory when inside it.
export async function findPrepFile(
  company: string,
  role: string,
): Promise<{ path: string; markdown: string } | null> {
  const root = jobsRoot();
  const wantCompany = companyKey(company);
  const wantRole = roleKey(role);
  const wantBare = roleKeyBare(role);
  if (!wantCompany || !wantRole) return null;
  const dates = (await folders(root))
    .map((name) => ({ name, match: /^(\d{2})-(\d{2})-(\d{4})$/.exec(name) }))
    .filter((item) => item.match)
    .map((item) => ({
      name: item.name,
      sort: `${item.match![3]}${item.match![2]}${item.match![1]}`,
    }))
    .sort((a, b) => b.sort.localeCompare(a.sort));
  for (const date of dates) {
    const companies = (await folders(join(root, date.name))).filter(
      (name) => companyKey(name) === wantCompany,
    );
    for (const companyFolder of companies) {
      const roles = await folders(join(root, date.name, companyFolder));
      const roleFolder =
        roles.find((name) => roleKey(name) === wantRole) ??
        roles.find((name) => roleKeyBare(name) === wantBare);
      if (!roleFolder) continue;
      const file = join(
        root,
        date.name,
        companyFolder,
        roleFolder,
        "intro_prep.md",
      );
      try {
        const markdown = await readFile(file, "utf8");
        const inside = relative(process.cwd(), file);
        return {
          path:
            inside && !inside.startsWith("..") && !isAbsolute(inside)
              ? inside
              : file,
          markdown,
        };
      } catch {
        continue;
      }
    }
  }
  return null;
}

const prepRunning =
  "A prep sheet is being generated. Try again when it finishes.";

// Queues prep generation for the worker. Already queued: nothing to do. Running: refused,
// since the worker would drop a second job for the same interview.
export async function requestPrep(id: string): Promise<void> {
  const check = async () => {
    const row = await db.interview.findUnique({
      where: { id },
      select: { prepStatus: true },
    });
    if (!row) throw new Error("That interview no longer exists.");
    if (row.prepStatus === "running") throw new Error(prepRunning);
    return row.prepStatus;
  };
  if ((await check()) === "queued") return;
  const done = await db.interview.updateMany({
    where: { id, prepStatus: { notIn: ["queued", "running"] } },
    data: { prepStatus: "queued", prepError: null },
  });
  // Claimed or queued meanwhile: report what it is now.
  if (!done.count) await check();
}
