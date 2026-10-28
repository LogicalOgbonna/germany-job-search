import { createHash } from "node:crypto";
import type { RawMail } from "../mail/types";

const keptFolders = new Set(["INBOX", "ARCHIVE"]);
const entities: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};
const text = (html: string) =>
  html
    .replace(/<br\s*\/?>|<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(
      /&[a-z#0-9]+;/gi,
      (entity) => entities[entity.toLowerCase()] ?? " ",
    )
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 20000);
const sameName = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

// One id for one message, whichever source it was read from. The changelog has milliseconds
// and the snapshot only seconds, so time is floored to the second.
export function messageId(input: {
  conversation: string;
  sender: string;
  at: Date;
  text: string;
}): string {
  const second = Math.floor(input.at.getTime() / 1000);
  return `linkedin:${createHash("sha256")
    .update(
      [
        input.conversation,
        input.sender.trim().toLowerCase(),
        second,
        input.text,
      ].join("\u0000"),
    )
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
      sender: input.sender,
      at: input.at,
      text: input.body,
    }),
    threadId: `linkedin:${input.conversation}`,
    fromAddress: input.profileUrl.toLowerCase(),
    fromName: input.sender,
    subject: input.title || `LinkedIn message from ${input.sender}`,
    receivedAt: input.at,
    bodyText: input.body,
    fromMe: false,
    bulk: false,
  };
}

export function fromSnapshot(
  row: Record<string, string>,
  me: string,
): RawMail | null {
  const sender = (row.FROM ?? "").trim();
  const body = text(row.CONTENT ?? "");
  const at = new Date((row.DATE ?? "").replace(" UTC", "Z").replace(" ", "T"));
  if (
    !keptFolders.has(row.FOLDER) ||
    !sender ||
    sameName(sender, me) ||
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

export function fromChangelog(event: any, me: string): RawMail | null {
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
  const body = text(
    activity.content?.content?.string ?? activity.content?.fallback ?? "",
  );
  const at = new Date(Number(activity.createdAt));
  if (
    !sender ||
    sameName(sender, me) ||
    !conversation ||
    !body ||
    Number.isNaN(at.getTime())
  )
    return null;
  return build({
    conversation,
    sender,
    profileUrl: author.vanityName
      ? `https://www.linkedin.com/in/${author.vanityName}`
      : "",
    title: "",
    at,
    body,
  });
}

export const withinWindow = (mail: RawMail, since: Date) =>
  mail.receivedAt.getTime() >= since.getTime();
