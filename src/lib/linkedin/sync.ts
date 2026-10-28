import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { aiClassifier } from "../mail/ai";
import { mailLive, mentionsHiring, processMessage } from "../mail/store";
import type { AiClassifier, RawMail } from "../mail/types";
import { linkedinTokenPath, readLinkedinToken } from "./auth";
import { companyOfSender, keysMatch, refreshConnections } from "./connections";
import {
  linkedinDataClient,
  type LinkedinDataClient,
  type Snapshot,
} from "./data";
import { fromChangelog, fromSnapshot, withinWindow } from "./messages";

const hour = 3600_000;
const day = 24 * hour;
const firstWindow = 30 * day;
// The changelog keeps 28 days, so the inbox snapshot is only needed once the last success is
// older than this, before it was ever read, or while a failed message is retried.
const inboxAfter = 20 * day;
const leaseMs = 10 * 60_000;
const realId = "linkedin";
const giveUpAfter = 5;
const givenUpLimit = 200;

export type LinkedinCounts = {
  connections: number | null; // null: the connections snapshot was not due or not ready
  read: number; // messages in the window, after own messages were dropped
  candidates: number; // messages that went through the mail pipeline
  applied: number;
  attached: number;
  review: number;
  ignored: number; // not about an application, or already stored
  failed: number;
};
export type LinkedinSkip =
  "mail-not-live" | "pending-proposals" | "not-connected" | "busy";

// What LinkedinSync.lastCounts carries from check to check, next to the last check's counters.
type Ledger = {
  attempts: Record<string, number>; // failed checks per message id that is still retried
  givenUp: string[]; // message ids that failed in five checks
  retryFrom: string | null; // the oldest retried message: the changelog is read from there
  inboxReadAt: string | null; // when the INBOX snapshot was last read
};

function ledgerOf(lastCounts: unknown): Ledger {
  const stored = (lastCounts ?? {}) as Record<string, unknown>;
  const attempts: Record<string, number> = {};
  if (stored.attempts && typeof stored.attempts === "object")
    for (const [id, tries] of Object.entries(stored.attempts))
      if (typeof tries === "number") attempts[id] = tries;
  const time = (value: unknown) =>
    typeof value === "string" && !Number.isNaN(Date.parse(value))
      ? value
      : null;
  return {
    attempts,
    givenUp: Array.isArray(stored.givenUp)
      ? stored.givenUp.filter((id) => typeof id === "string")
      : [],
    retryFrom: time(stored.retryFrom),
    inboxReadAt: time(stored.inboxReadAt),
  };
}

const plural = (count: number) =>
  `${count} LinkedIn message${count === 1 ? "" : "s"}`;

class LeaseLost extends Error {
  name = "LeaseLost";
  constructor() {
    super("Another LinkedIn check took over.");
  }
}

const failure = (error: unknown) =>
  error instanceof Error ? error.message : "LinkedIn check failed";

const nameParts = (name: string) =>
  name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .sort()
    .join(" ");

// contact.json stores the name surname first ("Ogbonna Arinze"), LinkedIn shows it the other
// way round, so the member's own messages are recognised in any word order.
async function memberName(): Promise<string> {
  try {
    const contact = JSON.parse(
      await readFile(join(process.cwd(), "cv", "contact.json"), "utf8"),
    );
    return String(contact?.name ?? "");
  } catch {
    return "";
  }
}

// A lease that is extended at most once a minute while a long first run reads its snapshots
// and changelog and works through its messages, and only while this run still holds it.
function keeper(id: string, claimed: Date) {
  let held = claimed;
  return {
    async renew(): Promise<boolean> {
      if (held.valueOf() - leaseMs + 60_000 > Date.now()) return true;
      const next = new Date(Date.now() + leaseMs);
      const swapped = await db.linkedinSync.updateMany({
        where: { id, leaseUntil: held },
        data: { leaseUntil: next },
      });
      if (!swapped.count) return false;
      held = next;
      return true;
    },
    // Writes the outcome and frees the lease, unless another run has taken it over.
    async release(data: Prisma.LinkedinSyncUpdateManyMutationInput) {
      await db.linkedinSync.updateMany({
        where: { id, leaseUntil: held },
        data: { ...data, leaseUntil: null },
      });
    },
  };
}

// One check: connections first (so senders' companies resolve), then messages oldest first
// through the mail pipeline. Only messages that can be about an application are stored.
export async function syncLinkedin(
  options: {
    client?: LinkedinDataClient;
    ai?: AiClassifier | null; // undefined: the Claude classifier when a key is set
    now?: Date;
    syncId?: string; // tests use their own row
    scheduled?: boolean; // the worker's run; manual runs wait for the same switch too
    me?: string; // the member's name; read from cv/contact.json when not given
  } = {},
): Promise<LinkedinCounts & { skipped: LinkedinSkip | null }> {
  const id = options.syncId ?? realId;
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
  // LinkedIn messages change cards through the same rules as mail, so every check, scheduled
  // or by hand, waits for the same switch and for a dry run's proposals (as syncMail does).
  // The next run moves an hour ahead, so linkedinDue is not true at every tick meanwhile; the
  // lease is not taken, and a row that does not exist yet is not created.
  const later = async (skipped: LinkedinSkip) => {
    await db.linkedinSync.updateMany({
      where: { id },
      data: { nextRunAt: new Date(now.valueOf() + hour) },
    });
    return { ...counts, skipped };
  };
  if (!(await mailLive())) return later("mail-not-live");
  if (await db.mailMessage.count({ where: { state: "proposed" } }))
    return later("pending-proposals");
  const token = options.client
    ? null
    : await readLinkedinToken(linkedinTokenPath("data"));
  if (!options.client && !token) return { ...counts, skipped: "not-connected" };
  await db.linkedinSync.upsert({ where: { id }, create: { id }, update: {} });
  const claimed = new Date(Date.now() + leaseMs);
  const lease = await db.linkedinSync.updateMany({
    where: {
      id,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
    },
    data: { leaseUntil: claimed, lastCheckedAt: now },
  });
  if (!lease.count) return { ...counts, skipped: "busy" };
  const held = keeper(id, claimed);
  // Called after every snapshot and changelog page (onPage), between connection writes and
  // before each message: each can take minutes on a first run. Throws once the lease is lost.
  const stillHeld = async () => {
    if (!(await held.renew())) throw new LeaseLost();
  };
  const pages = { onPage: stillHeld };
  const sync = await db.linkedinSync.findUniqueOrThrow({ where: { id } });
  try {
    const client =
      options.client ?? linkedinDataClient({ token: token!.accessToken });
    const since = sync.lastSuccessAt
      ? new Date(sync.lastSuccessAt.valueOf() - hour)
      : new Date(now.valueOf() - firstWindow);
    const ledger = ledgerOf(sync.lastCounts);
    // Failed messages are retried from either source, whatever their age.
    const retrying = new Set(Object.keys(ledger.attempts));
    const changesSince =
      retrying.size && ledger.retryFrom
        ? new Date(
            Math.min(since.valueOf(), Date.parse(ledger.retryFrom) - hour),
          )
        : since;
    // CONNECTIONS daily; lastSnapshotAt is when they were last read.
    const connectionsDue =
      !sync.lastSnapshotAt ||
      now.valueOf() - sync.lastSnapshotAt.valueOf() > day;
    // INBOX before it was ever read, when the last success is too old for the changelog, and
    // while a failed message is retried (a message only the snapshot has is seen again).
    const inboxDue =
      retrying.size > 0 ||
      !ledger.inboxReadAt ||
      !sync.lastSuccessAt ||
      now.valueOf() - sync.lastSuccessAt.valueOf() > inboxAfter;
    const me = options.me ?? (await memberName());
    const myName = nameParts(me);
    const isMe = (name: string) => !!myName && nameParts(name) === myName;
    const mails = new Map<string, RawMail>();
    const keep = (mail: RawMail | null) => {
      if (
        mail &&
        !isMe(mail.fromName) &&
        (withinWindow(mail, since) || retrying.has(mail.gmailId)) &&
        !mails.has(mail.gmailId)
      )
        mails.set(mail.gmailId, mail);
    };
    // Each snapshot counts as taken once it was read; one that is not ready yet is asked for
    // again at the next hourly check.
    let connectionsRead = false;
    let connectionsError: string | null = null;
    if (connectionsDue) {
      // A failed connections refresh is recorded but does not stop the message check.
      let people: Snapshot | null = null;
      try {
        people = await client.snapshot("CONNECTIONS", pages);
      } catch (error) {
        if (error instanceof LeaseLost) throw error;
        connectionsError = failure(error);
      }
      await stillHeld();
      if (people)
        try {
          // A snapshot cut short still adds and updates connections, but removes none.
          counts.connections = await refreshConnections(
            people.rows,
            people.complete,
          );
          connectionsRead = true;
        } catch (error) {
          connectionsError = failure(error);
        }
    }
    let inboxRead = false;
    if (inboxDue) {
      await stillHeld();
      const inbox = await client.snapshot("INBOX", pages);
      await stillHeld();
      if (inbox) {
        inboxRead = true;
        for (const row of inbox.rows) keep(fromSnapshot(row));
      }
    }
    await stillHeld();
    for (const event of await client.changes(changesSince, pages))
      keep(fromChangelog(event));
    await stillHeld();
    counts.read = mails.size;

    const companies = [
      ...new Set(
        (
          await db.application.findMany({
            select: { job: { select: { company: true } } },
          })
        ).map((item) => item.job.company),
      ),
    ];
    const linkedThreads = new Set(
      (
        await db.mailMessage.findMany({
          where: {
            threadId: { startsWith: "linkedin:" },
            applicationId: { not: null },
          },
          select: { threadId: true },
        })
      ).map((item) => item.threadId),
    );
    const ai = options.ai === undefined ? aiClassifier() : options.ai;
    const ordered = [...mails.values()].sort(
      (x, y) => x.receivedAt.valueOf() - y.receivedAt.valueOf(),
    );
    // Messages processed (stored, ignored or already stored) and those that threw.
    const done = new Set<string>();
    const failed = new Map<string, Date>();
    for (const mail of ordered) {
      await stillHeld();
      try {
        // 229 of 2,459 real messages carry no profile URL: the name is looked up instead.
        const company = await companyOfSender(mail.fromAddress, mail.fromName);
        if (company) mail.senderCompany = company;
        const candidate =
          linkedThreads.has(mail.threadId) ||
          (!!company && companies.some((name) => keysMatch(name, company))) ||
          mentionsHiring(`${mail.subject}\n${mail.bodyText}`);
        if (!candidate) {
          counts.ignored++;
          done.add(mail.gmailId);
          continue;
        }
        counts.candidates++;
        const { decision } = await processMessage(mail, {
          ai,
          dryRun: false,
          now,
        });
        if (decision.action === "update") counts.applied++;
        else if (decision.action === "attach") counts.attached++;
        else if (decision.action === "review" || decision.action === "create")
          counts.review++;
        else counts.ignored++;
        if (decision.action === "update" || decision.action === "attach")
          linkedThreads.add(mail.threadId);
        done.add(mail.gmailId);
      } catch (error) {
        if (error instanceof LeaseLost) throw error;
        counts.failed++;
        failed.set(mail.gmailId, mail.receivedAt);
      }
    }
    // The ledger: a message that failed is retried by the next checks, which read the INBOX
    // again, until it is processed or has failed in five checks. A retried message that an
    // INBOX read did not bring back counts as a failed try too, so a message that is gone does
    // not keep the inbox read every hour. Given-up messages are named until one is processed.
    const givenUp = ledger.givenUp.filter((gmailId) => !done.has(gmailId));
    const wasGivenUp = new Set(givenUp);
    const attempts: Record<string, number> = {};
    const tried = new Set(failed.keys());
    for (const gmailId of retrying)
      if (!done.has(gmailId) && !tried.has(gmailId)) {
        if (inboxRead) tried.add(gmailId);
        else attempts[gmailId] = ledger.attempts[gmailId];
      }
    for (const gmailId of tried) {
      if (wasGivenUp.has(gmailId)) continue;
      const tries = (ledger.attempts[gmailId] ?? 0) + 1;
      if (tries >= giveUpAfter) givenUp.push(gmailId);
      else attempts[gmailId] = tries;
    }
    const kept = givenUp.slice(-givenUpLimit);
    // retryFrom: the oldest retried message, from this check's failures and, while messages
    // this check did not see are still retried, from the ledger.
    const carried = Object.keys(attempts).some(
      (gmailId) => !failed.has(gmailId),
    );
    const oldest = [
      ...[...failed]
        .filter(([gmailId]) => gmailId in attempts)
        .map(([, at]) => at.valueOf()),
      ...(carried && ledger.retryFrom ? [Date.parse(ledger.retryFrom)] : []),
    ];
    const lastError =
      [
        connectionsError &&
          `LinkedIn connections were not refreshed: ${connectionsError}`,
        kept.length &&
          `${plural(kept.length)} could not be processed after ${giveUpAfter} attempts`,
      ]
        .filter(Boolean)
        .join("; ") || null;
    const bookkeeping: Ledger = {
      attempts,
      givenUp: kept,
      retryFrom: oldest.length
        ? new Date(Math.min(...oldest)).toISOString()
        : null,
      inboxReadAt: inboxRead ? now.toISOString() : ledger.inboxReadAt,
    };
    // The check succeeded although messages failed: they are on the ledger instead.
    await held.release({
      lastSuccessAt: now,
      lastError,
      lastCounts: { ...counts, ...bookkeeping },
      nextRunAt: new Date(now.valueOf() + hour),
      ...(connectionsRead ? { lastSnapshotAt: now } : {}),
    });
    return { ...counts, skipped: null };
  } catch (error) {
    await held.release({
      lastError: failure(error),
      nextRunAt: new Date(now.valueOf() + hour),
    });
    throw error;
  }
}

export async function linkedinOverview() {
  const token = await readLinkedinToken(linkedinTokenPath("data"));
  const sync = await db.linkedinSync.findUnique({ where: { id: realId } });
  const expiresAt = token?.expiresAt ? new Date(token.expiresAt) : null;
  return {
    connected: !!token,
    expiresAt,
    // LinkedIn tokens last 60 days and cannot be refreshed without the member.
    expiresSoon: !!expiresAt && expiresAt.valueOf() - Date.now() < 14 * day,
    lastCheckedAt: sync?.lastCheckedAt ?? null,
    lastSuccessAt: sync?.lastSuccessAt ?? null,
    lastError: sync?.lastError ?? null,
    lastCounts: countsOf(sync?.lastCounts),
    connections: await db.linkedinConnection.count(),
  };
}

// The last check's counters, without the ledger kept next to them.
function countsOf(lastCounts: unknown): LinkedinCounts | null {
  if (!lastCounts || typeof lastCounts !== "object") return null;
  const {
    attempts: _attempts,
    givenUp: _givenUp,
    retryFrom: _retryFrom,
    inboxReadAt: _inboxReadAt,
    ...counts
  } = lastCounts as LinkedinCounts & Partial<Ledger>;
  return counts;
}

// For the worker's tick: connected, the next run has come, no check holds the lease, and no
// mail dry run's proposals wait (as the mail trigger). syncLinkedin checks the same itself.
export async function linkedinDue(
  now = new Date(),
  options: { syncId?: string; connected?: boolean } = {}, // tests use their own row
): Promise<boolean> {
  const connected =
    options.connected ?? !!(await readLinkedinToken(linkedinTokenPath("data")));
  if (!connected) return false;
  const sync = await db.linkedinSync.findUnique({
    where: { id: options.syncId ?? realId },
  });
  return (
    (!sync ||
      (sync.nextRunAt <= now && (!sync.leaseUntil || sync.leaseUntil < now))) &&
    !(await db.mailMessage.count({ where: { state: "proposed" } }))
  );
}
