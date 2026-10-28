import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { aiClassifier } from "../mail/ai";
import { mailLive, mentionsHiring, processMessage } from "../mail/store";
import type { AiClassifier, RawMail } from "../mail/types";
import { linkedinTokenPath, readLinkedinToken } from "./auth";
import { companyOfSender, keysMatch, refreshConnections } from "./connections";
import { linkedinDataClient, type LinkedinDataClient } from "./data";
import { fromChangelog, fromSnapshot, withinWindow } from "./messages";

const hour = 3600_000;
const day = 24 * hour;
const firstWindow = 30 * day;
const leaseMs = 10 * 60_000;
const realId = "linkedin";

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
export type LinkedinSkip = "mail-not-live" | "not-connected" | "busy";

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

// A lease that is extended once a minute while a long first run works through its messages,
// and only while this run still holds it.
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
    scheduled?: boolean;
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
  // LinkedIn messages change cards through the same rules as mail, so scheduled checks wait
  // for the same switch.
  if (options.scheduled && !(await mailLive()))
    return { ...counts, skipped: "mail-not-live" };
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
  const sync = await db.linkedinSync.findUniqueOrThrow({ where: { id } });
  try {
    const client =
      options.client ?? linkedinDataClient({ token: token!.accessToken });
    const since = sync.lastSuccessAt
      ? new Date(sync.lastSuccessAt.valueOf() - hour)
      : new Date(now.valueOf() - firstWindow);
    const snapshotDue =
      !sync.lastSnapshotAt ||
      now.valueOf() - sync.lastSnapshotAt.valueOf() > day;
    const me = options.me ?? (await memberName());
    const myName = nameParts(me);
    const isMe = (name: string) => !!myName && nameParts(name) === myName;
    const mails = new Map<string, RawMail>();
    const keep = (mail: RawMail | null) => {
      if (
        mail &&
        !isMe(mail.fromName) &&
        withinWindow(mail, since) &&
        !mails.has(mail.gmailId)
      )
        mails.set(mail.gmailId, mail);
    };
    let snapshotRead = false;
    if (snapshotDue) {
      const people = await client.snapshot("CONNECTIONS");
      if (people) counts.connections = await refreshConnections(people);
      const inbox = await client.snapshot("INBOX");
      if (inbox) {
        snapshotRead = true;
        for (const row of inbox) keep(fromSnapshot(row, me));
      }
    }
    for (const event of await client.changes(since))
      keep(fromChangelog(event, me));
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
    for (const mail of ordered) {
      if (!(await held.renew()))
        throw new Error("Another LinkedIn check took over.");
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
      } catch {
        counts.failed++;
      }
    }
    await held.release({
      lastSuccessAt: now,
      lastError: null,
      lastCounts: counts,
      nextRunAt: new Date(now.valueOf() + hour),
      ...(snapshotRead || counts.connections !== null
        ? { lastSnapshotAt: now }
        : {}),
    });
    return { ...counts, skipped: null };
  } catch (error) {
    await held.release({
      lastError:
        error instanceof Error ? error.message : "LinkedIn check failed",
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
    lastCounts: (sync?.lastCounts as LinkedinCounts | null) ?? null,
    connections: await db.linkedinConnection.count(),
  };
}

// For the worker's tick: connected, the next run has come, and no check holds the lease.
export async function linkedinDue(now = new Date()): Promise<boolean> {
  if (!(await readLinkedinToken(linkedinTokenPath("data")))) return false;
  const sync = await db.linkedinSync.findUnique({ where: { id: realId } });
  return (
    !sync ||
    (sync.nextRunAt <= now && (!sync.leaseUntil || sync.leaseUntil < now))
  );
}
