import "dotenv/config";
import { db } from "../src/lib/db";
import { interviewsFromStoredMail } from "../src/lib/mail/store";

// npm run interviews:from-mail             adds interviews from mail stored before they were read
// npm run interviews:from-mail -- --dry-run   prints what it would add and changes nothing
// Safe to run again: an interview is found again by the mail it came from.
const berlin = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  dateStyle: "full",
  timeStyle: "short",
});

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { read, added, updated, interviews } = await interviewsFromStoredMail({
    dryRun,
  });
  for (const item of interviews)
    console.log(
      `${dryRun ? "Would be " : ""}${item.created ? "added" : "updated"}: ${item.company || "(no company)"}, ${item.title || "role not stated"}. ${item.startsAt ? `${berlin.format(item.startsAt)} Berlin time` : "Time not stated"}. From ${item.provider}: "${item.subject}"`,
    );
  console.log(
    `${dryRun ? "Dry run, nothing was written. " : ""}Read ${read} emails linked to applications: ${added} interviews ${dryRun ? "would be " : ""}added, ${updated} ${dryRun ? "would be " : ""}updated.`,
  );
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Reading interviews failed",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
