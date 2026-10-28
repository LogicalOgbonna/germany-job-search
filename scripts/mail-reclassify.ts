import "dotenv/config";
import { db } from "../src/lib/db";
import { reclassifyMail } from "../src/lib/mail/store";

async function main() {
  if (!process.env.ANTHROPIC_API_KEY)
    console.log(
      "ANTHROPIC_API_KEY is not set: only the rules are run again. Without Claude as second reader nothing changes a card.",
    );
  const { checked, changed, aiCalls, ...outcome } = await reclassifyMail();
  console.log(
    `Read ${checked} stored emails again, ${changed} got a different verdict. ${aiCalls} emails were read by Claude.`,
  );
  if (changed) console.log("What the new verdicts led to", outcome);
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Reclassifying failed",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
