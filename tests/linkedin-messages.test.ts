import test from "node:test";
import assert from "node:assert/strict";
import {
  fromChangelog,
  fromSnapshot,
  messageId,
  withinWindow,
} from "../src/lib/linkedin/messages";

const me = "Ada Lovelace";
const row = (over: Record<string, string> = {}) => ({
  "CONVERSATION ID": "2-abc==",
  "CONVERSATION TITLE": "",
  FROM: "Grace Hopper",
  "SENDER PROFILE URL": "https://www.linkedin.com/in/GraceHopper",
  TO: me,
  DATE: "2026-10-26 18:06:07 UTC",
  SUBJECT: "",
  CONTENT: "<p>Thanks for applying,&nbsp;we would like to talk.</p>",
  FOLDER: "INBOX",
  ...over,
});

test("a snapshot row becomes a RawMail with LinkedIn ids", () => {
  const mail = fromSnapshot(row(), me)!;
  assert.match(mail.gmailId, /^linkedin:[0-9a-f]{64}$/);
  assert.equal(mail.threadId, "linkedin:2-abc==");
  assert.equal(mail.fromAddress, "https://www.linkedin.com/in/gracehopper");
  assert.equal(mail.fromName, "Grace Hopper");
  assert.equal(mail.subject, "LinkedIn message from Grace Hopper");
  assert.equal(mail.bodyText, "Thanks for applying, we would like to talk.");
  assert.equal(mail.receivedAt.toISOString(), "2026-10-26T18:06:07.000Z");
  assert.equal(mail.fromMe, false);
  assert.equal(mail.bulk, false);
});

test("own messages, other folders and empty content are skipped", () => {
  assert.equal(fromSnapshot(row({ FROM: me }), me), null);
  assert.equal(fromSnapshot(row({ FOLDER: "SPAM" }), me), null);
  assert.equal(fromSnapshot(row({ CONTENT: "  " }), me), null);
  assert.ok(fromSnapshot(row({ FOLDER: "ARCHIVE" }), me));
});

test("the same message read from the changelog gets the same id and thread", () => {
  const event = {
    resourceName: "messages",
    method: "CREATE",
    activity: {
      thread: "urn:li:messagingThread:2-abc==",
      createdAt: Date.parse("2026-10-26T18:06:07.640Z"),
      content: {
        content: { string: "Thanks for applying, we would like to talk." },
      },
    },
    processedActivity: {
      "author~": { localizedFirstName: "Grace", localizedLastName: "Hopper" },
    },
  };
  const a = fromSnapshot(row(), me)!;
  const b = fromChangelog(event, me)!;
  assert.equal(b.gmailId, a.gmailId);
  assert.equal(b.threadId, a.threadId);
  assert.equal(b.fromName, "Grace Hopper");
});

test("changelog events that are not new messages are ignored", () => {
  assert.equal(
    fromChangelog({ resourceName: "comments", method: "CREATE" }, me),
    null,
  );
  assert.equal(
    fromChangelog(
      { resourceName: "messages", method: "DELETE", activity: {} },
      me,
    ),
    null,
  );
});

test("messageId depends on conversation, sender, second and text only", () => {
  const base = {
    conversation: "c",
    sender: "S",
    at: new Date(1000),
    text: "hi",
  };
  assert.equal(messageId(base), messageId({ ...base, at: new Date(1999) }));
  assert.notEqual(messageId(base), messageId({ ...base, text: "hi!" }));
});

test("the window keeps messages at or after the cutoff", () => {
  const mail = fromSnapshot(row(), me)!;
  assert.equal(withinWindow(mail, new Date("2026-10-26T00:00:00Z")), true);
  assert.equal(withinWindow(mail, new Date("2026-10-27T00:00:00Z")), false);
});
