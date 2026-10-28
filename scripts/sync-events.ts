import "dotenv/config";
import { db } from "../src/lib/db";
import { seedEventSources, syncEventSource } from "../src/lib/events/store";
async function main() {
  await seedEventSources();
  const sources = await db.eventSource.findMany({
    where: {
      enabled: true,
      ...(process.argv.includes("--force")
        ? {}
        : { nextRunAt: { lte: new Date() } }),
    },
  });
  for (const source of sources) {
    try {
      console.log(source.name, await syncEventSource(source.id));
    } catch (e) {
      console.error(source.name, e instanceof Error ? e.message : "Failed");
      process.exitCode = 1;
    }
  }
}
main().finally(() => db.$disconnect());
