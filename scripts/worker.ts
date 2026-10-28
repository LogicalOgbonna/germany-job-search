import "dotenv/config";
import { Queue, Worker } from "bullmq";
import { db } from "../src/lib/db";
import { seedEventSources, syncEventSource } from "../src/lib/events/store";
import { syncSource } from "../src/lib/ingestion";
import { readToken } from "../src/lib/mail/gmail";
import { mailLive, requeueStalePrep, syncMail } from "../src/lib/mail/store";

// Loaded when first needed, so the worker still starts (and checks sources and mail) while
// prep generation is missing or fails to load.
const loadPrep = () =>
  import("../src/lib/interviews/prep").catch((error) => {
    console.error(
      `[worker] prep generation is not available: ${error instanceof Error ? error.message : error}`,
    );
    return null;
  });

const redis = new URL(process.env.REDIS_URL ?? "redis://127.0.0.1:55012");
const connection = {
  host: redis.hostname,
  port: Number(redis.port || 6379),
  ...(redis.password ? { password: decodeURIComponent(redis.password) } : {}),
};
const queue = new Queue("jobdesk-sync", { connection });
const worker = new Worker(
  "jobdesk-sync",
  async (job) => {
    if (job.name === "tick") {
      await db.setting.upsert({
        where: { key: "workerHeartbeat" },
        create: { key: "workerHeartbeat", value: new Date().toISOString() },
        update: { value: new Date().toISOString() },
      });
      const sources = await db.source.findMany({
        where: {
          enabled: true,
          nextRunAt: { lte: new Date() },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
      });
      for (const source of sources)
        await queue.add(
          "fetch",
          { id: source.id },
          {
            jobId: `source-${source.id}`,
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
      const eventSources = await db.eventSource.findMany({
        where: {
          enabled: true,
          nextRunAt: { lte: new Date() },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }],
        },
      });
      for (const source of eventSources)
        await queue.add(
          "fetch-events",
          { id: source.id },
          {
            jobId: `events-${source.id}`,
            removeOnComplete: true,
            removeOnFail: true,
          },
        );
      // Scheduled mail checks change cards, so they wait for the live switch that
      // npm run mail:backfill -- --apply sets, and for any report still waiting to be applied.
      // syncMail makes the same check, and sets the next run itself: 10 minutes ahead, or
      // later when Google asks for a pause.
      if ((await readToken()) && (await mailLive())) {
        const mail = await db.mailSync.findUnique({ where: { id: "gmail" } });
        const due =
          (!mail ||
            (mail.nextRunAt <= new Date() &&
              (!mail.leaseUntil || mail.leaseUntil < new Date()))) &&
          !(await db.mailMessage.count({ where: { state: "proposed" } }));
        if (due)
          await queue.add(
            "mail",
            {},
            { jobId: "mail-sync", removeOnComplete: true, removeOnFail: true },
          );
      }
      // Prep sheets: a run that a stopped worker left "running" is queued again, then the next
      // queued interview is claimed (queued becomes running at once, so no other worker takes
      // it) and handed to a job.
      const prep = await loadPrep();
      if (prep) {
        await requeueStalePrep();
        const id = await prep.nextQueuedPrep();
        if (id)
          await queue.add(
            "interview-prep",
            { id },
            { jobId: `prep-${id}`, removeOnComplete: true, removeOnFail: true },
          );
      }
      return;
    }
    if (job.name === "mail") return syncMail();
    // generatePrep records its own failure on the interview; anything else is logged below.
    if (job.name === "interview-prep") {
      const prep = await loadPrep();
      if (!prep) throw new Error("Prep generation could not be loaded.");
      return prep.generatePrep(job.data.id);
    }
    if (job.name === "fetch-events") return syncEventSource(job.data.id);
    return syncSource(job.data.id);
  },
  { connection, concurrency: 2 },
);
worker.on("failed", (job, error) =>
  console.error(`[worker] ${job?.name}: ${error.message}`),
);
worker.on("error", (error) => console.error(`[worker] ${error.message}`));
async function start() {
  await seedEventSources();
  await queue.upsertJobScheduler(
    "source-tick",
    { every: 60000 },
    {
      name: "tick",
      data: {},
      opts: { removeOnComplete: 10, removeOnFail: 10 },
    },
  );
  await queue.add("tick", {}, { removeOnComplete: true });
  console.log("Jobdesk worker running. Source schedules checked every minute.");
}
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await worker.close();
  await queue.close();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
start().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
