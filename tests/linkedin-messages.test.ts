import test from "node:test";
import assert from "node:assert/strict";
import {
  fromChangelog,
  fromSnapshot,
  messageId,
  withinWindow,
} from "../src/lib/linkedin/messages";
import { companyEvidence } from "../src/lib/mail/match";

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
  assert.equal(mail.subject, "LinkedIn message");
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

test("messageId depends on conversation, second and the text's letters and digits only", () => {
  const base = { conversation: "c", at: new Date(1000), text: "Hi there" };
  assert.equal(messageId(base), messageId({ ...base, at: new Date(1999) }));
  assert.equal(messageId(base), messageId({ ...base, text: " hi, THERE!\n" }));
  assert.notEqual(messageId(base), messageId({ ...base, text: "Hi there 2" }));
  assert.notEqual(messageId(base), messageId({ ...base, conversation: "d" }));
});

const event = (
  over: { text?: string; author?: Record<string, string> } = {},
) => ({
  resourceName: "messages",
  method: "CREATE",
  activity: {
    thread: "urn:li:messagingThread:2-abc==",
    createdAt: Date.parse("2026-10-26T18:06:07.640Z"),
    content: {
      content: {
        string: over.text ?? "Thanks for applying, we would like to talk.",
      },
    },
  },
  processedActivity: {
    "author~": over.author ?? {
      localizedFirstName: "Grace",
      localizedLastName: "Hopper",
    },
  },
});

test("the same message from both sources gets one id, whatever the sender name or markup", () => {
  const snapshot = fromSnapshot(
    row({
      FROM: "Dr. Grace Hopper",
      CONTENT:
        "<p>Ihr Vorstellungsgespr&auml;ch &amp; Termin:</p><p>Montag</p>",
    }),
    me,
  )!;
  const changelog = fromChangelog(
    event({ text: "Ihr Vorstellungsgespräch & Termin:\nMontag" }),
    me,
  )!;
  assert.equal(snapshot.gmailId, changelog.gmailId);
});

test("the fallback subject names nobody", () => {
  const mail = fromSnapshot(row(), me)!;
  assert.equal(mail.fromName, "Grace Hopper");
  assert.deepEqual(
    companyEvidence(mail, {
      category: "unrelated",
      confidence: "high",
      decidedBy: "test",
      evidenceQuote: null,
      company: null,
      role: null,
      nextStep: null,
      deadline: null,
    }),
    [],
  );
});

test("snapshot content decodes every HTML entity", () => {
  const mail = fromSnapshot(
    row({
      CONTENT:
        "<p>Ihr Vorstellungsgespr&auml;ch am Montag &#8211; &#x27;Raum&#x27; f&uuml;r &quot;Sie&quot;</p>",
    }),
    me,
  )!;
  assert.equal(
    mail.bodyText,
    "Ihr Vorstellungsgespräch am Montag \u2013 'Raum' für \"Sie\"",
  );
});

test("changelog text is plain: tags and entities in it are kept as written", () => {
  const mail = fromChangelog(
    event({ text: "Use <b>bold</b> if a < b &amp; c" }),
    me,
  )!;
  assert.equal(mail.bodyText, "Use <b>bold</b> if a < b &amp; c");
});

test("NUL characters are removed and the 20,000 limit never splits a surrogate pair", () => {
  assert.equal(fromChangelog(event({ text: "a\u0000b" }), me)!.bodyText, "ab");
  const long = fromChangelog(
    event({ text: `${"a".repeat(19999)}\u{1F600}tail` }),
    me,
  )!.bodyText;
  assert.equal(long, "a".repeat(19999));
  assert.doesNotMatch(long, /[\ud800-\udbff]$/);
});

test("a snapshot date without UTC is still read as UTC", () => {
  const mail = fromSnapshot(row({ DATE: "2026-10-26 18:06:07" }), me)!;
  assert.equal(mail.receivedAt.toISOString(), "2026-10-26T18:06:07.000Z");
});

test("profile URLs are canonical LinkedIn /in/ URLs, lower-cased, or empty", () => {
  const url = (value: string) =>
    fromSnapshot(row({ "SENDER PROFILE URL": value }), me)!.fromAddress;
  assert.equal(
    url("https://linkedin.com/in/GraceHopper/"),
    "https://www.linkedin.com/in/gracehopper",
  );
  assert.equal(url("http://www.linkedin.com/in/gracehopper"), "");
  assert.equal(url("https://evil.example/in/gracehopper"), "");
  assert.equal(url("https://www.linkedin.com/in/grace@hopper.com"), "");
  assert.equal(url(""), "");
  const vanity = (vanityName: string) =>
    fromChangelog(
      event({
        author: {
          localizedFirstName: "Grace",
          localizedLastName: "Hopper",
          vanityName,
        },
      }),
      me,
    )!.fromAddress;
  assert.equal(
    vanity("Grace-Hopper"),
    "https://www.linkedin.com/in/grace-hopper",
  );
  assert.equal(vanity("a/../b"), "https://www.linkedin.com/in/a%2f..%2fb");
  assert.equal(vanity("grace@hopper.com"), "");
});

test("the window keeps messages at or after the cutoff", () => {
  const mail = fromSnapshot(row(), me)!;
  assert.equal(withinWindow(mail, new Date("2026-10-26T00:00:00Z")), true);
  assert.equal(withinWindow(mail, new Date("2026-10-27T00:00:00Z")), false);
});
