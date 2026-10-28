import "dotenv/config";
import { seedEventSources } from "../src/lib/events/store";
import { importArchive } from "../src/lib/importer";
import { db } from "../src/lib/db";
seedEventSources()
  .then(() => importArchive())
  .then(console.log)
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
