import { createHash } from "node:crypto";
import { plain } from "../connectors";
import { capBody, tidy } from "../mail/gmail";
import type { RawMail } from "../mail/types";
import { linkedinUrl } from "../referrals/domain";

const keptFolders = new Set(["INBOX", "ARCHIVE"]);
// The snapshot's CONTENT is HTML; the changelog's text is plain and is kept as written.
const fromHtml = (html: string) => capBody(tidy(plain(html)));
const fromText = (text: string) => capBody(tidy(text));
// A canonical LinkedIn /in/ URL, lower-cased as LinkedIn messages carry them, or "". An "@"
// would make the mail matcher read the URL as an email address.
const profile = (url: string) =>
  url.includes("@") ? "" : linkedinUrl(url.trim()).toLowerCase();
// The export writes "2026-10-26 18:06:07 UTC"; a date without the zone is UTC as well.
function snapshotDate(value: string): Date {
  const stamp = value
    .trim()
    .replace(/\s*UTC$/i, "")
    .replace(" ", "T");
  return new Date(/(?:Z|[+-]\d\d:?\d\d)$/i.test(stamp) ? stamp : `${stamp}Z`);
}

// One id for one message, whichever source it was read from. The changelog has milliseconds
// and the snapshot only seconds, so time is floored to the second; the two sources render
// names and markup differently, so the text counts by its letters and digits alone.
export function messageId(input: {
  conversation: string;
  at: Date;
  text: string;
}): string {
  const second = Math.floor(input.at.getTime() / 1000);
  const text = input.text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
  return `linkedin:${createHash("sha256")
    .update([input.conversation, second, text].join("\u0000"))
    .digest("hex")}`;
}

function build(input: {
  conversation: string;
  sender: string;
  profileUrl: string;
  title: string;
  at: Date;
  body: string;
}): RawMail {
  return {
    gmailId: messageId({
      conversation: input.conversation,
      at: input.at,
      text: input.body,
    }),
    threadId: `linkedin:${input.conversation}`,
    fromAddress: profile(input.profileUrl),
    fromName: input.sender,
    // The sender's name stays in fromName: in the subject it would be read as a company.
    subject: input.title || "LinkedIn message",
    receivedAt: input.at,
    bodyText: input.body,
    fromMe: false,
    bulk: false,
  };
}

// The member's own messages are kept here; syncLinkedin drops them, in any name order.
export function fromSnapshot(row: Record<string, string>): RawMail | null {
  const sender = (row.FROM ?? "").trim();
  const body = fromHtml(row.CONTENT ?? "");
  const at = snapshotDate(row.DATE ?? "");
  if (
    !keptFolders.has(row.FOLDER) ||
    !sender ||
    !body ||
    !row["CONVERSATION ID"] ||
    Number.isNaN(at.getTime())
  )
    return null;
  return build({
    conversation: row["CONVERSATION ID"],
    sender,
    profileUrl: row["SENDER PROFILE URL"] ?? "",
    title: (row["CONVERSATION TITLE"] || row.SUBJECT || "").trim(),
    at,
    body,
  });
}

export function fromChangelog(event: any): RawMail | null {
  if (event?.resourceName !== "messages" || event.method !== "CREATE")
    return null;
  const activity = event.activity ?? {};
  const author = event.processedActivity?.["author~"] ?? {};
  const sender = [author.localizedFirstName, author.localizedLastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const conversation = String(activity.thread ?? "").replace(
    /^urn:li:messagingThread:/,
    "",
  );
  const body = fromText(
    String(
      activity.content?.content?.string ?? activity.content?.fallback ?? "",
    ),
  );
  const at = new Date(Number(activity.createdAt));
  if (!sender || !conversation || !body || Number.isNaN(at.getTime()))
    return null;
  return build({
    conversation,
    sender,
    profileUrl:
      author.vanityName && !String(author.vanityName).includes("@")
        ? `https://www.linkedin.com/in/${encodeURIComponent(String(author.vanityName))}`
        : "",
    title: "",
    at,
    body,
  });
}

export const withinWindow = (mail: RawMail, since: Date) =>
  mail.receivedAt.getTime() >= since.getTime();
