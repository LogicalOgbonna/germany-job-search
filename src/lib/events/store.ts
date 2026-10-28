import { db } from "../db";
import { safeUrl } from "../domain";
import {
  eventKey,
  eventMatch,
  europeanCountry,
  isUpcomingEurope,
  type IncomingEvent,
} from "./domain";
import { fetchEvents, LUMA_CITIES } from "./connectors";

export async function seedEventSources() {
  const sources = [
    {
      key: "developers",
      name: "Developers.events",
      kind: "developers",
      url: "https://developers.events/",
      scope: "Global conferences, filtered to Europe",
      intervalMinutes: 1440,
    },
    {
      key: "confs",
      name: "Confs.tech",
      kind: "confs",
      url: "https://confs.tech/",
      scope: "Nine engineering topics",
      intervalMinutes: 1440,
    },
    {
      key: "mlh",
      name: "Major League Hacking",
      kind: "mlh",
      url: "https://www.mlh.com/",
      scope: "Current season, European venues",
      intervalMinutes: 720,
    },
    {
      key: "hacktrack",
      name: "HackTrack EU",
      kind: "hacktrack",
      url: "https://github.com/lorenzopalaia/HackTrack-EU",
      scope: "European hackathons",
      intervalMinutes: 360,
    },
    ...LUMA_CITIES.map((city) => ({
      key: `luma-${city}`,
      name: `Luma · ${city[0].toUpperCase() + city.slice(1)}`,
      kind: "luma",
      url: `https://luma.com/${city}`,
      scope: city,
      intervalMinutes: 360,
    })),
  ];
  for (const source of sources)
    await db.eventSource.upsert({
      where: { key: source.key },
      create: source,
      update: {},
    });
}
export async function upsertEvent(sourceId: string, input: IncomingEvent) {
  const { externalId, ...incoming } = input;
  incoming.url = safeUrl(incoming.url);
  if (!incoming.url)
    throw new Error("Use a public HTTPS event link without credentials.");
  incoming.country = europeanCountry(incoming.country) ?? incoming.country;
  return db.$transaction(async (tx) => {
    const listing = await tx.eventListing.findUnique({
      where: { sourceId_externalId: { sourceId, externalId } },
      include: { event: true },
    });
    const canonicalKey = eventKey(incoming.url, incoming.startsAt);
    const previous =
      listing?.event ??
      (await tx.techEvent.findUnique({ where: { canonicalKey } }));
    // A date-only community entry must not erase the organizer's precise schedule or price.
    const preservePrecise = previous && !previous.allDay && incoming.allDay;
    const merged = preservePrecise ? { ...incoming, ...previous } : incoming;
    const match = eventMatch({
      ...merged,
      topics: [...new Set([...(previous?.topics ?? []), ...incoming.topics])],
    });
    const data = {
      title: merged.title,
      url: merged.url,
      description: merged.description || previous?.description || "",
      kind: merged.kind,
      city: merged.city,
      country: merged.country,
      format: merged.format,
      startsAt: merged.startsAt,
      endsAt: merged.endsAt,
      allDay: merged.allDay,
      timezone: merged.timezone ?? null,
      cost: merged.cost ?? previous?.cost ?? "Price not published",
      free: merged.free ?? previous?.free ?? false,
      eligibility:
        merged.eligibility ??
        previous?.eligibility ??
        "Check the organizer's participation requirements.",
      status: merged.status ?? "listed",
      ...match,
      lastSeenAt: new Date(),
    };
    const event = previous
      ? await tx.techEvent.update({ where: { id: previous.id }, data })
      : await tx.techEvent.upsert({
          where: { canonicalKey },
          create: { canonicalKey, ...data },
          update: data,
        });
    await tx.eventListing.upsert({
      where: { sourceId_externalId: { sourceId, externalId } },
      create: { sourceId, externalId, eventId: event.id },
      update: { eventId: event.id, seenAt: new Date() },
    });
    return { event, added: !previous };
  });
}
export async function syncEventSource(id: string) {
  const now = new Date();
  const claimed = await db.eventSource.updateMany({
    where: {
      id,
      enabled: true,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: { leaseUntil: new Date(now.valueOf() + 15 * 60000) },
  });
  if (!claimed.count) return { skipped: true };
  const source = await db.eventSource.findUniqueOrThrow({ where: { id } });
  await db.eventSourceRun.updateMany({
    where: {
      sourceId: id,
      status: "running",
      startedAt: { lt: new Date(now.valueOf() - 15 * 60000) },
    },
    data: {
      status: "interrupted",
      finishedAt: now,
      message: "Worker lease expired; run recovered.",
    },
  });
  const run = await db.eventSourceRun.create({ data: { sourceId: id } });
  try {
    const result = await fetchEvents(source);
    let added = 0,
      matched = 0;
    for (const incoming of result.events) {
      if (!isUpcomingEurope(incoming) || !eventMatch(incoming).score) continue;
      matched++;
      const saved = await upsertEvent(id, incoming);
      if (saved.added) added++;
    }
    const ended = new Date();
    await db.$transaction([
      db.eventSource.update({
        where: { id },
        data: {
          leaseUntil: null,
          lastError: null,
          lastSuccessAt: ended,
          nextRunAt: new Date(ended.valueOf() + source.intervalMinutes * 60000),
        },
      }),
      db.eventSourceRun.update({
        where: { id: run.id },
        data: {
          status: result.complete ? "success" : "partial",
          finishedAt: ended,
          fetched: result.events.length,
          matched,
          added,
          message: result.message,
        },
      }),
    ]);
    return { fetched: result.events.length, matched, added };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 400)
        : "Event sync failed";
    const retry =
      error && typeof error === "object" && "retryAfterSeconds" in error
        ? Number(error.retryAfterSeconds)
        : 0;
    await db.$transaction([
      db.eventSource.update({
        where: { id },
        data: {
          leaseUntil: null,
          lastError: message,
          nextRunAt: new Date(
            Date.now() +
              Math.max(30 * 60000, (Number.isFinite(retry) ? retry : 0) * 1000),
          ),
        },
      }),
      db.eventSourceRun.update({
        where: { id: run.id },
        data: { status: "failed", finishedAt: new Date(), message },
      }),
    ]);
    throw error;
  }
}
