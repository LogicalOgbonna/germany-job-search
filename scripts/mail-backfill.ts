import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { db } from "../src/lib/db";
import { readToken } from "../src/lib/mail/gmail";
import {
  applyProposals,
  discardProposals,
  mailLive,
  mailOverview,
  proposalSummary,
  setMailLive,
  syncMail,
} from "../src/lib/mail/store";

// npm run mail:backfill                    dry run from scratch: discards earlier proposals, reads, writes the report
// npm run mail:backfill -- --resume        the same without discarding: only reads what is not stored yet
// npm run mail:backfill -- --since=YYYY-MM-DD
// npm run mail:backfill -- "--label=Job Applications"   only mail with that Gmail label
// npm run mail:backfill -- --apply         applies the report and switches scheduled checks on
// npm run mail:backfill -- --apply --hold=<mail id>,<mail id>   the named proposals go to review instead
// npm run mail:backfill -- --discard       throws the proposals away
// npm run mail:backfill -- --off           switches scheduled checks off
const reportPath = join(process.cwd(), ".context", "mail-backfill-report.md");
const resume = "npm run mail:backfill -- --resume";
const actionLabels = {
  update: "Change a card",
  attach: "Link to a card, no change",
  create: "Create a card",
  review: "Needs review",
  ignore: "Ignore",
};
const cell = (value: string | null, limit = 160) => {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return (text.length > limit ? `${text.slice(0, limit)}...` : text)
    .replace(/\\/g, "\\\\")
    .replace(/\|/g, "\\|");
};
const table = (head: string[], rows: string[][]) =>
  rows.length
    ? [
        `| ${head.join(" | ")} |`,
        `| ${head.map(() => "---").join(" | ")} |`,
        ...rows.map((row) => `| ${row.join(" | ")} |`),
      ].join("\n")
    : "None.";
const day = (value: Date) => value.toISOString().slice(0, 10);
const sender = (mail: { fromName: string; fromAddress: string }) =>
  cell(
    mail.fromName ? `${mail.fromName} <${mail.fromAddress}>` : mail.fromAddress,
  );
const ids = (list: string[]) => list.map((id) => `\`${id}\``).join(" ");
const berlin = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  dateStyle: "medium",
  timeStyle: "short",
});

function render(
  since: Date,
  run: {
    listed: number;
    candidates: number;
    failed: number;
    aiCalls: number;
    aiFailures: number;
  },
  summary: Awaited<ReturnType<typeof proposalSummary>>,
  onBoard: number,
) {
  const related = summary.total - summary.actions.ignore;
  const share = related
    ? Math.round((summary.review.length / related) * 100)
    : 0;
  const moving = summary.existing.filter(
    (card) => card.statusAfter !== card.statusNow,
  ).length;
  return `# Mail backfill, dry run

Written ${new Date().toISOString()} for mail since ${day(since)}.

**Nothing has been changed.** No card was moved, created or linked, and scheduled mail checks stay off until you apply this report.

- To apply it: \`npm run mail:backfill -- --apply\`. The proposals are applied in date order and scheduled checks are switched on. A proposal is not applied when its card has changed since this report or when it would no longer do what is written here; it goes to the review list instead.
- To leave some proposals out: \`npm run mail:backfill -- --apply --hold=<mail id>,<mail id>\`. Each table below shows the mail id of its proposals. Held proposals go to the review list unapplied, and so does later mail that depends on them.
- To throw the report away: \`npm run mail:backfill -- --discard\`.
- To start over, for example after the rules changed: \`npm run mail:backfill\` again. It discards these proposals and reads the mail anew. \`${resume}\` keeps them and only reads what is not stored yet.

## At a glance

- Changes proposed (cards moved or created): ${summary.actions.update + summary.actions.create}
  - Agreed by both readers, the rules and Claude: ${summary.agreedChanges}
  - Cards created from a receipt without asking Claude (sent by a hiring system and stating the role): ${summary.receiptsWithoutClaude}
- Interviews that would be added: ${summary.interviews.length}
- Emails waiting for review: ${summary.review.length}
${summary.reviewReasons.map((item) => `  - ${item.mails}: ${cell(item.reason, 200)}`).join("\n") || "  - None."}

## Summary

- Messages listed in Gmail by this run: ${run.listed}
- Kept by this run as possibly about an application: ${run.candidates}
- ${run.aiCalls} emails were read by Claude in this run
- Proposals waiting in total: ${summary.total}
- Messages that could not be read or stored (the next run asks for them again): ${run.failed}
- Mail Claude was asked about and that stayed undecided: ${run.aiFailures}
- Needs review: ${summary.review.length} of ${related} job-related mails, ${share}% (target: at most 15%)

## By category

${table(
  ["Category", "Mails"],
  Object.entries(summary.categories)
    .sort((a, b) => b[1] - a[1])
    .map(([name, total]) => [name.replace("_", " "), String(total)]),
)}

## By proposed action

${table(
  ["Action", "Mails"],
  Object.entries(actionLabels).map(([key, label]) => [
    label,
    String(summary.actions[key as keyof typeof actionLabels]),
  ]),
)}

## Cards that would be created (${summary.created.length})

${table(
  ["Company", "Role", "Status it would end on", "First mail", "Mail ids"],
  summary.created.map((card) => [
    cell(card.company),
    cell(card.title),
    card.status,
    `${day(card.firstMailAt)} ${cell(card.firstSubject, 90)}`,
    ids(card.mailIds),
  ]),
)}

## Existing cards with mail (${summary.existing.length} of ${onBoard} on the board)

${moving} would change status. The others keep their status: receipts, repeats and mail for a stage the card has already reached are linked to them. Mail that asks for something at an earlier stage than the card is on, mail on a card that was never recorded as submitted, and anything only one reader saw are not in this table: they are in the review list.

${table(
  ["Company", "Role", "Now", "After", "Mail ids"],
  summary.existing.map((card) => [
    cell(card.company),
    cell(card.title),
    card.statusNow,
    card.statusAfter === card.statusNow
      ? card.statusNow
      : `**${card.statusAfter}**`,
    ids(card.mailIds),
  ]),
)}

## Interviews that would be added (${summary.interviews.length})

Read from confirmations and invitations of the hiring systems and calendars. An interview never changes a card's stage; the card's next step becomes the interview, unless a later step is already set.

${table(
  ["Mail id", "Company", "Role", "Starts (Berlin time)", "From"],
  summary.interviews.map((item) => [
    ids([item.id]),
    `${cell(item.company)}${item.newCard ? " (new card)" : ""}`,
    cell(item.title),
    item.startsAt ? berlin.format(item.startsAt) : "Time not stated",
    item.provider,
  ]),
)}

${summary.interviewOffers.length} more interview emails could not be tied to one card; they wait in the review list with "Add as interview".

## Proposed rejections (${summary.rejections.length})

Check every line: a rejection on the wrong card is the costly mistake.

${table(
  ["Mail id", "Date", "Subject", "From", "Card", "Decided by", "Evidence"],
  summary.rejections.map((mail) => [
    ids([mail.id]),
    day(mail.receivedAt),
    cell(mail.subject),
    sender(mail),
    `${cell(mail.company)}, ${cell(mail.title)}${mail.newCard ? " (new card)" : ""}`,
    cell(mail.decidedBy),
    cell(mail.evidenceQuote, 300),
  ]),
)}

## Needs review (${summary.review.length})

${table(
  ["Mail id", "Date", "Subject", "From", "Guess", "Why"],
  summary.review.map((mail) => [
    ids([mail.id]),
    day(mail.receivedAt),
    cell(mail.subject),
    sender(mail),
    `${mail.category.replace("_", " ")} (${mail.confidence})`,
    cell(mail.reason, 300),
  ]),
)}
`;
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag: string) =>
    args.find((arg) => arg.startsWith(`${flag}=`))?.slice(flag.length + 1);
  if (args.includes("--off")) {
    await setMailLive(false);
    console.log(
      `Scheduled mail checks are ${(await mailLive()) ? "on" : "off"}. Nothing else was changed. They come back on with npm run mail:backfill -- --apply after a dry run.`,
    );
    return;
  }
  if (args.includes("--discard")) {
    console.log(
      `Discarded ${await discardProposals()} proposals. Nothing on the board was changed.`,
    );
    return;
  }
  if (args.includes("--apply")) {
    const hold = (value("--hold") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const { diverged, heldBack, failed, complete, interviews, ...counters } =
      await applyProposals(new Date(), { hold });
    console.log("Applied the stored proposals", counters);
    console.log(`Interviews added or updated: ${interviews}`);
    console.log(
      `Not applied because the card or the board changed after the report was written: ${diverged}`,
    );
    console.log(`Held back by you: ${heldBack}`);
    console.log(`Could not be applied: ${failed}`);
    if (diverged + heldBack + failed)
      console.log("Those emails are now in the review list.");
    if (complete) console.log("Scheduled mail checks are now on.");
    else {
      console.error(
        "Another mail check took over before all proposals were applied. Scheduled checks were not switched on. Run this command again.",
      );
      process.exitCode = 1;
    }
    return;
  }
  const from = value("--since") ?? "2025-09-01";
  const since = new Date(`${from}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || Number.isNaN(since.valueOf()))
    throw new Error("Use --since=YYYY-MM-DD.");
  if (!(await readToken())) {
    console.error("Gmail is not connected. Run npm run mail:connect first.");
    process.exitCode = 1;
    return;
  }
  // An earlier dry run was planned with the rules of that time: start over, unless asked
  // to take up a run that was cut short.
  const discarded = args.includes("--resume") ? 0 : await discardProposals();
  console.log(
    `Reading mail since ${from}${value("--label") ? ` labelled "${value("--label")}"` : ""}. Nothing on the board will be changed.${discarded ? ` ${discarded} proposals of an earlier dry run were discarded.` : ""}`,
  );
  const cutShort = `The dry run was cut short. What it read so far is kept: run ${resume} to go on from there.`;
  let result: Awaited<ReturnType<typeof syncMail>>;
  try {
    result = await syncMail({ since, dryRun: true, label: value("--label") });
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Mail backfill failed",
    );
    console.error(cutShort);
    process.exitCode = 1;
    return;
  }
  const { skipped, reason, ...counters } = result;
  const { lastError } = (await mailOverview()).connection;
  if (reason || lastError?.startsWith("Reconnect Gmail")) {
    console.error(
      skipped
        ? "A mail check is already running. Try again in a few minutes."
        : reason
          ? `Another mail check took over. ${cutShort}`
          : lastError,
    );
    process.exitCode = 1;
    return;
  }
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    render(
      since,
      counters,
      await proposalSummary(),
      await db.application.count(),
    ),
  );
  console.log("Dry run", counters);
  console.log(`${counters.aiCalls} emails were read by Claude.`);
  if (lastError) console.error(lastError);
  console.log(
    `Report: ${reportPath}\nRead it, then run: npm run mail:backfill -- --apply (add --hold=<mail id>,... to leave proposals out, or use -- --discard to throw it away). Scheduled checks stay off until then.`,
  );
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Mail backfill failed",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
