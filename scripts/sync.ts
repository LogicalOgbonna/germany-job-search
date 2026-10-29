import "dotenv/config";
import { db } from "../src/lib/db";
import { seedSources } from "../src/lib/store";
import { syncSource } from "../src/lib/ingestion";
async function main() {
  await seedSources();
  const sources = await db.source.findMany({
    where: { enabled: true, nextRunAt: { lte: new Date() } },
  });
  for (const source of sources) {
    try {
      console.log(source.name, await syncSource(source.id));
    } catch (e) {
      console.error(source.name, e instanceof Error ? e.message : "Failed");
      process.exitCode = 1;
    }
  }
}
main().finally(() => db.$disconnect());
