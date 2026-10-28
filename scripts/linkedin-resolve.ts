import "dotenv/config";
import { db } from "../src/lib/db";
import { syncSource } from "../src/lib/ingestion";
import { resolveLinkedinJobs } from "../src/lib/linkedin-resolve";

// Looks for the own job boards of companies seen only on LinkedIn and merges LinkedIn jobs
// into the board postings. Usage: npm run linkedin:resolve [-- <companies per round>]
async function main() {
  const perRound = Number(process.argv[2] ?? 40);
  for (let round = 1; round <= 20; round++) {
    const result = await resolveLinkedinJobs(syncSource, perRound);
    console.log(`Round ${round}:`, result);
    if (!result.checked) break;
  }
}
main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
