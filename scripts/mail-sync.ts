import "dotenv/config";
import { db } from "../src/lib/db";
import { readToken } from "../src/lib/mail/gmail";
import { mailOverview, syncMail } from "../src/lib/mail/store";

async function main() {
  if (!(await readToken())) {
    console.error("Gmail is not connected. Run npm run mail:connect first.");
    process.exitCode = 1;
    return;
  }
  // --retry also asks again for the messages that were given up on after five failed checks.
  const { skipped, reason, ...counters } = await syncMail({
    retryGivenUp: process.argv.includes("--retry"),
  });
  if (skipped) {
    // Nothing was read from Gmail and nothing was changed.
    console.error(
      reason === "busy"
        ? "A mail check is already running. Try again in a minute."
        : reason === "pending-proposals"
          ? "Nothing was checked: a backfill report is waiting. Read it, then run npm run mail:backfill -- --apply (or -- --discard)."
          : "Nothing was checked: mail checks are off until the history import is done. Run npm run mail:backfill, read the report, then run npm run mail:backfill -- --apply.",
    );
    process.exitCode = 1;
    return;
  }
  console.log("Mail check", counters);
  console.log(`${counters.aiCalls} emails were read by Claude.`);
  if (counters.interviews)
    console.log(`${counters.interviews} interviews added or updated.`);
  if (reason)
    console.error("Another mail check took over, so this one stopped early.");
  const { lastError } = (await mailOverview()).connection;
  if (lastError) {
    console.error(lastError);
    process.exitCode = 1;
  }
}
main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Mail check failed");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
