import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Prisma, type Application, type MailMessage } from "@prisma/client";
import { db } from "../db";
import { hash, matchJob } from "../domain";
import {
  interviewStepText,
  upsertInterviewFromMail,
} from "../interviews/store";
import type { ParsedInterview } from "../interviews/types";
import { aiClassifier } from "./ai";
import { classify, confirm } from "./classify";
import { decide, needsSecondReader } from "./decide";
import {
  gmailClient,
  MailAuthError,
  MailNotFoundError,
  MailProviderError,
  readToken,
  sinceQuery,
} from "./gmail";
import { companyEvidence, matchMail, normalizeCompany } from "./match";
import { parseInterviewMail } from "./interview-parse";
import { extractDetails } from "./rules";
import { isHiringSystem } from "./senders";
import type {
  AiClassifier,
  BoardApplication,
  CardState,
  Classification,
  Confidence,
  Decision,
  MailCategory,
  MailClient,
  MailState,
  MatchResult,
  RawMail,
} from "./types";

// Looked up on every call: the integration test runs against the local database, and with
// its own id it never holds the real lease and never turns the real live switch.
const syncId = () => process.env.MAIL_SYNC_ID ?? "gmail";
const liveKey = () =>
  syncId() === "gmail" ? "mailLive" : `mailLive:${syncId()}`;
// Claude as a second reader of mail the rules have already decided. Off means Claude only
// reads what the rules cannot decide, and nothing changes a card without a person.
const secondOpinion = () =>
  !/^(off|0|false)$/i.test((process.env.MAIL_SECOND_OPINION ?? "").trim());
const leaseMs = 15 * 60_000;
const intervalMs = 10 * 60_000;
const overlapMs = 60 * 60_000;
const reconnect = "Reconnect Gmail: run npm run mail:connect";
const aiSilent = "The Claude API did not answer. Check ANTHROPIC_API_KEY.";
const busy = "A mail check is running. Try again in a few minutes.";
const occupied =
  "This card has other emails or notes. Reject or correct the card by hand instead.";
const closed = ["rejected", "withdrawn", "skipped"];
const giveUpAfter = 5;
const givenUpLimit = 200;
// A check stops when this many messages in a row cannot be read: Gmail is down, not the mail.
const abortAfter = 5;
// Bare "offer", "Stelle", "candidates" and "Gespräch" also fill newsletters and shop mail,
// so only the forms that belong to hiring count.
const keywords =
  /\b(?:applications?|applicants?|applying|applied|candidacy|your candidature|candidate|other candidates|interviews?|assessments?|coding challenge|take[- ]home|job offer|offer letter)\b|bewerbung|beworben|stellenangebot|vorstellungsgespr[aä]ch|kennenlerngespr[aä]ch|absage|zusage/i;
// The categories that move a card along (classify.ts puts these to both readers).
const stages = [
  "rejection",
  "assessment",
  "interview",
  "offer",
  "recruiter_question",
];
const threadLink = (threadId: string) =>
  `https://mail.google.com/mail/u/0/#all/${threadId}`;

type Tx = Prisma.TransactionClient;
type Card = BoardApplication & CardState & { lastMailAt: Date | null };
type Context = { now: Date; owner: Set<string>; cards: Card[] };
type Outcome = {
  id: string;
  state: MailState;
  decision: Decision;
  applicationId: string | null;
};
// An interview as stored in a mail row's `proposal` column: the dates are ISO strings.
type StoredInterview = Omit<ParsedInterview, "startsAt" | "endsAt"> & {
  startsAt: string | null;
  endsAt: string | null;
};
type Applied = {
  applied: number;
  attached: number;
  created: number;
  review: number;
  ignored: number;
};
type Counters = Applied & {
  listed: number;
  candidates: number;
  failed: number; // messages that could not be read or stored in this check
  aiCalls: number; // emails sent to Claude in this check
  interviews: number; // interviews added or updated from mail in this check
  aiFailures: number; // mail left undecided although a Claude classifier was configured
};
// Why a check did nothing or stopped early.
type SyncReason = "busy" | "not-live" | "pending-proposals" | "lease-lost";
type Previous = {
  status: string;
  submittedAt: string | null;
  nextStep: string | null;
  nextStepDueAt: string | null;
  evidence?: string | null;
};
// What a dry run stores: the decision, the match it rests on and the card it would act on,
// with the status and next step that card has when this mail's turn comes (after the
// proposals before it). A card that an earlier proposal would create has the id
// "new:<id of that mail>". Read back from the proposal column, the dates are ISO strings.
// `interview` is the interview read from the mail when it was fetched (with its calendar
// part, which is not stored), null when there was none; `interviewCard` the card it would
// be added to, null when it would be offered in review instead.
// A mail in review keeps `{ interview }` in the same column: the interview it offers.
export type MailProposal = {
  decision: Decision;
  match: MatchResult;
  card: {
    id: string;
    company: string;
    title: string;
    status?: string | null;
    nextStep?: string | null;
  } | null;
  interview?: StoredInterview | null;
  interviewCard?: string | null;
};
type Row = Omit<MailMessage, "bodyText"> & { bodyText?: string };
// What MailSync.lastCounts carries from check to check, next to the last check's counters.
type Ledger = {
  attempts: Record<string, number>; // failed tries per Gmail id that is still retried
  givenUp: string[]; // Gmail ids that failed in five checks in a row
  // The last dry run that ran to its end and has not been discarded or applied since.
  dryRun: { startedAt: string; completedAt: string } | null;
};

const undecided: Classification = {
  category: "unrelated",
  confidence: "low",
  decidedBy: "none",
  evidenceQuote: null,
  company: null,
  role: null,
  nextStep: null,
  deadline: null,
};
const sameName = (a: string, b: string) =>
  a !== "" &&
  b !== "" &&
  (a === b ||
    (Math.min(a.length, b.length) >= 5 &&
      (a.startsWith(b) || b.startsWith(a))));

// Prefilter: keep a fetched mail only when it can be about an application.
export function isCandidate(
  mail: RawMail,
  board: { companies: string[]; threadIds: Set<string> }, // companies already normalised
): boolean {
  if (board.threadIds.has(mail.threadId)) return true;
  if (mail.fromMe) return false;
  if (isHiringSystem(mail.fromAddress) || keywords.test(mail.subject))
    return true;
  // A newsletter or product update from an employer on the board is not about the application.
  if (mail.bulk === true) return false;
  return companyEvidence(mail, undecided).some((name) => {
    const key = normalizeCompany(name);
    return board.companies.some((company) => sameName(company, key));
  });
}

const nameParts = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
// The mailbox owner's names. Subjects such as "Ogbonna - We have received your application!"
// make the rules read the candidate's name as the employer.
async function ownerNames(): Promise<Set<string>> {
  const names = new Set<string>();
  const mailbox = (address: unknown) =>
    nameParts(typeof address === "string" ? address.split("@")[0] : "").join(
      "",
    );
  try {
    const contact = JSON.parse(
      await readFile(join(process.cwd(), "cv", "contact.json"), "utf8"),
    );
    for (const part of nameParts(String(contact?.name ?? ""))) names.add(part);
    names.add(mailbox(contact?.email));
  } catch {
    // Without the contact file only the connected address is known.
  }
  const sync = await db.mailSync.findUnique({ where: { id: syncId() } });
  names.add(mailbox((await readToken())?.email ?? sync?.email));
  names.delete("");
  return names;
}
function isOwner(name: string, owner: Set<string>) {
  const parts = nameParts(name);
  return (
    parts.length > 0 &&
    (parts.every((part) => owner.has(part)) || owner.has(parts.join("")))
  );
}

async function loadBoard(): Promise<Card[]> {
  const rows = await db.application.findMany({
    select: {
      id: true,
      status: true,
      origin: true,
      submittedAt: true,
      createdAt: true,
      lastMailAt: true,
      nextStep: true,
      nextStepDueAt: true,
      job: { select: { company: true, title: true } },
      mail: { select: { threadId: true } },
    },
  });
  return rows.map(({ job, mail, ...card }) => ({
    ...card,
    company: job.company,
    title: job.title,
    threadIds: [...new Set(mail.map((item) => item.threadId))],
  }));
}
const context = async (now: Date): Promise<Context> => ({
  now,
  owner: await ownerNames(),
  cards: await loadBoard(),
});

// `bulk` has no column, so a stored mail no longer says whether it was a mass mailing.
// The body is passed as stored, so Claude reads the same text on every reading.
const toMail = (row: Row): RawMail => ({
  gmailId: row.gmailId,
  threadId: row.threadId,
  fromAddress: row.fromAddress,
  fromName: row.fromName,
  subject: row.subject,
  receivedAt: row.receivedAt,
  bodyText: row.bodyText ?? "",
  fromMe: row.fromMe,
});
// `agreed` has no column either; `decidedBy` records how the two readers stood:
// "<rule>+ai" agreed, "<rule> vs ai:<category>" split, "ai" Claude alone, "user" a person.
// A stage verdict under a bare rule id was put to Claude and got no answer; a receipt or
// notice under a bare rule id has not been put to Claude at all.
function agreedIn(decidedBy: string, category: string): boolean | undefined {
  if (decidedBy === "user" || decidedBy.endsWith("+ai")) return true;
  if (decidedBy === "ai" || decidedBy.includes(" vs ai:")) return false;
  return stages.includes(category) ? false : undefined;
}
function toClassification(row: Row): Classification {
  const agreed = agreedIn(row.decidedBy, row.category);
  return {
    category: row.category as MailCategory,
    confidence: row.confidence as Confidence,
    decidedBy: row.decidedBy,
    evidenceQuote: row.evidenceQuote,
    company: row.company,
    role: row.role,
    nextStep: row.nextStep,
    deadline: row.deadline,
    ...(agreed === undefined ? {} : { agreed }),
  };
}
const mailFields = (mail: RawMail) => ({
  gmailId: mail.gmailId,
  threadId: mail.threadId,
  fromAddress: mail.fromAddress,
  fromName: mail.fromName,
  subject: mail.subject,
  receivedAt: mail.receivedAt,
  bodyText: mail.bodyText,
  fromMe: mail.fromMe,
});
const verdictFields = (classification: Classification) => ({
  category: classification.category,
  confidence: classification.confidence,
  decidedBy: classification.decidedBy,
  evidenceQuote: classification.evidenceQuote,
  company: classification.company,
  role: classification.role,
  nextStep: classification.nextStep,
  deadline: classification.deadline,
});
const sentence = (text: string) => text.trim().replace(/[.\s]+$/, "");
// "<Decision reason>. Match: <match reason>." The match is left out where the decision
// already quotes it or does not rest on it.
function reasonText(decision: Decision, match: MatchResult) {
  const reason = sentence(decision.reason);
  return decision.action === "ignore" || reason.includes(match.reason)
    ? `${reason}.`
    : `${reason}. Match: ${sentence(match.reason)}.`;
}
const plural = (count: number) => `${count} email${count === 1 ? "" : "s"}`;
// Deleted between the listing and the fetch: there is nothing left to read.
const gone = (error: unknown) =>
  error instanceof MailNotFoundError ||
  (error instanceof Error && /\bHTTP 404\b/.test(error.message));
const later = (a: Date | null, b: Date) => (a && a > b ? a : b);
const iso = (date: Date | null) => date?.toISOString() ?? null;
const day = (value: unknown) =>
  typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? new Date(value)
    : null;
const roleTitle = (classification: Classification) =>
  classification.role?.trim() || "Role not stated";
const zero = (): Counters => ({
  listed: 0,
  candidates: 0,
  applied: 0,
  attached: 0,
  created: 0,
  review: 0,
  ignored: 0,
  failed: 0,
  aiCalls: 0,
  interviews: 0,
  aiFailures: 0,
});
function count(counters: Applied, decision: Decision) {
  if (decision.action === "update") counters.applied++;
  else if (decision.action === "attach") counters.attached++;
  else if (decision.action === "create") counters.created++;
  else if (decision.action === "review") counters.review++;
  else counters.ignored++;
}
const duplicate = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";
function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}
async function pool<T, R>(
  items: T[],
  size: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await work(items[index]);
      }
    }),
  );
  return results;
}
async function serializable<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++)
    try {
      return await db.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      // P2034: the card changed under this transaction. Nothing was written, so it can run again.
      if (
        attempt >= 2 ||
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034"
      )
        throw error;
    }
}
function ledgerOf(lastCounts: unknown): Ledger {
  const stored = (lastCounts ?? {}) as Record<string, unknown>;
  const attempts: Record<string, number> = {};
  if (stored.attempts && typeof stored.attempts === "object")
    for (const [id, tries] of Object.entries(stored.attempts))
      if (typeof tries === "number") attempts[id] = tries;
  const run = stored.dryRun as Ledger["dryRun"];
  return {
    attempts,
    givenUp: Array.isArray(stored.givenUp)
      ? stored.givenUp.filter((id) => typeof id === "string")
      : [],
    dryRun:
      typeof run?.startedAt === "string" && typeof run.completedAt === "string"
        ? { startedAt: run.startedAt, completedAt: run.completedAt }
        : null,
  };
}
// The last check's counters are replaced as a whole; the ledger is written back with them.
const withLedger = (lastCounts: unknown, ledger: Ledger) => {
  const { dryRun, ...kept } = {
    ...((lastCounts ?? {}) as Record<string, Prisma.InputJsonValue>),
    ...ledger,
  };
  return dryRun ? { ...kept, dryRun } : kept;
};

const matched = <T extends { id: string }>(match: MatchResult, cards: T[]) =>
  match.kind === "unique"
    ? (cards.find((item) => item.id === match.applicationId) ?? null)
    : null;

// A card's events, newest first, without those that only record something next to the card:
// an interview being scheduled or cancelled names no mail and leaves the status as the event
// before it had it. Undo looks past them.
function changes<T extends { mailMessageId: string | null; status: string }>(
  events: T[],
): T[] {
  return events.filter(
    (item, index) =>
      item.mailMessageId !== null ||
      index === events.length - 1 ||
      item.status !== events[index + 1].status,
  );
}
const storedInterview = (parsed: ParsedInterview): StoredInterview =>
  JSON.parse(JSON.stringify(parsed));
// The interview a mail row's `proposal` column holds; undefined when the mail was never read
// for one (stored before interviews were read from mail), null when it has none.
function interviewIn(proposal: unknown): ParsedInterview | null | undefined {
  if (!proposal || typeof proposal !== "object" || !("interview" in proposal))
    return undefined;
  const value = (proposal as { interview: StoredInterview | null }).interview;
  if (!value || typeof value !== "object") return null;
  const date = (text: unknown) =>
    typeof text === "string" && !Number.isNaN(Date.parse(text))
      ? new Date(text)
      : null;
  return {
    ...value,
    startsAt: date(value.startsAt),
    endsAt: date(value.endsAt),
    interviewers: Array.isArray(value.interviewers) ? value.interviewers : [],
  };
}
// An interview is added without asking anyone only to the card the mail is matched to with
// the sender confirming the company, or to the card the mail itself creates. It never
// changes the card's stage and needs no second reader. An interview mail that cannot be
// tied to a card is not ignored: it waits in review, where a person can add it.
function withInterview(
  decision: Decision,
  match: MatchResult,
  parsed: ParsedInterview | null,
): { decision: Decision; tied: boolean } {
  if (!parsed) return { decision, tied: false };
  const tied =
    (match.kind === "unique" && match.corroborated !== false) ||
    decision.action === "create";
  if (tied || decision.action !== "ignore") return { decision, tied };
  return {
    decision: {
      action: "review",
      reason:
        "This email confirms an interview, but it could not be tied to one application",
    },
    tied,
  };
}

// decide() compares a mail only with the recorded submission. Whether a newer mail has
// reached the card already is known here: an older mail that turns up late (a retry, a
// reclassified or resolved mail) must not undo what the newer one did. A status change goes
// to review, a mere next-step refresh is only linked. A person's own decision may still
// change the status (`byUser`).
function ordered(
  decision: Decision,
  mail: RawMail,
  card: (CardState & { lastMailAt: Date | null }) | null,
  byUser = false,
): Decision {
  if (
    decision.action !== "update" ||
    !card?.lastMailAt ||
    card.lastMailAt <= mail.receivedAt
  )
    return decision;
  if (decision.status === card.status)
    return {
      action: "attach",
      reason: "A newer email already set this card's next step",
    };
  return byUser
    ? decision
    : { action: "review", reason: "A newer email already changed this card" };
}

// decide(), plus the two rules only the store can check: the order of the mail on a card,
// and that a card is never named after the mailbox owner.
function verdict(
  mail: RawMail,
  classification: Classification,
  match: MatchResult,
  card: (CardState & { lastMailAt: Date | null }) | null,
  ctx: Pick<Context, "now" | "owner">,
): { decision: Decision; company: string | null } {
  let decision = ordered(
    decide({ mail, classification, match, card, now: ctx.now }),
    mail,
    card,
  );
  // decide() words a split verdict as "not certain enough". Why it is not certain is the
  // first thing the reviewer needs to know.
  const readers = classification.decidedBy.split(" vs ai:");
  if (decision.action === "review" && readers.length === 2)
    decision = {
      action: "review",
      reason: `The rules and Claude read this email differently (${classification.category.replace("_", " ")} vs ${readers[1].replace("_", " ")}). ${sentence(decision.reason)}`,
    };
  if (decision.action !== "create") return { decision, company: null };
  // The classified name first: the evidence list can open with a bare domain label.
  const company =
    [classification.company ?? "", ...companyEvidence(mail, classification)]
      .map((name) => name.trim())
      .find((name) => name && !isOwner(name, ctx.owner)) ?? null;
  return company
    ? { decision, company }
    : {
        decision: {
          action: "review",
          reason: "No company name could be read from this mail",
        },
        company: null,
      };
}

// The second reader for a receipt: Claude is asked only when the receipt would create a
// card or mark one submitted (decide.ts says when), and never with the switch off.
async function confirmed(
  mail: RawMail,
  classification: Classification,
  match: MatchResult,
  card: CardState | null,
  now: Date,
  ai: AiClassifier | null,
): Promise<Classification> {
  return ai &&
    secondOpinion() &&
    needsSecondReader({ mail, classification, match, card, now })
    ? confirm(mail, classification, ai)
    : classification;
}

// Writes what a decision means: the card, its event and the mail row, in the caller's transaction.
async function write(
  tx: Tx,
  input: {
    rowId: string | null;
    mail: RawMail;
    classification: Classification;
    match: MatchResult;
    decision: Decision;
    company: string | null;
    card: Application | null;
    correctedFrom?: string | null;
    // A person asked for a new card: it is made even where the thread already has one.
    separate?: boolean;
    // An interview the mail offers; kept with it while it waits in review.
    offer?: ParsedInterview | null;
  },
): Promise<Outcome> {
  const { mail, classification, match, card } = input;
  let decision = input.decision;
  const sender = mail.fromName || mail.fromAddress;
  const subject = mail.subject.slice(0, 200);
  const note = `Email (${classification.category.replace("_", " ")}): "${subject}" from ${sender}`;
  const receipt = `Receipt by email on ${mail.receivedAt.toISOString().slice(0, 10)}: "${subject}" from ${sender}`;
  const save = async (state: MailState, applicationId: string | null) => {
    const data = {
      ...verdictFields(classification),
      state,
      applicationId,
      matchReason: reasonText(decision, match),
      ...(input.correctedFrom !== undefined
        ? { correctedFrom: input.correctedFrom }
        : {}),
    };
    const proposal =
      state === "needs_review" && input.offer
        ? { interview: storedInterview(input.offer) }
        : Prisma.DbNull;
    const row = input.rowId
      ? await tx.mailMessage.update({
          where: { id: input.rowId },
          data: { ...data, proposal },
        })
      : await tx.mailMessage.create({
          data: { ...mailFields(mail), ...data, proposal },
        });
    return { id: row.id, state, decision, applicationId };
  };
  const link = (applicationId: string, last: Date | null) =>
    tx.application.update({
      where: { id: applicationId },
      data: { lastMailAt: later(last, mail.receivedAt) },
    });

  // Also when the status stays and only the next step is replaced: the event keeps what
  // was there before, so the change can be undone like any other.
  if (decision.action === "update" && card) {
    await tx.application.update({
      where: { id: card.id },
      data: {
        status: decision.status,
        submittedAt: decision.submittedAt,
        nextStep: decision.nextStep,
        nextStepDueAt: decision.nextStepDueAt,
        lastMailAt: later(card.lastMailAt, mail.receivedAt),
        ...(decision.status === "submitted" && !card.evidence
          ? { evidence: receipt }
          : {}),
      },
    });
    const saved = await save("applied", card.id);
    const previous: Previous = {
      status: card.status,
      submittedAt: iso(card.submittedAt),
      nextStep: card.nextStep,
      nextStepDueAt: iso(card.nextStepDueAt),
      evidence: card.evidence,
    };
    await tx.applicationEvent.create({
      data: {
        applicationId: card.id,
        status: decision.status,
        note,
        mailMessageId: saved.id,
        previous,
      },
    });
    return saved;
  }
  if (decision.action === "attach" && card) {
    await link(card.id, card.lastMailAt);
    return save("attached", card.id);
  }
  if (decision.action === "create" && input.company) {
    let external = mail.threadId;
    let existing = await tx.job.findUnique({
      where: { canonicalKey: hash(`mail:${external}`) },
      include: { application: true },
    });
    if (existing?.application && !input.separate) {
      // The thread made a card before and the matcher did not offer it: a person decides.
      decision = {
        action: "review",
        reason: "A card for this mail thread already exists",
      };
      return save("needs_review", null);
    }
    if (existing?.application) {
      // The mail was taken off that card and gets its own: keyed by thread and mail.
      external = `${mail.threadId}:${mail.gmailId}`;
      existing = await tx.job.findUnique({
        where: { canonicalKey: hash(`mail:${external}`) },
        include: { application: true },
      });
      if (existing?.application)
        throw new Error("This email already has a card of its own.");
    }
    const source = await tx.source.upsert({
      where: { key: "mail" },
      create: {
        key: "mail",
        name: "From your email",
        kind: "mail",
        enabled: false,
      },
      update: {},
    });
    const title = roleTitle(classification);
    const description = `${mail.subject}\n\n${mail.bodyText}`.trim();
    const job =
      existing ??
      (await tx.job.create({
        data: {
          canonicalKey: hash(`mail:${external}`),
          title,
          company: input.company,
          location: "Not stated",
          countries: [],
          description,
          applyUrl: threadLink(mail.threadId),
          liveStatus: "unverified",
          ...matchJob(title, description),
          contentHash: hash(description),
          firstSeenAt: mail.receivedAt,
          lastSeenAt: mail.receivedAt,
        },
      }));
    const listed = { sourceId: source.id, externalId: external };
    await tx.listing.upsert({
      where: { sourceId_externalId: listed },
      create: { ...listed, url: threadLink(mail.threadId), jobId: job.id },
      update: { jobId: job.id },
    });
    const application = await tx.application.create({
      data: {
        jobId: job.id,
        origin: "email",
        status: decision.status,
        submittedAt: decision.submittedAt,
        nextStep: decision.nextStep,
        nextStepDueAt: decision.nextStepDueAt,
        lastMailAt: mail.receivedAt,
        // The matcher rules out mail older than an unsubmitted card. This card is as old as
        // the mail that made it, not as old as the import that found the mail.
        createdAt: mail.receivedAt,
        ...(decision.status === "submitted" ? { evidence: receipt } : {}),
      },
    });
    const saved = await save("applied", application.id);
    await tx.applicationEvent.create({
      data: {
        applicationId: application.id,
        status: decision.status,
        note,
        mailMessageId: saved.id,
      },
    });
    return saved;
  }
  if (decision.action === "ignore") return save("ignored", null);
  if (decision.action !== "review")
    decision = {
      action: "review",
      reason: "The matched application could not be read",
    };
  return save("needs_review", null);
}

// Match, decide and persist one classified mail. `rowId` is set when the mail is already
// stored. With `ai`, a receipt that would create a card or mark one submitted is put to
// Claude first, and the verdict stored is the one after that reading.
// `expect` skips a stored mail that someone changed since it was read (null is returned);
// `hold` may name a reason to keep the mail in review instead of acting on the decision.
// An interview the mail confirms is added in the same transaction (see withInterview).
// `parsed` is that interview when the caller already read it (null: none); otherwise the
// mail is read here, with its calendar part when it has one. `interviewTo` may refuse the
// card the interview would go to (applyProposals: only the card the report named).
async function settle(
  mail: RawMail,
  classification: Classification,
  rowId: string | null,
  ctx: Context,
  options: {
    ai?: AiClassifier | null;
    expect?: Prisma.MailMessageWhereInput;
    hold?: (decision: Decision, card: Application | null) => string | null;
    parsed?: ParsedInterview | null;
    interviewTo?: (applicationId: string, createdHere: boolean) => boolean;
  } = {},
): Promise<
  | (Outcome & {
      held: boolean;
      interview: { interviewId: string; created: boolean } | null;
    })
  | null
> {
  let match = matchMail(mail, classification, ctx.cards);
  // Asked outside the transaction, against the board as last loaded. If the card changed
  // meanwhile, decide() inside holds an unconfirmed receipt in review.
  const seen = matched(match, ctx.cards);
  const final = await confirmed(
    mail,
    classification,
    match,
    seen,
    ctx.now,
    options.ai ?? null,
  );
  // Claude may have named the company the rules missed.
  if (final !== classification) match = matchMail(mail, final, ctx.cards);
  const parsed =
    options.parsed !== undefined ? options.parsed : parseInterviewMail(mail);
  const outcome = await serializable(async (tx) => {
    if (rowId && options.expect) {
      const untouched = await tx.mailMessage.count({
        where: { ...options.expect, id: rowId },
      });
      if (!untouched) return null;
    }
    const card =
      match.kind === "unique"
        ? await tx.application.findUnique({
            where: { id: match.applicationId },
          })
        : null;
    const found = verdict(mail, final, match, card, ctx);
    const reason = options.hold?.(found.decision, card) ?? null;
    const held: Decision | null = reason ? { action: "review", reason } : null;
    const read = withInterview(
      held ?? found.decision,
      match.kind === "unique" && !card ? { ...match, kind: "none" } : match,
      held ? null : parsed,
    );
    const saved = await write(tx, {
      rowId,
      mail,
      classification: final,
      match,
      card,
      ...(held ? { company: null } : found),
      decision: read.decision,
      offer: read.tied ? null : parsed,
    });
    // The card the interview goes to: the matched one, or the one this mail just created.
    const target = !read.tied
      ? null
      : match.kind === "unique" && card
        ? card.id
        : saved.decision.action === "create"
          ? saved.applicationId
          : null;
    const interview =
      parsed &&
      target &&
      (options.interviewTo?.(target, saved.decision.action === "create") ??
        true)
        ? await upsertInterviewFromMail(
            {
              applicationId: target,
              mailId: saved.id,
              parsed,
              receivedAt: mail.receivedAt,
            },
            tx,
          )
        : null;
    // Not added after all (refused, or nothing to add): it waits in review as an offer.
    if (parsed && !interview && read.tied && saved.state === "needs_review")
      await tx.mailMessage.update({
        where: { id: saved.id },
        data: { proposal: { interview: storedInterview(parsed) } },
      });
    return { ...saved, held: held !== null, interview };
  });
  // The next mail must see the card this one created, moved or linked its thread to.
  if (outcome?.state === "applied" || outcome?.state === "attached")
    ctx.cards = await loadBoard();
  return outcome;
}

// A dry-run row. The interview is read now, while the mail's calendar part is at hand: it
// is not stored, and the plan and --apply use what is read here.
const stage = async (mail: RawMail, classification: Classification) => {
  const parsed = parseInterviewMail(mail);
  return (
    await db.mailMessage.create({
      data: {
        ...mailFields(mail),
        ...verdictFields(classification),
        state: "proposed",
        proposal: { interview: parsed ? storedInterview(parsed) : null },
      },
      select: { id: true },
    })
  ).id;
};

// Plans every dry-run row, oldest first, against the board as it would be after the earlier
// proposals, so that the receipt which would create a card and the rejection that follows it
// are planned as one card. A receipt that needs the second reader is put to Claude here,
// once: its answer is stored with the row. Only those rows' verdict and proposal columns
// are written. `alive` is asked before each row; planning stops when it says no.
async function planProposals(
  ctx: Pick<Context, "now" | "owner">,
  ai: AiClassifier | null,
  alive: () => Promise<boolean> = async () => true,
): Promise<Map<string, Decision>> {
  const cards = await loadBoard();
  const rows = await db.mailMessage.findMany({
    where: { state: "proposed" },
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    omit: { bodyText: true },
  });
  const planned = new Map<string, Decision>();
  for (const row of rows) {
    if (!(await alive())) break;
    let mail = toMail(row);
    let classification = toClassification(row);
    let match = matchMail(mail, classification, cards);
    let card = matched(match, cards);
    if (
      ai &&
      secondOpinion() &&
      needsSecondReader({ mail, classification, match, card, now: ctx.now })
    ) {
      // Claude reads the mail as it is stored, body included.
      const body = await db.mailMessage.findUnique({
        where: { id: row.id },
        select: { bodyText: true },
      });
      mail = { ...mail, bodyText: body?.bodyText ?? "" };
      classification = await confirm(mail, classification, ai);
      await db.mailMessage.update({
        where: { id: row.id },
        data: verdictFields(classification),
      });
      match = matchMail(mail, classification, cards);
      card = matched(match, cards);
    }
    const found = verdict(mail, classification, match, card, ctx);
    const company = found.company;
    // Read when the mail was staged; a row staged before interviews were read from mail is
    // read from its stored body.
    let parsed = interviewIn(row.proposal);
    if (parsed === undefined) {
      const body = await db.mailMessage.findUnique({
        where: { id: row.id },
        select: { bodyText: true },
      });
      parsed = parseInterviewMail({ ...mail, bodyText: body?.bodyText ?? "" });
    }
    const read = withInterview(found.decision, match, parsed);
    const decision = read.decision;
    // The card as this mail finds it, for the check at apply time.
    const start = card && { status: card.status, nextStep: card.nextStep };
    if (decision.action === "create" && company) {
      // Dated like the card applyProposals will create: by the mail, not by the import.
      card = {
        id: `new:${row.id}`,
        company,
        title: roleTitle(classification),
        origin: "email",
        status: decision.status,
        submittedAt: decision.submittedAt,
        createdAt: mail.receivedAt,
        lastMailAt: null,
        nextStep: decision.nextStep,
        nextStepDueAt: decision.nextStepDueAt,
        threadIds: [],
      };
      cards.push(card);
    } else if (decision.action === "update" && card) {
      card.status = decision.status;
      card.submittedAt = decision.submittedAt;
      card.nextStep = decision.nextStep;
      card.nextStepDueAt = decision.nextStepDueAt;
    }
    // Review and ignore leave the mail unlinked, as they do when applied.
    if (card && decision.action !== "review" && decision.action !== "ignore") {
      card.lastMailAt = later(card.lastMailAt, mail.receivedAt);
      if (!card.threadIds.includes(mail.threadId))
        card.threadIds.push(mail.threadId);
    }
    const proposal: MailProposal = {
      decision,
      match,
      card: card && {
        id: card.id,
        company: card.company,
        title: card.title,
        ...start,
      },
      interview: parsed ? storedInterview(parsed) : null,
      interviewCard: read.tied && card ? card.id : null,
    };
    await db.mailMessage.update({
      where: { id: row.id },
      data: {
        proposal: JSON.parse(JSON.stringify(proposal)),
        matchReason: reasonText(decision, match),
      },
    });
    planned.set(row.id, decision);
  }
  return planned;
}

// The lease on the single MailSync row. Every step checks that the value this process wrote
// is still there: a process that slept through its lease (a laptop lid closed during a
// backfill) must neither extend nor clear the lease another check holds by then.
export type Lease = {
  lost: boolean;
  renew(): Promise<boolean>; // false once the lease belongs to someone else
  // Writes to the MailSync row while the lease is still held; `release` also gives it up.
  write(data: Prisma.MailSyncUpdateManyMutationInput): Promise<boolean>;
  release(data?: Prisma.MailSyncUpdateManyMutationInput): Promise<boolean>;
};
type LeaseStore = {
  // Sets the lease to `next` (and writes `data`) only where it still equals `held`.
  swap(
    held: Date,
    next: Date | null,
    data?: Prisma.MailSyncUpdateManyMutationInput,
  ): Promise<boolean>;
  holds(held: Date): Promise<boolean>;
};
// Exported for its test. Calls are taken one at a time: the classify pool asks four at once,
// and two renewals in flight would each compare against a value the other is replacing,
// so the second would see its own lease as lost.
export function leaseKeeper(
  store: LeaseStore,
  claimed: Date,
  clock: () => number = Date.now,
): Lease {
  let held = claimed;
  let queue: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(work: () => Promise<T>) => {
    const run = queue.then(work);
    queue = run.catch(() => undefined);
    return run;
  };
  const swap = async (
    next: Date | null,
    data?: Prisma.MailSyncUpdateManyMutationInput,
  ) => {
    if (lease.lost) return false;
    if (await store.swap(held, next, data)) {
      if (next) held = next;
    } else lease.lost = true;
    return !lease.lost;
  };
  const lease: Lease = {
    lost: false,
    renew: () =>
      inTurn(async () => {
        if (lease.lost) return false;
        // Extended once a minute, checked every time.
        if (held.valueOf() - leaseMs + 60_000 < clock())
          return swap(new Date(clock() + leaseMs));
        if (!(await store.holds(held))) lease.lost = true;
        return !lease.lost;
      }),
    write: (data) => inTurn(() => swap(held, data)),
    release: (data) => inTurn(() => swap(null, data)),
  };
  return lease;
}
async function claim(): Promise<Lease | null> {
  const id = syncId();
  const at = new Date();
  const held = new Date(at.valueOf() + leaseMs);
  await db.mailSync.upsert({ where: { id }, create: { id }, update: {} });
  const claimed = await db.mailSync.updateMany({
    where: { id, OR: [{ leaseUntil: null }, { leaseUntil: { lt: at } }] },
    data: { leaseUntil: held },
  });
  if (!claimed.count) return null;
  return leaseKeeper(
    {
      swap: async (mine, next, data = {}) =>
        (
          await db.mailSync.updateMany({
            where: { id, leaseUntil: mine },
            data: { ...data, leaseUntil: next },
          })
        ).count > 0,
      holds: async (mine) =>
        (await db.mailSync.count({ where: { id, leaseUntil: mine } })) > 0,
    },
    held,
  );
}
async function leased<T>(work: (lease: Lease) => Promise<T>) {
  const lease = await claim();
  if (!lease) throw new Error(busy);
  try {
    return await work(lease);
  } finally {
    await lease.release();
  }
}
// Counts every mail sent to Claude and what came back, and stops asking once five mails in
// a row got nothing and none got an answer: a wrong key would otherwise cost a timeout per mail.
function watched(ai: AiClassifier | null) {
  const seen = { attempts: 0, silent: 0 };
  const ask: AiClassifier | null =
    ai &&
    (async (mail) => {
      if (seen.silent >= 5 && seen.silent === seen.attempts) return null;
      seen.attempts++;
      const answer = await ai(mail).catch(() => null);
      if (!answer) seen.silent++;
      return answer;
    });
  return { ask, seen };
}

// True once a history import has been applied (npm run mail:backfill -- --apply). Until
// then no check may change a card.
export async function mailLive(): Promise<boolean> {
  const setting = await db.setting.findUnique({ where: { key: liveKey() } });
  return setting?.value === true;
}
// The switch itself. Called by applyProposals when an import has been applied in full, and
// by `npm run mail:backfill -- --off` to stop scheduled checks. Nothing else may call it.
export async function setMailLive(on: boolean): Promise<void> {
  await db.setting.upsert({
    where: { key: liveKey() },
    create: { key: liveKey(), value: on },
    update: { value: on },
  });
}

// Classify, match, decide and persist one mail. Idempotent on gmailId: a message already
// stored is returned untouched, with an "ignore" decision because this call did nothing.
// With dryRun the row is stored as "proposed" and nothing else changes.
export async function processMessage(
  mail: RawMail,
  options: { ai: AiClassifier | null; dryRun: boolean; now: Date },
): Promise<{ id: string; state: MailState; decision: Decision }> {
  const untouched = async () => {
    const row = await db.mailMessage.findUnique({
      where: { gmailId: mail.gmailId },
      select: { id: true, state: true },
    });
    const decision: Decision = {
      action: "ignore",
      reason: "Already stored, left untouched",
    };
    return row && { id: row.id, state: row.state as MailState, decision };
  };
  const existing = await untouched();
  if (existing) return existing;
  const classification = await classify(mail, options.ai, {
    secondOpinion: secondOpinion(),
  });
  const ctx = await context(options.now);
  try {
    if (!options.dryRun) {
      const outcome = await settle(mail, classification, null, ctx, {
        ai: options.ai,
      });
      if (!outcome) throw new Error("The email could not be stored.");
      return {
        id: outcome.id,
        state: outcome.state,
        decision: outcome.decision,
      };
    }
    const id = await stage(mail, classification);
    const decision = (await planProposals(ctx, options.ai)).get(id);
    if (!decision) throw new Error("The stored proposal could not be read.");
    return { id, state: "proposed", decision };
  } catch (error) {
    // Another run stored the same message in the meantime.
    const stored = duplicate(error) ? await untouched() : null;
    if (stored) return stored;
    throw error;
  }
}

// One check: lease MailSync, list since lastSuccessAt minus 1 hour (or `since`), fetch,
// prefilter, process oldest first, record counters. Returns the counters.
// A check that may change cards (no dryRun) runs only once a history import has been
// applied and no proposals wait: otherwise `skipped` is true and Gmail is not called.
// A dry run stores each batch as it is read, so one that is cut short can be taken up
// again; it keeps proposals that are already stored and never moves the check window.
// `reason` says why a check was skipped or stopped early. A rejected Google sign-in is
// recorded and returns zeros.
export async function syncMail(
  options: {
    client?: MailClient;
    ai?: AiClassifier | null; // undefined: the Claude classifier when a key is set
    since?: Date;
    dryRun?: boolean;
    now?: Date;
    retryGivenUp?: boolean; // also ask again for the messages that were given up on
    label?: string; // only mail with this Gmail label, for a backfill of mail you sorted
  } = {},
): Promise<Counters & { skipped: boolean; reason: SyncReason | null }> {
  const started = new Date();
  const now = options.now ?? started;
  const dryRun = options.dryRun ?? false;
  const counters = zero();
  const idle = (reason: SyncReason) => ({ ...zero(), skipped: true, reason });
  if (!dryRun) {
    if (!(await mailLive())) return idle("not-live");
    if (await db.mailMessage.count({ where: { state: "proposed" } }))
      return idle("pending-proposals");
  }
  const lease = await claim();
  if (!lease) return idle("busy");
  const { ask, seen } = watched(
    options.ai === undefined ? aiClassifier() : options.ai,
  );
  // Another check took the lease over: what was stored stays, the rest is left to it.
  const handedOver = () => ({
    ...counters,
    aiCalls: seen.attempts,
    skipped: false,
    reason: "lease-lost" as const,
  });
  const sync = await db.mailSync.findUniqueOrThrow({ where: { id: syncId() } });
  const email = (await readToken())?.email ?? sync.email;
  const ledger = ledgerOf(sync.lastCounts);
  try {
    const client = options.client ?? (await gmailClient());
    // A dry run that starts makes the report of the one before it stale.
    if (dryRun && ledger.dryRun) {
      ledger.dryRun = null;
      if (
        !(await lease.write({
          lastCounts: withLedger(sync.lastCounts, ledger),
        }))
      )
        return handedOver();
    }
    // Before the first clean check the window starts at the newest stored mail.
    const anchor =
      sync.lastSuccessAt ??
      (await db.mailMessage.aggregate({ _max: { receivedAt: true } }))._max
        .receivedAt ??
      started;
    const since = options.since ?? new Date(anchor.valueOf() - overlapMs);
    const refs = new Set(
      (await client.list(sinceQuery(since, options.label))).map(
        (ref) => ref.id,
      ),
    );
    counters.listed = refs.size;
    // Messages that failed before are asked for by id, wherever the window is by now.
    // Those given up on are left alone unless this check was told to try them again.
    const givenUp = new Set(ledger.givenUp);
    const ids = [
      ...new Set([
        ...refs,
        ...Object.keys(ledger.attempts),
        ...(options.retryGivenUp ? givenUp : []),
      ]),
    ].filter((id) => options.retryGivenUp || !givenUp.has(id));
    const ctx = await context(now);
    const known = new Set<string>();
    for (const part of chunks(ids, 1000))
      for (const row of await db.mailMessage.findMany({
        where: { gmailId: { in: part } },
        select: { gmailId: true },
      }))
        known.add(row.gmailId);
    const board = {
      companies: [
        ...new Set(
          ctx.cards
            .map((card) => normalizeCompany(card.company))
            .filter(Boolean),
        ),
      ],
      threadIds: new Set(ctx.cards.flatMap((card) => card.threadIds)),
    };
    const failures = new Map<string, "read" | "stored">();
    const answered = new Set(known); // read, stored already, or gone for good
    let broken = "";
    let inARow = 0;
    const kept: RawMail[] = [];
    const sent: RawMail[] = [];
    const staged: string[] = [];
    const read = (mails: RawMail[]) =>
      pool(mails, 4, async (mail) =>
        (await lease.renew())
          ? classify(mail, ask, { secondOpinion: secondOpinion() })
          : null,
      );
    // Dry run: classify and store one batch, so that an interruption loses little.
    const stageAll = async (mails: RawMail[]) => {
      const verdicts = await read(mails);
      for (const [index, mail] of mails.entries()) {
        const classification = verdicts[index];
        if (!classification || !(await lease.renew())) return false;
        try {
          staged.push(await stage(mail, classification));
          counters.candidates++;
          if (ask && classification.decidedBy === "none") counters.aiFailures++;
        } catch (error) {
          if (duplicate(error)) continue;
          failures.set(mail.gmailId, "stored");
          broken ||= error instanceof Error ? error.message : "Unknown error";
        }
      }
      return true;
    };
    for (const batch of chunks(
      ids.filter((id) => !known.has(id)),
      25,
    )) {
      if (!(await lease.renew())) return handedOver();
      const fetched = await Promise.allSettled(
        batch.map((id) => client.get(id)),
      );
      const fresh: RawMail[] = [];
      for (const [index, result] of fetched.entries()) {
        if (result.status === "fulfilled") {
          inARow = 0;
          answered.add(batch[index]);
          if (result.value.fromMe) sent.push(result.value);
          else if (isCandidate(result.value, board)) fresh.push(result.value);
        } else if (result.reason instanceof MailAuthError) throw result.reason;
        else if (gone(result.reason)) answered.add(batch[index]);
        else {
          // One message that cannot be read, also after the client's own retries, waits
          // for the next check. Five in a row mean Gmail is not answering: stop here.
          failures.set(batch[index], "read");
          if (++inARow >= abortAfter)
            throw result.reason instanceof MailProviderError
              ? result.reason
              : new Error(
                  `${abortAfter} emails in a row could not be read, the check was stopped: ${result.reason instanceof Error ? result.reason.message : "unknown error"}`,
                );
        }
      }
      if (!dryRun) kept.push(...fresh);
      else if (!(await stageAll(fresh))) return handedOver();
    }
    if (dryRun) {
      // Your own replies are kept only as context for a thread that has application mail.
      const threads = new Set([
        ...board.threadIds,
        ...(
          await db.mailMessage.findMany({
            where: { state: "proposed" },
            select: { threadId: true },
            distinct: ["threadId"],
          })
        ).map((row) => row.threadId),
      ]);
      if (!(await stageAll(sent.filter((mail) => threads.has(mail.threadId)))))
        return handedOver();
      const planned = await planProposals(ctx, ask, () => lease.renew());
      if (lease.lost) return handedOver();
      for (const id of staged) {
        const decision = planned.get(id);
        if (decision) count(counters, decision);
      }
    } else {
      const threads = new Set([
        ...board.threadIds,
        ...kept.map((mail) => mail.threadId),
      ]);
      const queue = [
        ...kept,
        ...sent.filter((mail) => threads.has(mail.threadId)),
      ].sort((a, b) => a.receivedAt.valueOf() - b.receivedAt.valueOf());
      const verdicts = await read(queue);
      if (lease.lost) return handedOver();
      for (const [index, mail] of queue.entries()) {
        const classification = verdicts[index];
        if (!classification || !(await lease.renew())) return handedOver();
        try {
          const outcome = await settle(mail, classification, null, ctx, {
            ai: ask,
          });
          if (outcome) count(counters, outcome.decision);
          if (outcome?.interview) counters.interviews++;
          counters.candidates++;
          if (ask && classification.decidedBy === "none") counters.aiFailures++;
        } catch (error) {
          if (duplicate(error)) continue;
          failures.set(mail.gmailId, "stored");
          broken ||= error instanceof Error ? error.message : "Unknown error";
        }
      }
    }
    counters.failed = failures.size;
    counters.aiCalls = seen.attempts;
    // A message holds the window until it is read or has failed in five checks in a row.
    // After that it is kept on a list of its own and no longer asked for.
    const attempts: Record<string, number> = {};
    const still = ledger.givenUp.filter((id) => !answered.has(id));
    for (const id of failures.keys()) {
      const tries = (ledger.attempts[id] ?? 0) + 1;
      if (givenUp.has(id)) continue;
      if (tries >= giveUpAfter) still.push(id);
      else attempts[id] = tries;
    }
    const waiting = [...failures].filter(([id]) => id in attempts);
    const unread = waiting.filter(([, kind]) => kind === "read").length;
    const unstored = waiting.length - unread;
    const problems = [
      unread ? `${plural(unread)} could not be read and will be retried.` : "",
      unstored
        ? `${plural(unstored)} could not be stored and will be retried: ${sentence(broken)}.`
        : "",
    ]
      .filter(Boolean)
      .join(" ");
    const ended = new Date();
    // The warning stays through checks that had nothing to ask, until an answer arrives.
    const unanswered =
      ask &&
      seen.silent === seen.attempts &&
      (seen.attempts >= 3 || sync.lastError === aiSilent);
    const released = await lease.release({
      email,
      lastCheckedAt: ended,
      // The start of the check, so that mail arriving while it ran is listed next time.
      // Not moved while a message still waits for another try, and never by a dry run:
      // what a dry run read is not on the board until it is applied.
      ...(waiting.length || dryRun ? {} : { lastSuccessAt: started }),
      lastError: problems.slice(0, 400) || (unanswered ? aiSilent : null),
      nextRunAt: new Date(ended.valueOf() + intervalMs),
      lastCounts: withLedger(
        { ...counters, wasDryRun: dryRun },
        {
          attempts,
          givenUp: still.slice(-givenUpLimit),
          dryRun: dryRun
            ? {
                startedAt: started.toISOString(),
                completedAt: ended.toISOString(),
              }
            : ledger.dryRun,
        },
      ),
    });
    return released
      ? { ...counters, skipped: false, reason: null }
      : handedOver();
  } catch (error) {
    const auth = error instanceof MailAuthError;
    const retryAfter =
      error && typeof error === "object" && "retryAfterSeconds" in error
        ? Number(error.retryAfterSeconds) || 0
        : 0;
    await lease.release({
      email,
      lastCheckedAt: new Date(),
      lastError: auth
        ? reconnect
        : error instanceof Error
          ? error.message.slice(0, 400)
          : "Unknown mail error",
      nextRunAt: new Date(Date.now() + Math.max(intervalMs, retryAfter * 1000)),
    });
    if (auth) return { ...zero(), skipped: false, reason: null };
    throw error;
  }
}

const actionWords: Record<Decision["action"], string> = {
  update: "change a card",
  attach: "link the email to a card",
  create: "create a card",
  review: "leave it for review",
  ignore: "ignore it",
};
// Does what would happen now equal what the report showed? Compared on the action, the
// status the card ends on and the card itself (`target` is the planned card, with the
// placeholder of a card that did not exist yet already resolved).
function asProposed(
  proposal: MailProposal,
  decision: Decision,
  cardId: string | null,
  target: string | null,
) {
  if (proposal.decision.action !== decision.action) return false;
  if (
    "status" in decision &&
    (!("status" in proposal.decision) ||
      proposal.decision.status !== decision.status)
  )
    return false;
  return decision.action !== "update" && decision.action !== "attach"
    ? true
    : target === cardId;
}

// Apply every stored proposal (dry-run rows) in receivedAt order, then turn scheduled
// checks on. Refuses unless a dry run has run to its end since the last discard.
// Each mail is decided again, because the board may have changed since the report. Where
// the card is not as the report found it, or the result differs from what the report
// showed, nothing is applied and the mail goes to review (`diverged`). Mail ids in `hold`
// go to review unapplied (`heldBack`). A mail that fails goes to review too (`failed`) and
// the run goes on. `complete` is false when another check took over: checks are switched
// on only by a run that reached the end. Claude is not asked again here: the stored
// verdict carries its answer, and a new one could only make the result differ.
export async function applyProposals(
  now: Date = new Date(),
  options: { hold?: string[] } = {},
): Promise<
  Applied & {
    diverged: number;
    heldBack: number;
    failed: number;
    interviews: number;
    complete: boolean;
  }
> {
  const counters = {
    applied: 0,
    attached: 0,
    created: 0,
    review: 0,
    ignored: 0,
    diverged: 0,
    heldBack: 0,
    failed: 0,
    interviews: 0,
  };
  const rows = await db.mailMessage.findMany({
    where: { state: "proposed" },
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  const sync = await db.mailSync.findUnique({ where: { id: syncId() } });
  if (!ledgerOf(sync?.lastCounts).dryRun)
    throw new Error(
      rows.length
        ? "The dry run did not finish. Run npm run mail:backfill -- --resume, then read its report."
        : "Run npm run mail:backfill first and read its report.",
    );
  const hold = new Set(options.hold ?? []);
  const unknown = [...hold].filter((id) => !rows.some((row) => row.id === id));
  if (unknown.length)
    throw new Error(
      `No proposal has the mail id ${unknown.join(", ")}. Nothing was applied.`,
    );
  const complete = await leased(async (lease) => {
    const ctx = await context(now);
    // "new:<mail id>" is the card that mail created: in this run, or in one before it
    // that was interrupted.
    const made = new Map<string, string | null>();
    const resolve = async (cardId: string) => {
      if (!cardId.startsWith("new:")) return cardId;
      if (!made.has(cardId)) {
        const maker = await db.mailMessage.findUnique({
          where: { id: cardId.slice(4) },
          select: { state: true, applicationId: true },
        });
        made.set(
          cardId,
          maker?.state === "applied" ? maker.applicationId : null,
        );
      }
      return made.get(cardId) ?? null;
    };
    const waiting = { state: "proposed", applicationId: null };
    // An interview the mail would have added stays with it in review, for a person to add.
    const aside = (id: string, reason: string, proposal: unknown) => {
      const parsed = interviewIn(proposal);
      return db.mailMessage.updateMany({
        where: { id, ...waiting },
        data: {
          state: "needs_review",
          proposal: parsed
            ? { interview: storedInterview(parsed) }
            : Prisma.DbNull,
          matchReason: reason,
        },
      });
    };
    for (const { id } of rows) {
      if (!(await lease.renew())) return false;
      let stored: unknown = null;
      try {
        const row = await db.mailMessage.findUnique({ where: { id } });
        if (row?.state !== "proposed") continue;
        stored = row.proposal;
        if (hold.has(id)) {
          counters.heldBack += (
            await aside(id, "Held back by you.", row.proposal)
          ).count;
          continue;
        }
        const proposal = row.proposal as MailProposal | null;
        const target = proposal?.card ? await resolve(proposal.card.id) : null;
        const start = proposal?.card?.status ?? null;
        // Interviews are added where the report said: to that card, and only to that card.
        const interviewCard = proposal?.interviewCard ?? null;
        const interviewTarget =
          interviewCard === `new:${id}`
            ? "this mail's card"
            : interviewCard
              ? await resolve(interviewCard)
              : null;
        const outcome = await settle(
          toMail(row),
          toClassification(row),
          id,
          ctx,
          {
            expect: waiting,
            // The calendar part was read when the mail was staged; the stored body lacks it.
            parsed: interviewIn(row.proposal) ?? null,
            interviewTo: (applicationId, createdHere) =>
              interviewTarget === applicationId ||
              (interviewTarget === "this mail's card" && createdHere),
            hold: (decision, card) => {
              if (!proposal)
                return "This email was not in the report. It was read after the report was written";
              if (card && card.id === target && start && card.status !== start)
                return `The card changed after the report was written. It was ${start} then and is ${card.status} now`;
              return asProposed(proposal, decision, card?.id ?? null, target)
                ? null
                : `The board changed after the report was written. The report said to ${actionWords[proposal.decision.action]}, now it would be to ${actionWords[decision.action]}`;
            },
          },
        );
        if (!outcome) continue;
        if (outcome.held) counters.diverged++;
        else count(counters, outcome.decision);
        if (outcome.interview) counters.interviews++;
        if (outcome.decision.action === "create" && outcome.applicationId)
          made.set(`new:${id}`, outcome.applicationId);
      } catch (error) {
        // One mail that cannot be applied does not stop the rest.
        const kind = error instanceof Error ? error.name : "Error";
        counters.failed += (
          await aside(id, `This email could not be applied (${kind}).`, stored)
        ).count;
        ctx.cards = await loadBoard();
      }
    }
    // Live checks go on from where the dry run started reading, unless they were on before.
    const current = await db.mailSync.findUniqueOrThrow({
      where: { id: syncId() },
    });
    const ledger = ledgerOf(current.lastCounts);
    return lease.write({
      ...(current.lastSuccessAt || !ledger.dryRun
        ? {}
        : { lastSuccessAt: new Date(ledger.dryRun.startedAt) }),
      lastCounts: withLedger(current.lastCounts, { ...ledger, dryRun: null }),
    });
  });
  if (complete) await setMailLive(true);
  return { ...counters, complete };
}

// Throws a dry run away: deletes every proposed row and forgets that a dry run completed,
// so that the next one fetches and plans that mail again with the rules as they are then.
// Nothing else is touched: no card, no other mail, not the live switch, not the window.
export async function discardProposals(): Promise<number> {
  const proposed = { state: "proposed" };
  const sync = await db.mailSync.findUnique({ where: { id: syncId() } });
  const ledger = ledgerOf(sync?.lastCounts);
  if (!ledger.dryRun && !(await db.mailMessage.count({ where: proposed })))
    return 0;
  return leased(async (lease) => {
    const current = await db.mailSync.findUniqueOrThrow({
      where: { id: syncId() },
    });
    await lease.write({
      lastCounts: withLedger(current.lastCounts, {
        ...ledgerOf(current.lastCounts),
        dryRun: null,
      }),
    });
    return (await db.mailMessage.deleteMany({ where: proposed })).count;
  });
}

// What the stored proposals would do to the board, for the backfill report: the cards they
// would create, the status every card with mail would end on, each rejection and the review
// list, each with the mail ids that `--hold` takes. `agreedChanges` are the changes both
// readers agree on, `receiptsWithoutClaude` the cards made from a hiring system's receipt
// that states the role, which need no second reader.
export async function proposalSummary(): Promise<{
  total: number;
  categories: Record<string, number>;
  actions: Record<Decision["action"], number>;
  agreedChanges: number;
  receiptsWithoutClaude: number;
  reviewReasons: Array<{ reason: string; mails: number }>;
  // Interviews --apply would add, and those it would only offer in review (no single card).
  interviews: Array<{
    id: string; // the mail's id
    company: string;
    title: string;
    newCard: boolean;
    startsAt: Date | null;
    timezone: string | null;
    provider: string;
    subject: string;
  }>;
  interviewOffers: Array<{
    id: string;
    subject: string;
    startsAt: Date | null;
    timezone: string | null;
    provider: string;
  }>;
  created: Array<{
    company: string;
    title: string;
    status: string;
    mails: number;
    mailIds: string[];
    firstMailAt: Date;
    firstSubject: string;
  }>;
  existing: Array<{
    applicationId: string;
    company: string;
    title: string;
    statusNow: string;
    statusAfter: string;
    mails: number;
    mailIds: string[];
  }>;
  rejections: Array<{
    id: string;
    receivedAt: Date;
    subject: string;
    fromName: string;
    fromAddress: string;
    company: string;
    title: string;
    newCard: boolean;
    decidedBy: string;
    evidenceQuote: string | null;
  }>;
  review: Array<{
    id: string;
    receivedAt: Date;
    subject: string;
    fromName: string;
    fromAddress: string;
    category: MailCategory;
    confidence: Confidence;
    reason: string;
  }>;
}> {
  const rows = await db.mailMessage.findMany({
    where: { state: "proposed" },
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    omit: { bodyText: true },
  });
  const categories: Record<string, number> = {};
  const actions = { update: 0, attach: 0, create: 0, review: 0, ignore: 0 };
  const reasons = new Map<string, number>();
  let agreedChanges = 0;
  let receiptsWithoutClaude = 0;
  const interviews = [];
  const interviewOffers = [];
  const cards = new Map<
    string,
    {
      company: string;
      title: string;
      status: string | null;
      mailIds: string[];
      first: (typeof rows)[number];
    }
  >();
  const rejections = [];
  const review = [];
  for (const row of rows) {
    const proposal = row.proposal as MailProposal | null;
    if (!proposal) continue;
    const { decision, card } = proposal;
    const mail = {
      id: row.id,
      receivedAt: row.receivedAt,
      subject: row.subject,
      fromName: row.fromName,
      fromAddress: row.fromAddress,
    };
    categories[row.category] = (categories[row.category] ?? 0) + 1;
    actions[decision.action]++;
    const parsed = interviewIn(proposal);
    if (parsed) {
      const when = {
        startsAt: parsed.startsAt,
        timezone: parsed.timezone,
        provider: parsed.provider,
      };
      if (proposal.interviewCard && card)
        interviews.push({
          id: row.id,
          company: card.company,
          title: card.title,
          newCard: card.id.startsWith("new:"),
          ...when,
          subject: row.subject,
        });
      else interviewOffers.push({ id: row.id, subject: row.subject, ...when });
    }
    if (decision.action === "review") {
      const reason = sentence(decision.reason);
      reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
      review.push({
        ...mail,
        category: row.category as MailCategory,
        confidence: row.confidence as Confidence,
        reason: row.matchReason,
      });
    }
    if (decision.action === "update" || decision.action === "create") {
      if (agreedIn(row.decidedBy, row.category) === true) agreedChanges++;
      else receiptsWithoutClaude++;
    }
    if (!card || decision.action === "review" || decision.action === "ignore")
      continue;
    const seen = cards.get(card.id) ?? {
      company: card.company,
      title: card.title,
      status: null,
      mailIds: [],
      first: row,
    };
    seen.mailIds.push(row.id);
    if (decision.action !== "attach") seen.status = decision.status;
    cards.set(card.id, seen);
    if (row.category === "rejection" && decision.action !== "attach")
      rejections.push({
        ...mail,
        company: card.company,
        title: card.title,
        newCard: card.id.startsWith("new:"),
        decidedBy: row.decidedBy,
        evidenceQuote: row.evidenceQuote,
      });
  }
  const now = new Map(
    (
      await db.application.findMany({
        where: { id: { in: [...cards.keys()] } },
        select: { id: true, status: true },
      })
    ).map((item) => [item.id, item.status]),
  );
  return {
    total:
      actions.update +
      actions.attach +
      actions.create +
      actions.review +
      actions.ignore,
    categories,
    actions,
    agreedChanges,
    receiptsWithoutClaude,
    interviews,
    interviewOffers,
    reviewReasons: [...reasons]
      .map(([reason, mails]) => ({ reason, mails }))
      .sort((a, b) => b.mails - a.mails || a.reason.localeCompare(b.reason)),
    created: [...cards].flatMap(([id, card]) =>
      id.startsWith("new:") && card.status
        ? [
            {
              company: card.company,
              title: card.title,
              status: card.status,
              mails: card.mailIds.length,
              mailIds: card.mailIds,
              firstMailAt: card.first.receivedAt,
              firstSubject: card.first.subject,
            },
          ]
        : [],
    ),
    existing: [...cards].flatMap(([id, card]) => {
      const statusNow = now.get(id);
      return statusNow
        ? [
            {
              applicationId: id,
              company: card.company,
              title: card.title,
              statusNow,
              statusAfter: card.status ?? statusNow,
              mails: card.mailIds.length,
              mailIds: card.mailIds,
            },
          ]
        : [];
    }),
    rejections,
    review,
  };
}

// The verdict a mail has and the one it gets now, compared on what a reader decided.
// A reading by Claude that is stored is never replaced by no reading: classify() does not
// put receipts to Claude, and Claude may be switched off or not answering this time.
function sameVerdict(before: Classification, after: Classification) {
  const rule = (decidedBy: string) =>
    decidedBy.replace(/\+ai$/, "").split(" vs ai:")[0];
  if (after.decidedBy === "none") return true;
  if (
    before.category !== after.category ||
    before.company !== after.company ||
    before.role !== after.role ||
    rule(before.decidedBy) !== rule(after.decidedBy)
  )
    return false;
  return before.decidedBy === after.decidedBy
    ? before.confidence === after.confidence
    : after.decidedBy === rule(after.decidedBy);
}

// Re-runs classification on stored mail that nothing could decide or that waits for review.
// A changed verdict goes through match and decide again, with these limits:
// - nothing is read again while proposals wait: the report would no longer describe them;
// - mail the user decided is not read again, and mail the user undid, unlinked or corrected
//   only gets its stored guess updated and stays in review;
// - a mail that already changed a card is never applied again, it only moves to review;
// - a mail someone handled while Claude was being asked is left as it is.
export async function reclassifyMail(
  options: { ai?: AiClassifier | null; now?: Date } = {},
): Promise<Applied & { checked: number; changed: number; aiCalls: number }> {
  const now = options.now ?? new Date();
  const counters = {
    checked: 0,
    changed: 0,
    applied: 0,
    attached: 0,
    created: 0,
    review: 0,
    ignored: 0,
    aiCalls: 0,
  };
  if (await db.mailMessage.count({ where: { state: "proposed" } }))
    throw new Error(
      "Proposals are waiting. Apply or discard them first, or run npm run mail:backfill again to redo the dry run with the current settings.",
    );
  const { ask, seen } = watched(
    options.ai === undefined ? aiClassifier() : options.ai,
  );
  const rows = await db.mailMessage.findMany({
    where: {
      decidedBy: { not: "user" },
      OR: [{ decidedBy: "none" }, { state: "needs_review" }],
    },
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  if (!rows.length) return counters;
  await leased(async (lease) => {
    const ctx = await context(now);
    for (const { id } of rows) {
      if (!(await lease.renew())) break;
      const row = await db.mailMessage.findUnique({ where: { id } });
      if (!row || row.decidedBy === "user" || row.state === "proposed")
        continue;
      counters.checked++;
      const mail = toMail(row);
      const before = toClassification(row);
      const after = await classify(mail, ask, {
        secondOpinion: secondOpinion(),
      });
      if (sameVerdict(before, after)) continue;
      // Claude may have taken half a minute: act only if nobody touched the row since.
      // MailMessage has no updated-at column, so every field a person or a check can
      // change stands in for one.
      const expect = {
        state: row.state,
        applicationId: row.applicationId,
        decidedBy: row.decidedBy,
        correctedFrom: row.correctedFrom,
        category: row.category,
        confidence: row.confidence,
        matchReason: row.matchReason,
      };
      const read = `Read again as ${after.category.replace("_", " ")}`;
      const keep = (reason: string) =>
        db.mailMessage.updateMany({
          where: { id, ...expect },
          data: {
            ...verdictFields(after),
            state: "needs_review",
            matchReason: reason,
          },
        });
      if (row.state !== "needs_review") {
        const saved = await keep(
          `${read} instead of ${before.category.replace("_", " ")}. The card was not changed again.`,
        );
        if (!saved.count) continue;
        counters.review++;
      } else if (row.correctedFrom) {
        const saved = await keep(
          `${read}. You corrected this email before, so it stays in review.`,
        );
        if (!saved.count) continue;
        counters.review++;
      } else {
        const outcome = await settle(mail, after, id, ctx, {
          ai: ask,
          expect,
        });
        if (!outcome) continue;
        count(counters, outcome.decision);
      }
      counters.changed++;
    }
    if (seen.attempts > seen.silent)
      await db.mailSync.updateMany({
        where: { id: syncId(), lastError: aiSilent },
        data: { lastError: null },
      });
  });
  counters.aiCalls = seen.attempts;
  return counters;
}

// Review list action. `applicationId: "new"` creates a card from the email, null files the
// mail without an application. The reviewer's word counts as a confident verdict; where the
// card's state still forbids a move (never submitted, withdrawn) the mail is only linked.
export async function resolveReview(
  mailMessageId: string,
  input: { category: MailCategory; applicationId: string | "new" | null },
): Promise<void> {
  const ctx = { now: new Date(), owner: await ownerNames() };
  await serializable(async (tx) => {
    const row = await tx.mailMessage.findUnique({
      where: { id: mailMessageId },
    });
    if (!row) throw new Error("This email is no longer stored.");
    if (row.state !== "needs_review")
      throw new Error("This email is not waiting for review.");
    const mail = toMail(row);
    // The interview this mail offers goes to the card the person chooses for the mail.
    const offered = interviewIn(row.proposal) ?? parseInterviewMail(mail);
    const addTo = (applicationId: string | null) =>
      offered && applicationId
        ? upsertInterviewFromMail(
            {
              applicationId,
              mailId: row.id,
              parsed: offered,
              receivedAt: row.receivedAt,
            },
            tx,
          )
        : null;
    const changed = input.category !== row.category;
    const details = changed
      ? extractDetails(mail, input.category, ctx.now)
      : toClassification(row);
    const classification: Classification = {
      ...toClassification(row),
      category: input.category,
      confidence: "high",
      decidedBy: "user",
      // A person stands in for both readers.
      agreed: true,
      nextStep: details.nextStep,
      deadline: details.deadline,
    };
    const base = {
      rowId: row.id,
      mail,
      classification,
      // Kept so that the back-test can count what the automatic verdict got wrong.
      correctedFrom: row.correctedFrom ?? (changed ? row.category : null),
    };
    if (
      input.applicationId === null ||
      input.category === "notice" ||
      input.category === "unrelated"
    ) {
      await write(tx, {
        ...base,
        match: { kind: "none", reason: "no application chosen" },
        decision: { action: "ignore", reason: "Filed by you, no application" },
        company: null,
        card: null,
      });
      return;
    }
    if (input.applicationId === "new") {
      const match: MatchResult = {
        kind: "none",
        reason: "new card, your choice",
      };
      // decide() only starts a card on its own for a hiring-system sender or a stated role.
      // Here a person asked for the card, so the missing role does not stand in the way.
      const made = verdict(
        mail,
        { ...classification, role: roleTitle(classification) },
        match,
        null,
        ctx,
      );
      if (made.decision.action !== "create")
        throw new Error(
          made.decision.action === "review"
            ? "No company name could be read from this email. Add the application by hand, then link the email to it."
            : "This email cannot start a card.",
        );
      // Also when this mail's thread made a card before: that card is not the one meant.
      const saved = await write(tx, {
        ...base,
        match,
        ...made,
        card: null,
        separate: true,
      });
      await addTo(saved.applicationId);
      return;
    }
    const card = await tx.application.findUnique({
      where: { id: input.applicationId },
    });
    if (!card) throw new Error("That application no longer exists.");
    const match: MatchResult = {
      kind: "unique",
      applicationId: card.id,
      reason: "your choice",
      corroborated: true,
    };
    let decision = decide({ mail, classification, match, card, now: ctx.now });
    if (decision.action === "review" && card.status === "rejected") {
      // Good news after a rejection is held back for exactly this confirmation.
      decision = decide({
        mail,
        classification,
        match,
        card: { ...card, status: "submitted" },
        now: ctx.now,
      });
      if (decision.action === "update")
        decision = { ...decision, reason: "Reopened by you after a rejection" };
    }
    decision = ordered(decision, mail, card, true);
    if (decision.action !== "update" && decision.action !== "attach")
      decision = {
        action: "attach",
        reason: `Linked by you, card left as it is (${sentence(decision.reason)})`,
      };
    await write(tx, { ...base, match, decision, company: null, card });
    await addTo(card.id);
  });
}

// "Add as interview" in the review list: a person's decision, so the mail need not be
// matched to the card or confirmed by its sender. The mail itself stays where it is.
export async function addInterview(
  mailMessageId: string,
  applicationId: string,
): Promise<{ interviewId: string; created: boolean }> {
  return serializable(async (tx) => {
    const row = await tx.mailMessage.findUnique({
      where: { id: mailMessageId },
    });
    if (!row) throw new Error("This email is no longer stored.");
    if (row.state === "proposed")
      throw new Error(
        "This email is part of a backfill report. Apply or discard the report first.",
      );
    const card = await tx.application.findUnique({
      where: { id: applicationId },
      select: { id: true },
    });
    if (!card) throw new Error("That application no longer exists.");
    const offered = interviewIn(row.proposal);
    const parsed = offered ?? parseInterviewMail(toMail(row));
    if (!parsed)
      throw new Error(
        "No interview time or event link could be read from this email.",
      );
    const done = await upsertInterviewFromMail(
      {
        applicationId,
        mailId: row.id,
        parsed,
        receivedAt: row.receivedAt,
      },
      tx,
    );
    if (!done)
      throw new Error(
        "This email states neither a time nor an event link for the interview.",
      );
    if (offered)
      await tx.mailMessage.update({
        where: { id: row.id },
        data: { proposal: Prisma.DbNull },
      });
    return done;
  });
}

export async function ignoreMail(mailMessageId: string): Promise<void> {
  const row = await db.mailMessage.findUnique({
    where: { id: mailMessageId },
    select: { category: true, correctedFrom: true },
  });
  if (!row) throw new Error("This email is no longer stored.");
  const passive = row.category === "notice" || row.category === "unrelated";
  const filed = await db.mailMessage.updateMany({
    where: { id: mailMessageId, state: "needs_review" },
    data: {
      state: "ignored",
      applicationId: null,
      category: passive ? row.category : "unrelated",
      confidence: "high",
      decidedBy: "user",
      correctedFrom: row.correctedFrom ?? (passive ? null : row.category),
      matchReason: "Marked as not relevant by you.",
    },
  });
  if (!filed.count) throw new Error("This email is not waiting for review.");
}

// Restores the card to ApplicationEvent.previous and returns the mail to needs_review.
// Only the latest change on a card can be undone, so nothing made after it is overwritten.
// Undoing the mail that created a card deletes the card with its job, and is refused when
// the card has gathered anything since: other mail, later events, notes or documents.
export async function undoMail(mailMessageId: string): Promise<void> {
  await serializable(async (tx) => {
    const row = await tx.mailMessage.findUnique({
      where: { id: mailMessageId },
      select: {
        id: true,
        state: true,
        applicationId: true,
        category: true,
        correctedFrom: true,
      },
    });
    if (!row) throw new Error("This email is no longer stored.");
    const applicationId = row.applicationId;
    if (row.state !== "applied" || !applicationId)
      throw new Error("Only a change made from an email can be undone.");
    const events = changes(
      await tx.applicationEvent.findMany({
        where: { applicationId },
        orderBy: [{ at: "desc" }, { id: "desc" }],
      }),
    );
    const event = events.find((item) => item.mailMessageId === row.id);
    const previous = (event?.previous ?? null) as Previous | null;
    const linked = await tx.mailMessage.aggregate({
      where: { applicationId, id: { not: row.id } },
      _max: { receivedAt: true },
      _count: true,
    });
    const application = await tx.application.findUniqueOrThrow({
      where: { id: applicationId },
      include: {
        job: { include: { _count: { select: { documents: true } } } },
        interviews: {
          where: { status: "scheduled" },
          select: { startsAt: true, timezone: true },
        },
        _count: { select: { interviews: true } },
      },
    });
    if (event && !previous) {
      // Deleting the card would delete its interviews with it.
      if (
        application.origin !== "email" ||
        linked._count ||
        events.length > 1 ||
        application._count.interviews ||
        application.notes.trim() ||
        application.job._count.documents
      )
        throw new Error(occupied);
    } else if (!event || events[0].id !== event.id)
      throw new Error(
        "The card was changed after this email. Correct the card by hand.",
      );
    await tx.applicationEvent.delete({ where: { id: event.id } });
    await tx.mailMessage.update({
      where: { id: row.id },
      data: {
        state: "needs_review",
        applicationId: null,
        correctedFrom: row.correctedFrom ?? row.category,
        matchReason: "You undid the change this email made.",
      },
    });
    if (!previous) {
      await tx.application.delete({ where: { id: applicationId } });
      await tx.listing.deleteMany({ where: { jobId: application.jobId } });
      await tx.job.delete({ where: { id: application.jobId } });
      return;
    }
    // A next step an interview set after this mail is the interview's, and stays.
    const byInterview = application.interviews.some(
      (item) =>
        item.startsAt &&
        application.nextStep ===
          interviewStepText(item.startsAt, item.timezone),
    );
    await tx.application.update({
      where: { id: applicationId },
      data: {
        status: previous.status,
        submittedAt: day(previous.submittedAt),
        ...(byInterview
          ? {}
          : {
              nextStep: previous.nextStep,
              nextStepDueAt: day(previous.nextStepDueAt),
            }),
        lastMailAt: linked._max.receivedAt,
        ...("evidence" in previous ? { evidence: previous.evidence } : {}),
      },
    });
  });
}

// Detaches a mail that was linked to a card without changing it and returns it to
// needs_review. The card no longer counts this mail, or its thread through it, as its own.
export async function unlinkMail(mailMessageId: string): Promise<void> {
  await serializable(async (tx) => {
    const row = await tx.mailMessage.findUnique({
      where: { id: mailMessageId },
      select: {
        id: true,
        state: true,
        applicationId: true,
        category: true,
        correctedFrom: true,
      },
    });
    if (!row) throw new Error("This email is no longer stored.");
    const applicationId = row.applicationId;
    if (row.state !== "attached" || !applicationId)
      throw new Error(
        "Only an email that is linked to a card without changing it can be unlinked.",
      );
    await tx.mailMessage.update({
      where: { id: row.id },
      data: {
        state: "needs_review",
        applicationId: null,
        // Marks the mail as handled by a person, so that nothing links it again on its own.
        correctedFrom: row.correctedFrom ?? row.category,
        matchReason: "You unlinked this email from its card.",
      },
    });
    const linked = await tx.mailMessage.aggregate({
      where: { applicationId },
      _max: { receivedAt: true },
    });
    await tx.application.update({
      where: { id: applicationId },
      data: { lastMailAt: linked._max.receivedAt },
    });
  });
}

export async function completeNextStep(applicationId: string): Promise<void> {
  const done = await db.application.updateMany({
    where: { id: applicationId },
    data: { nextStep: null, nextStepDueAt: null },
  });
  if (!done.count) throw new Error("That application no longer exists.");
}

// Everything the dashboard needs.
export async function mailOverview(): Promise<{
  connection: {
    connected: boolean;
    email: string | null;
    lastCheckedAt: Date | null;
    lastSuccessAt: Date | null;
    lastError: string | null;
    // Scheduled checks may change cards. False until a history import has been applied.
    live: boolean;
    // Dry-run proposals not applied yet. Scheduled checks wait while this is above zero.
    pendingProposals: number;
  };
  review: Array<{
    id: string;
    subject: string;
    fromName: string;
    fromAddress: string;
    receivedAt: Date;
    category: MailCategory;
    confidence: Confidence;
    evidenceQuote: string | null;
    company: string | null;
    role: string | null;
    reason: string;
    threadId: string;
    candidates: Array<{
      applicationId: string;
      company: string;
      title: string;
      status: string;
    }>;
    // The interview this mail confirms, offered for "Add as interview" (addInterview):
    // read from it, but not added because no single card could be named without a person.
    interview: ParsedInterview | null;
  }>;
  actions: Array<{
    applicationId: string;
    jobId: string;
    company: string;
    title: string;
    status: string;
    nextStep: string;
    nextStepDueAt: Date | null;
  }>;
}> {
  const [token, sync, live, pendingProposals, rows, cards, open] =
    await Promise.all([
      readToken(),
      db.mailSync.findUnique({ where: { id: syncId() } }),
      mailLive(),
      db.mailMessage.count({ where: { state: "proposed" } }),
      db.mailMessage.findMany({
        where: { state: "needs_review" },
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
        omit: { bodyText: true },
      }),
      loadBoard(),
      db.application.findMany({
        where: { nextStep: { not: null }, status: { notIn: closed } },
        include: { job: { select: { company: true, title: true } } },
      }),
    ]);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const far = Number.MAX_SAFE_INTEGER;
  const lost = ledgerOf(sync?.lastCounts).givenUp.length;
  // Mail waiting since before interviews were read from mail is read from its stored body.
  // A mail whose interview exists already offers nothing.
  const sourced = new Set(
    (
      await db.interview.findMany({
        where: { sourceMailId: { in: rows.map((row) => row.id) } },
        select: { sourceMailId: true },
      })
    ).map((item) => item.sourceMailId),
  );
  const unread = rows.filter(
    (row) => !sourced.has(row.id) && interviewIn(row.proposal) === undefined,
  );
  const bodies = new Map(
    (unread.length
      ? await db.mailMessage.findMany({
          where: { id: { in: unread.map((row) => row.id) } },
          select: { id: true, bodyText: true },
        })
      : []
    ).map((row) => [row.id, row.bodyText]),
  );
  const offer = (row: (typeof rows)[number]) => {
    if (sourced.has(row.id)) return null;
    const kept = interviewIn(row.proposal);
    return kept !== undefined
      ? kept
      : parseInterviewMail({
          ...toMail(row),
          bodyText: bodies.get(row.id) ?? "",
        });
  };
  return {
    connection: {
      connected: Boolean(token),
      email: token?.email ?? sync?.email ?? null,
      lastCheckedAt: sync?.lastCheckedAt ?? null,
      lastSuccessAt: sync?.lastSuccessAt ?? null,
      // Messages given up on are named for as long as they are on the list.
      lastError:
        [
          sync?.lastError,
          lost
            ? `${plural(lost)} could not be read after ${giveUpAfter} tries. Run npm run mail:sync -- --retry to try again.`
            : null,
        ]
          .filter(Boolean)
          .join(" ") || null,
      live,
      pendingProposals,
    },
    review: rows.map((row) => {
      // Matched again on every read, so the reviewer sees the cards as they are now.
      const match = matchMail(toMail(row), toClassification(row), cards);
      const ids =
        match.kind === "unique"
          ? [match.applicationId]
          : match.kind === "ambiguous"
            ? match.candidateIds
            : [];
      return {
        id: row.id,
        subject: row.subject,
        fromName: row.fromName,
        fromAddress: row.fromAddress,
        receivedAt: row.receivedAt,
        category: row.category as MailCategory,
        confidence: row.confidence as Confidence,
        evidenceQuote: row.evidenceQuote,
        company: row.company,
        role: row.role,
        reason: row.matchReason,
        threadId: row.threadId,
        interview: offer(row),
        candidates: ids.flatMap((id) => {
          const card = byId.get(id);
          return card
            ? [
                {
                  applicationId: card.id,
                  company: card.company,
                  title: card.title,
                  status: card.status,
                },
              ]
            : [];
        }),
      };
    }),
    actions: open
      .flatMap((item) =>
        item.nextStep?.trim()
          ? [
              {
                applicationId: item.id,
                jobId: item.jobId,
                company: item.job.company,
                title: item.job.title,
                status: item.status,
                nextStep: item.nextStep,
                nextStepDueAt: item.nextStepDueAt,
              },
            ]
          : [],
      )
      .sort(
        (a, b) =>
          (a.nextStepDueAt?.valueOf() ?? far) -
            (b.nextStepDueAt?.valueOf() ?? far) ||
          a.company.localeCompare(b.company),
      ),
  };
}

// Mail timeline for one application, newest first, without bodies. `undoable` and
// `unlinkable` say what undoMail and unlinkMail will accept for the row.
export async function mailForApplication(applicationId: string): Promise<
  Array<{
    id: string;
    subject: string;
    fromName: string;
    fromAddress: string;
    receivedAt: Date;
    category: MailCategory;
    state: MailState;
    evidenceQuote: string | null;
    threadId: string;
    undoable: boolean;
    unlinkable: boolean;
  }>
> {
  const [rows, events, application] = await Promise.all([
    db.mailMessage.findMany({
      where: { applicationId },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        subject: true,
        fromName: true,
        fromAddress: true,
        receivedAt: true,
        category: true,
        state: true,
        evidenceQuote: true,
        threadId: true,
      },
    }),
    db.applicationEvent
      .findMany({
        where: { applicationId },
        orderBy: [{ at: "desc" }, { id: "desc" }],
        select: { mailMessageId: true, previous: true, status: true },
      })
      .then(changes),
    db.application.findUnique({
      where: { id: applicationId },
      select: {
        origin: true,
        notes: true,
        job: { select: { _count: { select: { documents: true } } } },
        _count: { select: { interviews: true } },
      },
    }),
  ]);
  // The mail that created the card can be undone only while the card holds nothing else
  // (undoMail's rules: no other mail, change, interview, note or document).
  const pristine =
    application?.origin === "email" &&
    rows.length === 1 &&
    events.length === 1 &&
    !application._count.interviews &&
    !application.notes.trim() &&
    !application.job._count.documents;
  return rows.map((row) => ({
    ...row,
    category: row.category as MailCategory,
    state: row.state as MailState,
    undoable:
      row.state === "applied" &&
      events[0]?.mailMessageId === row.id &&
      (events[0].previous !== null || pristine),
    unlinkable: row.state === "attached",
  }));
}

// Prep runs left "running" by a worker that stopped are queued again. A run can take well over
// half an hour (two Claude calls with search pauses), so only those untouched for longer than
// `olderThanMs` (90 minutes) count. `only` limits the search (tests). Returns how many were queued.
export async function requeueStalePrep(
  options: { now?: Date; olderThanMs?: number; only?: string[] } = {},
): Promise<number> {
  const before = new Date(
    (options.now ?? new Date()).valueOf() -
      (options.olderThanMs ?? 90 * 60_000),
  );
  const requeued = await db.interview.updateMany({
    where: {
      prepStatus: "running",
      updatedAt: { lt: before },
      ...(options.only ? { id: { in: options.only } } : {}),
    },
    data: { prepStatus: "queued", prepError: null },
  });
  return requeued.count;
}

class DryRunRollback extends Error {}
// Interviews from mail that was stored before interviews were read from mail: every stored
// mail linked to a card, oldest first, read from its stored body (the calendar part was not
// kept). Safe to run again: an interview is found again by its mail. Waits for no check: it
// refuses while one holds the lease. `dryRun` writes nothing: the same work runs in a
// transaction that is rolled back, so what it reports is exactly what a real run would do.
// `only` limits it to these mail ids (tests).
export async function interviewsFromStoredMail(
  options: { dryRun?: boolean; only?: string[] } = {},
): Promise<{
  read: number;
  added: number;
  updated: number;
  interviews: Array<{
    mailId: string;
    interviewId: string;
    created: boolean;
    company: string;
    title: string;
    startsAt: Date | null;
    timezone: string | null;
    provider: string;
    subject: string;
  }>;
}> {
  const rows = await db.mailMessage.findMany({
    where: {
      applicationId: { not: null },
      ...(options.only ? { id: { in: options.only } } : {}),
    },
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    include: {
      application: {
        select: { job: { select: { company: true, title: true } } },
      },
    },
  });
  const found = rows.flatMap((row) => {
    const parsed = parseInterviewMail(toMail(row));
    return parsed && row.applicationId ? [{ row, parsed }] : [];
  });
  const result = {
    read: rows.length,
    added: 0,
    updated: 0,
    interviews: [] as Awaited<
      ReturnType<typeof interviewsFromStoredMail>
    >["interviews"],
  };
  const run = async (tx?: Tx) => {
    for (const { row, parsed } of found) {
      const done = await upsertInterviewFromMail(
        {
          applicationId: row.applicationId!,
          mailId: row.id,
          parsed,
          receivedAt: row.receivedAt,
        },
        tx,
      );
      if (!done) continue;
      result[done.created ? "added" : "updated"]++;
      result.interviews.push({
        mailId: row.id,
        ...done,
        company: row.application?.job.company ?? "",
        title: row.application?.job.title ?? "",
        startsAt: parsed.startsAt,
        timezone: parsed.timezone,
        provider: parsed.provider,
        subject: row.subject,
      });
    }
  };
  if (!options.dryRun) {
    await leased(() => run());
    return result;
  }
  const sync = await db.mailSync.findUnique({ where: { id: syncId() } });
  if (sync?.leaseUntil && sync.leaseUntil > new Date()) throw new Error(busy);
  await db
    .$transaction(
      async (tx) => {
        await run(tx);
        throw new DryRunRollback();
      },
      { timeout: 10 * 60_000, maxWait: 30_000 },
    )
    .catch((error) => {
      if (!(error instanceof DryRunRollback)) throw error;
    });
  return result;
}
