import "dotenv/config";
import { db } from "../src/lib/db";
import { syncLinkedin } from "../src/lib/linkedin/sync";

// One LinkedIn check by hand. Prints counts only, never message content or names.
async function main() {
  const { skipped, ...counts } = await syncLinkedin();
  if (skipped) {
    console.error(
      skipped === "busy"
        ? "A LinkedIn check is already running. Try again in a few minutes."
        : skipped === "not-connected"
          ? "LinkedIn is not connected. Run npm run linkedin:connect -- --data first."
          : skipped === "pending-proposals"
            ? "Nothing was checked: a backfill report is waiting. Read it, then run npm run mail:backfill -- --apply (or -- --discard)."
            : "Nothing was checked: mail checks are off until the Gmail history import is applied (npm run mail:backfill -- --apply).",
    );
    process.exitCode = 1;
    return;
  }
  console.log("LinkedIn check", counts);
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "LinkedIn check failed",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
