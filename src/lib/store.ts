import { db } from "./db";
import {
  canonicalKey,
  countryCodes,
  defaults,
  eligibilityNote,
  hash,
  IncomingJob,
  matchJob,
  postingNotes,
  settingsSchema,
} from "./domain";
import type { Source } from "@prisma/client";

export async function getSettings() {
  const row = await db.setting.findUnique({ where: { key: "preferences" } });
  const parsed = settingsSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : defaults;
}
export async function upsertJob(source: Source, incoming: IncomingJob) {
  const listing = await db.listing.findUnique({
    where: {
      sourceId_externalId: {
        sourceId: source.id,
        externalId: incoming.externalId,
      },
    },
    include: { job: { select: { canonicalKey: true } } },
  });
  const key =
    listing?.job.canonicalKey ??
    canonicalKey(incoming.applyUrl, `${source.key}:${incoming.externalId}`);
  const existing = await db.job.findUnique({ where: { canonicalKey: key } });
  // A LinkedIn listing that was folded into the employer's own posting only records that it
  // was seen again; the employer's board owns the job's details and its application link.
  if (
    ["linkedin", "linkedin-email"].includes(source.kind) &&
    existing &&
    !/^https:\/\/(?:[a-z]+\.)?linkedin\.com\//.test(existing.applyUrl)
  ) {
    await db.listing.update({
      where: {
        sourceId_externalId: {
          sourceId: source.id,
          externalId: incoming.externalId,
        },
      },
      data: { seenAt: new Date() },
    });
    return { job: existing, added: false };
  }
  // A summary-only arrival (LinkedIn email) never replaces a fuller stored description.
  if (
    incoming.summaryOnly &&
    existing &&
    existing.description.length > incoming.description.length
  )
    incoming = { ...incoming, description: existing.description };
  const contentHash = hash(incoming.description);
  const match = postingNotes(matchJob(incoming.title, incoming.description), {
    company: incoming.company,
    description: incoming.description,
    applyUrl: incoming.applyUrl,
    easyApply: incoming.easyApply,
  });
  const now = new Date();
  const values = {
    title: incoming.title,
    company: incoming.company,
    location: incoming.location,
    countries: incoming.countries ?? countryCodes(incoming.location),
    remote:
      incoming.remote ??
      (/remote|fernarbeit/i.test(incoming.location) &&
        !/no remote|not remote|remote.{0,12}(?:not|nicht)/i.test(
          incoming.location,
        )),
    description: incoming.description,
    applyUrl: incoming.applyUrl,
    salary: incoming.salary ?? null,
    ...match,
    contentHash,
    eligibilityNote: eligibilityNote(incoming.location, incoming.description),
  };
  const job = await db.job.upsert({
    where: { canonicalKey: key },
    create: {
      canonicalKey: key,
      ...values,
      firstSeenAt: incoming.firstSeenAt ?? now,
      lastSeenAt: now,
      publishedAt: incoming.publishedAt,
      checkedAt: incoming.historical ? null : now,
      liveStatus: incoming.historical ? "unverified" : "listed",
    },
    update: incoming.historical
      ? {}
      : {
          ...values,
          lastSeenAt: now,
          checkedAt: now,
          liveStatus: "listed",
          ...(incoming.publishedAt
            ? { publishedAt: incoming.publishedAt }
            : {}),
        },
  });
  await db.listing.upsert({
    where: {
      sourceId_externalId: {
        sourceId: source.id,
        externalId: incoming.externalId,
      },
    },
    create: {
      sourceId: source.id,
      externalId: incoming.externalId,
      jobId: job.id,
      url: incoming.sourceUrl ?? incoming.applyUrl,
    },
    update: {
      seenAt: now,
      jobId: job.id,
      url: incoming.sourceUrl ?? incoming.applyUrl,
    },
  });
  return { job, added: !existing };
}

export async function seedSources() {
  const seeds = [
    {
      key: "archive",
      name: "Your saved jobs",
      kind: "archive",
      enabled: false,
      intervalMinutes: 1440,
    },
    {
      key: "arbeitnow",
      name: "Arbeitnow",
      kind: "arbeitnow",
      enabled: true,
      intervalMinutes: 240,
    },
    {
      key: "arbeitsagentur-berlin",
      name: "Bundesagentur für Arbeit · Berlin",
      kind: "arbeitsagentur",
      board: "Berlin",
      enabled: true,
      intervalMinutes: 720,
    },
    {
      // LinkedIn job alert and recommendation emails from the connected Gmail (read-only).
      // LinkedIn forbids scraping its site, so its jobs come in through these emails.
      key: "linkedin-alerts",
      name: "LinkedIn job alert emails",
      kind: "linkedin-email",
      enabled: true,
      intervalMinutes: 120,
    },
    {
      key: "himalayas",
      name: "Himalayas",
      kind: "himalayas",
      enabled: true,
      intervalMinutes: 360,
    },
    {
      key: "remotive",
      name: "Remotive",
      kind: "remotive",
      enabled: false,
      intervalMinutes: 720,
    },
  ];
  for (const source of seeds)
    await db.source.upsert({
      where: { key: source.key },
      create: source,
      update: {},
    });
}
