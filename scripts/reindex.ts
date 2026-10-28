import "dotenv/config";
import { db } from "../src/lib/db";
import {
  countryCodes,
  eligibilityNote,
  matchJob,
  postingNotes,
} from "../src/lib/domain";
async function main() {
  const jobs = await db.job.findMany();
  for (const job of jobs) {
    const detected = countryCodes(job.location);
    await db.job.update({
      where: { id: job.id },
      data: {
        ...postingNotes(matchJob(job.title, job.description), job),
        countries: detected.length ? detected : job.countries,
        eligibilityNote: eligibilityNote(job.location, job.description),
      },
    });
  }
  console.log(
    `Reassessed ${jobs.length} jobs without changing discovery dates or submission history.`,
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
