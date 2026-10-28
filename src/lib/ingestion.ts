import { db } from "./db";
import { engineeringTitle, fetchSource } from "./connectors";
import { upsertJob } from "./store";
import { resolveLinkedinJobs } from "./linkedin-resolve";

export async function syncSource(id: string) {
  const now = new Date();
  const claimed = await db.source.updateMany({
    where: {
      id,
      enabled: true,
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: { leaseUntil: new Date(now.valueOf() + 15 * 60000) },
  });
  if (!claimed.count) return { skipped: true };
  const source = await db.source.findUniqueOrThrow({ where: { id } });
  await db.sourceRun.updateMany({
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
  const run = await db.sourceRun.create({ data: { sourceId: id } });
  try {
    const result = await fetchSource(source);
    let added = 0;
    for (const incoming of result.jobs) {
      if (!engineeringTitle.test(incoming.title)) continue;
      const saved = await upsertJob(source, incoming);
      if (saved.added) added++;
    }
    // LinkedIn jobs link only to LinkedIn: look for the employers' own boards and fold the
    // LinkedIn copies into those postings. A resolver problem never fails the LinkedIn run.
    let note: string | null = null;
    if (["linkedin", "linkedin-email"].includes(source.kind))
      try {
        const r = await resolveLinkedinJobs(syncSource);
        note = `Employer boards: ${r.checked} companies checked, ${r.registered} boards added, ${r.merged} LinkedIn jobs merged into board postings.`;
      } catch (error) {
        note = `Employer-board lookup failed: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`;
      }
    const ended = new Date();
    await db.$transaction([
      db.source.update({
        where: { id },
        data: {
          lastSuccessAt: ended,
          lastError: null,
          leaseUntil: null,
          nextRunAt: new Date(ended.valueOf() + source.intervalMinutes * 60000),
        },
      }),
      db.sourceRun.update({
        where: { id: run.id },
        data: {
          status: result.complete ? "success" : "partial",
          finishedAt: ended,
          fetched: result.jobs.length,
          added,
          message:
            [
              result.complete
                ? null
                : "Discovery page budget reached. Existing jobs remain unchanged.",
              note,
            ]
              .filter(Boolean)
              .join(" ") || null,
        },
      }),
    ]);
    return { fetched: result.jobs.length, added };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 400)
        : "Unknown fetch error";
    const retryAfter =
      error && typeof error === "object" && "retryAfterSeconds" in error
        ? Number(error.retryAfterSeconds)
        : 0;
    await db.$transaction([
      db.source.update({
        where: { id },
        data: {
          lastError: message,
          leaseUntil: null,
          nextRunAt: new Date(
            Date.now() + Math.max(30 * 60000, retryAfter * 1000),
          ),
        },
      }),
      db.sourceRun.update({
        where: { id: run.id },
        data: { status: "failed", finishedAt: new Date(), message },
      }),
    ]);
    throw error;
  }
}
