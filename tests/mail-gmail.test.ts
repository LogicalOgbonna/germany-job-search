import test from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MailAuthError,
  MailNotFoundError,
  MailProviderError,
  consentUrl,
  exchangeCode,
  gmailClient,
  gmailScope,
  readToken,
  sinceQuery,
  toRawMail,
  writeToken,
} from "../src/lib/mail/gmail";

process.env.GOOGLE_CLIENT_ID = "test-client";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";

const me = "arinze@example.com";
const b64 = (text: string) => Buffer.from(text).toString("base64url");
const text = (mimeType: string, content: string, extra = {}) => ({
  mimeType,
  filename: "",
  body: { data: b64(content) },
  ...extra,
});
const message = (payload: object, extra = {}) => ({
  id: "m1",
  threadId: "t1",
  labelIds: ["INBOX"],
  internalDate: "1791849600000",
  ...extra,
  payload: {
    headers: [
      { name: "From", value: "Peec AI <no-reply@ashbyhq.com>" },
      { name: "Subject", value: "Thanks for applying to Peec AI!" },
    ],
    ...payload,
  },
});
const withHeaders = (from: string, subject = "Hello") =>
  message({
    headers: [
      { name: "from", value: from },
      { name: "SUBJECT", value: subject },
    ],
  });

test("multipart/alternative returns the plain part and the message fields", () => {
  const mail = toRawMail(
    message({
      mimeType: "multipart/alternative",
      parts: [
        text("text/plain", "We have received your application."),
        text("text/html", "<p>HTML version</p>"),
      ],
    }),
    me,
  );
  assert.deepEqual(mail, {
    gmailId: "m1",
    threadId: "t1",
    fromAddress: "no-reply@ashbyhq.com",
    fromName: "Peec AI",
    subject: "Thanks for applying to Peec AI!",
    receivedAt: new Date("2026-10-13T00:00:00Z"),
    bodyText: "We have received your application.",
    fromMe: false,
    bulk: false,
  });
});
test("an HTML-only message is reduced to text", () => {
  const html =
    "<html><style>p{color:red}</style><body><p>Hello Arinze,</p><p>we would like to   invite you.</p><script>track()</script></body></html>";
  assert.equal(
    toRawMail(message(text("text/html", html)), me).bodyText,
    "Hello Arinze,\nwe would like to invite you.",
  );
  assert.equal(
    toRawMail(
      message({
        mimeType: "multipart/alternative",
        parts: [text("text/plain", " \r\n "), text("text/html", html)],
      }),
      me,
    ).bodyText,
    "Hello Arinze,\nwe would like to invite you.",
  );
});
test("text is found inside nested multiparts and attachments are ignored", () => {
  const mail = toRawMail(
    message({
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          filename: "",
          body: { size: 0 },
          parts: [
            text("text/plain", "Please complete the assignment."),
            text("text/html", "<p>Please complete the assignment.</p>"),
          ],
        },
        text("text/plain", "attached notes", { filename: "notes.txt" }),
        {
          mimeType: "application/pdf",
          filename: "task.pdf",
          body: { attachmentId: "a1", size: 9000 },
        },
      ],
    }),
    me,
  );
  assert.equal(mail.bodyText, "Please complete the assignment.");
});
const invite =
  "BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\nBEGIN:VEVENT\r\nDTSTART:20261022T081500Z\r\nSUMMARY:Gespräch\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
test("a text/calendar part is kept as calendar, apart from the body", () => {
  const mail = toRawMail(
    message({
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/alternative",
          filename: "",
          parts: [
            text("text/plain", "You have been invited."),
            text("text/html", "<p>You have been invited.</p>"),
            text("text/calendar", invite, {
              headers: [
                {
                  name: "Content-Type",
                  value: 'text/calendar; charset="UTF-8"; method=REQUEST',
                },
              ],
            }),
          ],
        },
        {
          mimeType: "application/ics",
          filename: "invite.ics",
          body: { attachmentId: "a1", size: 300 },
        },
      ],
    }),
    me,
  );
  assert.equal(mail.calendar, invite);
  assert.equal(mail.bodyText, "You have been invited.");
});
test("an application/ics attachment with inline data is kept as calendar", () => {
  const latin = {
    mimeType: "application/ics",
    filename: "invite.ics",
    headers: [
      { name: "Content-Type", value: "application/ics; charset=ISO-8859-1" },
    ],
    body: {
      data: Buffer.from("SUMMARY:Gespräch", "latin1").toString("base64url"),
    },
  };
  const mail = toRawMail(
    message({
      mimeType: "multipart/mixed",
      parts: [text("text/plain", "Invitation attached."), latin],
    }),
    me,
  );
  assert.equal(mail.calendar, "SUMMARY:Gespräch");
  assert.equal(mail.bodyText, "Invitation attached.");
});
test("no calendar part leaves calendar unset", () => {
  const plainOnly = toRawMail(message(text("text/plain", "Hi")), me);
  assert.equal("calendar" in plainOnly, false);
  const attachmentOnly = toRawMail(
    message({
      mimeType: "multipart/mixed",
      parts: [
        text("text/plain", "Hi"),
        {
          mimeType: "text/calendar",
          filename: "invite.ics",
          body: { attachmentId: "a1", size: 300 },
        },
      ],
    }),
    me,
  );
  assert.equal("calendar" in attachmentOnly, false);
});
test("bodies are base64url decoded, in the charset the part declares", () => {
  assert.equal(b64(">>>???"), "Pj4-Pz8_");
  assert.equal(
    toRawMail(message(text("text/plain", ">>>???")), me).bodyText,
    ">>>???",
  );
  assert.equal(
    toRawMail(message(text("text/plain", "Grüße aus Köln")), me).bodyText,
    "Grüße aus Köln",
  );
  const latin = {
    mimeType: "text/plain",
    filename: "",
    headers: [
      { name: "Content-Type", value: 'text/plain; charset="ISO-8859-1"' },
    ],
    body: { data: Buffer.from("für Sie", "latin1").toString("base64url") },
  };
  assert.equal(toRawMail(message(latin), me).bodyText, "für Sie");
});
test("whitespace is collapsed, the body is capped and a missing body is empty", () => {
  assert.equal(
    toRawMail(
      message(text("text/plain", "Hello  \t there \r\n\r\n\r\n\r\nBye ")),
      me,
    ).bodyText,
    "Hello there\n\nBye",
  );
  assert.equal(
    toRawMail(message(text("text/plain", "abcd".repeat(10000))), me).bodyText
      .length,
    20000,
  );
  assert.equal(toRawMail(message({ mimeType: "text/plain" }), me).bodyText, "");
  assert.equal(
    toRawMail(
      message({
        mimeType: "multipart/mixed",
        parts: [
          {
            mimeType: "application/pdf",
            filename: "cv.pdf",
            body: { attachmentId: "a1" },
          },
        ],
      }),
      me,
    ).bodyText,
    "",
  );
});
test("encoded-word subjects are decoded", () => {
  const subject = (value: string) => toRawMail(withHeaders(me, value), me);
  assert.equal(
    subject(
      `=?UTF-8?B?${Buffer.from("Deine Bewerbung für Köln").toString("base64")}?=`,
    ).subject,
    "Deine Bewerbung für Köln",
  );
  assert.equal(
    subject("=?UTF-8?Q?Einladung_zum_Gespr=C3=A4ch?=").subject,
    "Einladung zum Gespräch",
  );
  assert.equal(
    subject("Re: =?utf-8?q?Gr=C3=BC=C3?=\r\n =?utf-8?q?=9Fe?= aus Berlin")
      .subject,
    "Re: Grüße aus Berlin",
  );
  assert.equal(
    subject("=?ISO-8859-1?Q?M=FCnchen?= calling").subject,
    "München calling",
  );
});
test("the From header is split into address and display name", () => {
  const from = (value: string) => {
    const mail = toRawMail(withHeaders(value), me);
    return [mail.fromAddress, mail.fromName];
  };
  assert.deepEqual(from('"Peec AI Hiring" <No-Reply@AshbyHQ.com>'), [
    "no-reply@ashbyhq.com",
    "Peec AI Hiring",
  ]);
  assert.deepEqual(from("Raisin Careers <jobs@raisin.com>"), [
    "jobs@raisin.com",
    "Raisin Careers",
  ]);
  assert.deepEqual(from("Jobs@Envelio.de"), ["jobs@envelio.de", ""]);
  assert.deepEqual(from("<jobs@envelio.de>"), ["jobs@envelio.de", ""]);
  assert.deepEqual(from('"Müller, Anna \\"HR\\"" <anna@acme.de>'), [
    "anna@acme.de",
    'Müller, Anna "HR"',
  ]);
  assert.deepEqual(
    from("=?UTF-8?Q?J=C3=B6rg_von_K=C3=B6ln?= <joerg@acme.de>"),
    ["joerg@acme.de", "Jörg von Köln"],
  );
});
test("fromMe follows the address or the SENT label", () => {
  const body = text("text/plain", "Hi");
  assert.equal(toRawMail(message(body), me).fromMe, false);
  assert.equal(
    toRawMail(message(body, { labelIds: ["SENT"] }), me).fromMe,
    true,
  );
  assert.equal(
    toRawMail(withHeaders("Arinze <Arinze@Example.com>"), me).fromMe,
    true,
  );
});
test("bulk follows the mailing-list headers", () => {
  const bulk = (...extra: [string, string][]) =>
    toRawMail(
      message({
        headers: [
          { name: "From", value: "Acme Jobs <jobs@acme.de>" },
          { name: "Subject", value: "Your application" },
          ...extra.map(([name, value]) => ({ name, value })),
        ],
      }),
      me,
    ).bulk;
  assert.equal(bulk(), false);
  assert.equal(
    bulk(["List-Unsubscribe", "<mailto:unsubscribe@acme.de>"]),
    true,
  );
  assert.equal(bulk(["list-unsubscribe", "<https://acme.de/u/1>"]), true);
  assert.equal(bulk(["LIST-ID", "<jobs.acme.de>"]), true);
  assert.equal(bulk(["Precedence", "Bulk"]), true);
  assert.equal(bulk(["precedence", " list "]), true);
  assert.equal(bulk(["Precedence", "first-class"]), false);
  assert.equal(bulk(["X-Precedence", "bulk"]), false);
  assert.equal(bulk(["Precedence", "bulky"]), false);
});
test("a response that is not a message is rejected", () => {
  assert.throws(() => toRawMail({ error: { code: 404 } }, me), /shape changed/);
  assert.throws(() => toRawMail(null, me), /shape changed/);
});
test("sinceQuery uses epoch seconds", () => {
  assert.equal(
    sinceQuery(new Date("2026-10-13T00:00:00Z")),
    "after:1791849600",
  );
  assert.equal(
    sinceQuery(new Date("2026-10-13T00:00:00.900Z")),
    "after:1791849600",
  );
  assert.equal(
    sinceQuery(new Date("2026-10-13T00:00:00Z"), 'Job "Applications"'),
    'after:1791849600 label:"Job Applications"',
    "a label is quoted, its own quotes dropped",
  );
});

type Call = { url: URL; method: string; headers: Headers; body: string };
const json = (body: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const grant = (call: Call) =>
  call.url.host === "oauth2.googleapis.com"
    ? json({ access_token: "access-1", expires_in: 3599 })
    : null;
function fake(route: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetcher = (async (input: any, init: any = {}) => {
    assert.ok(init.signal instanceof AbortSignal, "every request can time out");
    const call = {
      url: new URL(String(input)),
      method: init.method ?? "GET",
      headers: new Headers(init.headers),
      body: String(init.body ?? ""),
    };
    calls.push(call);
    return route(call);
  }) as typeof fetch;
  return { calls, fetcher };
}
const token = {
  refreshToken: "refresh-1",
  email: me,
  connectedAt: "2026-10-13T00:00:00.000Z",
};
const mailbox = (calls: Call[]) =>
  calls.filter((call) => call.url.host === "gmail.googleapis.com");
// Stands in for the wait between attempts and records what was asked for.
function naps() {
  const slept: number[] = [];
  return { slept, sleep: async (ms: number) => void slept.push(ms) };
}
const backoff = [2000, 4000, 8000, 16000];

test("list follows nextPageToken and only ever reads", async () => {
  const { calls, fetcher } = fake(
    (call) =>
      grant(call) ??
      json(
        call.url.searchParams.get("pageToken") === "p2"
          ? { messages: [{ id: "c", threadId: "t2" }] }
          : {
              messages: [
                { id: "a", threadId: "t1" },
                { id: "b", threadId: "t1" },
              ],
              nextPageToken: "p2",
            },
      ),
  );
  const client = await gmailClient({ fetch: fetcher, token });
  assert.deepEqual(await client.list("after:1791849600"), [
    { id: "a", threadId: "t1" },
    { id: "b", threadId: "t1" },
    { id: "c", threadId: "t2" },
  ]);
  assert.deepEqual(await client.list("after:1"), [
    { id: "a", threadId: "t1" },
    { id: "b", threadId: "t1" },
    { id: "c", threadId: "t2" },
  ]);
  const [exchange, first, second] = calls;
  assert.equal(exchange.method, "POST");
  assert.equal(exchange.url.href, "https://oauth2.googleapis.com/token");
  assert.deepEqual(Object.fromEntries(new URLSearchParams(exchange.body)), {
    grant_type: "refresh_token",
    refresh_token: "refresh-1",
    client_id: "test-client",
    client_secret: "test-secret",
  });
  assert.equal(
    first.url.pathname,
    "/gmail/v1/users/me/messages",
    "list endpoint",
  );
  assert.equal(first.url.searchParams.get("q"), "after:1791849600");
  assert.equal(first.url.searchParams.get("pageToken"), null);
  assert.equal(second.url.searchParams.get("pageToken"), "p2");
  assert.equal(first.headers.get("authorization"), "Bearer access-1");
  assert.equal(calls.length, 5, "the access token is reused until it expires");
  assert.ok(mailbox(calls).every((call) => call.method === "GET"));
  assert.ok(mailbox(calls).every((call) => call.body === ""));
});
test("an empty mailbox lists nothing", async () => {
  const { fetcher } = fake(
    (call) => grant(call) ?? json({ resultSizeEstimate: 0 }),
  );
  const client = await gmailClient({ fetch: fetcher, token });
  assert.deepEqual(await client.list("after:1"), []);
});
const toGmail = (input: { from: string; body: string }) =>
  message({
    headers: [
      { name: "From", value: input.from },
      { name: "Subject", value: "Re: Interview" },
    ],
    ...text("text/plain", input.body),
  });
test("get fetches the full message and parses it against the connected address", async () => {
  const { calls, fetcher } = fake(
    (call) =>
      grant(call) ??
      json(
        toGmail({
          from: `Arinze <${me}>`,
          body: "Thank you, I confirm the slot.",
        }),
      ),
  );
  const client = await gmailClient({ fetch: fetcher, token });
  const mail = await client.get("m/7");
  assert.equal(mail.fromMe, true);
  assert.equal(mail.bodyText, "Thank you, I confirm the slot.");
  const [request] = mailbox(calls);
  assert.equal(request.url.pathname, "/gmail/v1/users/me/messages/m%2F7");
  assert.equal(request.url.searchParams.get("format"), "full");
  assert.equal(request.method, "GET");
  const empty = fake((call) => grant(call) ?? json({}));
  await assert.rejects(
    (await gmailClient({ fetch: empty.fetcher, token })).get("m1"),
    /shape changed/,
  );
});
test("get downloads a small invite.ics attachment as calendar", async () => {
  const invite =
    "BEGIN:VCALENDAR\nDTSTART;TZID=UTC:20261103T103000\nEND:VCALENDAR";
  const { calls, fetcher } = fake(
    (call) =>
      grant(call) ??
      (call.url.pathname.endsWith("/attachments/a1")
        ? json({ size: invite.length, data: b64(invite) })
        : json(
            message({
              mimeType: "multipart/mixed",
              parts: [
                text("text/plain", "This is a Microsoft Teams meeting."),
                {
                  mimeType: "text/calendar",
                  filename: "invite.ics",
                  body: { attachmentId: "a1", size: 300 },
                },
                {
                  mimeType: "application/pdf",
                  filename: "brochure.pdf",
                  body: { attachmentId: "a2", size: 300 },
                },
              ],
            }),
          )),
  );
  const mail = await (await gmailClient({ fetch: fetcher, token })).get("m1");
  assert.equal(mail.calendar, invite);
  assert.equal(mail.bodyText, "This is a Microsoft Teams meeting.");
  assert.deepEqual(
    mailbox(calls).map((call) => call.url.pathname),
    [
      "/gmail/v1/users/me/messages/m1",
      "/gmail/v1/users/me/messages/m1/attachments/a1",
    ],
    "only the calendar attachment is downloaded",
  );
});
test("get leaves a large calendar attachment alone", async () => {
  const { calls, fetcher } = fake(
    (call) =>
      grant(call) ??
      json(
        message({
          mimeType: "multipart/mixed",
          parts: [
            text("text/plain", "Hi"),
            {
              mimeType: "text/calendar",
              filename: "year.ics",
              body: { attachmentId: "a1", size: 500000 },
            },
          ],
        }),
      ),
  );
  const mail = await (await gmailClient({ fetch: fetcher, token })).get("m1");
  assert.equal("calendar" in mail, false);
  assert.equal(mailbox(calls).length, 1);
});
test("a rejected token raises MailAuthError", async () => {
  const unauthorized = fake(
    (call) =>
      grant(call) ??
      json({ error: { code: 401, message: "Invalid Credentials" } }, 401, {}),
  );
  const { slept, sleep } = naps();
  await assert.rejects(
    (await gmailClient({ fetch: unauthorized.fetcher, token, sleep })).list(
      "x",
    ),
    MailAuthError,
  );
  assert.equal(mailbox(unauthorized.calls).length, 1, "a 401 is not retried");
  const revoked = fake(() =>
    json(
      {
        error: "invalid_grant",
        error_description: "Token has been expired or revoked.",
      },
      400,
    ),
  );
  const client = await gmailClient({ fetch: revoked.fetcher, token, sleep });
  await assert.rejects(client.get("m1"), (error) => {
    assert.ok(error instanceof MailAuthError);
    assert.match(error.message, /expired or revoked/);
    assert.ok(!error.message.includes("refresh-1"));
    return true;
  });
  assert.equal(mailbox(revoked.calls).length, 0);
  assert.equal(revoked.calls.length, 1, "invalid_grant is not retried");
  assert.deepEqual(slept, []);
});
test("no stored token raises MailAuthError before any request", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jobdesk-gmail-"));
  process.env.GMAIL_TOKEN_PATH = join(dir, "missing.json");
  try {
    const { calls, fetcher } = fake(() => json({}));
    await assert.rejects(gmailClient({ fetch: fetcher }), MailAuthError);
    assert.equal(calls.length, 0);
  } finally {
    delete process.env.GMAIL_TOKEN_PATH;
    await rm(dir, { recursive: true, force: true });
  }
});
test("rate limits and server errors raise MailProviderError with Retry-After", async () => {
  const failing = async (response: () => Response) => {
    const { fetcher } = fake((call) => grant(call) ?? response());
    const client = await gmailClient({
      fetch: fetcher,
      token,
      sleep: async () => {},
    });
    return client.list("x").then(
      () => assert.fail("expected a failure"),
      (error) => error,
    );
  };
  const limited = await failing(() =>
    json({ error: { code: 429 } }, 429, { "Retry-After": "30" }),
  );
  assert.ok(limited instanceof MailProviderError);
  assert.equal(limited.retryAfterSeconds, 30);
  const down = await failing(() => new Response("upstream", { status: 503 }));
  assert.ok(down instanceof MailProviderError);
  assert.equal(down.retryAfterSeconds, undefined);
  const quota = await failing(() =>
    json(
      {
        error: {
          code: 403,
          message: "User-rate limit exceeded.",
          errors: [{ reason: "userRateLimitExceeded" }],
        },
      },
      403,
    ),
  );
  assert.ok(quota instanceof MailProviderError);
  const missing = await failing(() => json({ error: { code: 404 } }, 404));
  assert.ok(!(missing instanceof MailProviderError));
  assert.ok(!(missing instanceof MailAuthError));
  assert.match(missing.message, /HTTP 404/);
});
test("429 is retried after the Retry-After wait", async () => {
  const answers = [
    () => json({ error: { code: 429 } }, 429, { "Retry-After": "3" }),
    () => json({ error: { code: 429 } }, 429, { "Retry-After": "600" }),
    () => json({ messages: [{ id: "a", threadId: "t1" }] }),
  ];
  const { calls, fetcher } = fake((call) => grant(call) ?? answers.shift()!());
  const { slept, sleep } = naps();
  const client = await gmailClient({ fetch: fetcher, token, sleep });
  assert.deepEqual(await client.list("x"), [{ id: "a", threadId: "t1" }]);
  assert.deepEqual(slept, [3000, 60000], "Retry-After, capped at a minute");
  assert.equal(mailbox(calls).length, 3);
  assert.equal(calls.length, 4, "the access token is not exchanged again");
});
test("five failures in a row end in MailProviderError", async () => {
  const run = async (response: () => Response) => {
    const { calls, fetcher } = fake((call) => grant(call) ?? response());
    const { slept, sleep } = naps();
    const client = await gmailClient({ fetch: fetcher, token, sleep });
    const error = await client.get("m1").then(
      () => assert.fail("expected a failure"),
      (error) => error,
    );
    return { error, slept, attempts: mailbox(calls).length };
  };
  const down = await run(() => new Response("upstream", { status: 503 }));
  assert.ok(down.error instanceof MailProviderError);
  assert.equal(down.error.retryAfterSeconds, undefined);
  assert.equal(down.attempts, 5);
  assert.deepEqual(down.slept, backoff);
  const limited = await run(() =>
    json({ error: { code: 429 } }, 429, { "Retry-After": "30" }),
  );
  assert.ok(limited.error instanceof MailProviderError);
  assert.equal(limited.error.retryAfterSeconds, 30);
  assert.equal(limited.attempts, 5);
  assert.deepEqual(limited.slept, [30000, 30000, 30000, 30000]);
  const quota = await run(() =>
    json({ error: { errors: [{ reason: "rateLimitExceeded" }] } }, 403),
  );
  assert.ok(quota.error instanceof MailProviderError);
  assert.equal(quota.attempts, 5, "a 403 rate limit is retried like a 429");
  assert.deepEqual(
    quota.slept,
    [60000, 60000, 60000, 60000],
    "the per-minute quota is waited out",
  );
  const perMinute = await run(() =>
    json(
      {
        error: {
          message:
            "Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user' of service 'gmail.googleapis.com'",
        },
      },
      403,
    ),
  );
  assert.ok(perMinute.error instanceof MailProviderError);
  assert.equal(perMinute.attempts, 5, "recognised by its message as well");
  const forbidden = await run(() =>
    json({ error: { errors: [{ reason: "insufficientPermissions" }] } }, 403),
  );
  assert.ok(!(forbidden.error instanceof MailProviderError));
  assert.equal(forbidden.attempts, 1, "other 4xx are not retried");
  assert.deepEqual(forbidden.slept, []);
});
test("a 404 is not retried and a missing message has its own error", async () => {
  const { calls, fetcher } = fake(
    (call) =>
      grant(call) ?? json({ error: { code: 404, message: "Not Found" } }, 404),
  );
  const { slept, sleep } = naps();
  const client = await gmailClient({ fetch: fetcher, token, sleep });
  await assert.rejects(client.get("gone"), (error) => {
    assert.ok(error instanceof MailNotFoundError);
    assert.match(error.message, /HTTP 404/);
    return true;
  });
  assert.equal(mailbox(calls).length, 1);
  await assert.rejects(client.list("x"), (error) => {
    assert.ok(!(error instanceof MailNotFoundError));
    assert.match((error as Error).message, /HTTP 404/);
    return true;
  });
  assert.equal(mailbox(calls).length, 2);
  assert.deepEqual(slept, []);
});
test("network errors and timeouts are retried, then surface unchanged", async () => {
  const dropped = new TypeError("fetch failed");
  const timedOut = new DOMException("timed out", "TimeoutError");
  const failures = [dropped, timedOut];
  const flaky = fake((call) => {
    const granted = grant(call);
    if (granted) return granted;
    const failure = failures.shift();
    if (failure) throw failure;
    return json(toGmail({ from: "a@b.de", body: "Hi" }));
  });
  const first = naps();
  const client = await gmailClient({
    fetch: flaky.fetcher,
    token,
    sleep: first.sleep,
  });
  assert.equal((await client.get("m1")).bodyText, "Hi");
  assert.deepEqual(first.slept, [2000, 4000]);
  const dead = fake((call) => {
    const granted = grant(call);
    if (granted) return granted;
    throw timedOut;
  });
  const second = naps();
  await assert.rejects(
    (
      await gmailClient({ fetch: dead.fetcher, token, sleep: second.sleep })
    ).list("x"),
    (error) => error === timedOut,
  );
  assert.equal(mailbox(dead.calls).length, 5);
  assert.deepEqual(second.slept, backoff);
});
test("the token endpoint is retried on 5xx", async () => {
  let failures = 2;
  const { calls, fetcher } = fake((call) =>
    call.url.host !== "oauth2.googleapis.com"
      ? json({})
      : failures-- > 0
        ? new Response("unavailable", { status: 503 })
        : json({ access_token: "access-1", expires_in: 3599 }),
  );
  const { slept, sleep } = naps();
  const client = await gmailClient({ fetch: fetcher, token, sleep });
  assert.deepEqual(await client.list("x"), []);
  assert.equal(calls.length - mailbox(calls).length, 3);
  assert.equal(mailbox(calls).length, 1);
  assert.deepEqual(slept, [2000, 4000]);
});
test("retries keep their place in the limit of 5", async () => {
  const seen = new Set<string>();
  const open = new Set<string>();
  let peak = 0;
  const { fetcher } = fake(async (call) => {
    const granted = grant(call);
    if (granted) return granted;
    const id = call.url.pathname;
    open.add(id);
    peak = Math.max(peak, open.size);
    await new Promise((resolve) => setTimeout(resolve, 2));
    if (!seen.has(id)) {
      seen.add(id);
      return json({ error: { code: 429 } }, 429, { "Retry-After": "1" });
    }
    open.delete(id);
    return json(toGmail({ from: "a@b.de", body: "Hi" }));
  });
  const client = await gmailClient({
    fetch: fetcher,
    token,
    sleep: () => new Promise((resolve) => setTimeout(resolve, 2)),
    minGapMs: 0,
  });
  const mails = await Promise.all(
    Array.from({ length: 17 }, (_, i) => client.get(`m${i}`)),
  );
  assert.equal(mails.length, 17);
  assert.equal(peak, 5, "a message waiting to retry still holds its slot");
});
test("an expired access token is exchanged again", async () => {
  const { calls, fetcher } = fake((call) =>
    call.url.host === "oauth2.googleapis.com"
      ? json({ access_token: "short", expires_in: 30 })
      : json({}),
  );
  const client = await gmailClient({ fetch: fetcher, token });
  await client.list("x");
  await client.list("x");
  assert.equal(calls.length - mailbox(calls).length, 2);
});
test("get runs at most 5 requests at a time", async () => {
  let active = 0;
  let peak = 0;
  const { calls, fetcher } = fake(async (call) => {
    const granted = grant(call);
    if (granted) return granted;
    peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return json(toGmail({ from: "a@b.de", body: "Hi" }));
  });
  const client = await gmailClient({ fetch: fetcher, token, minGapMs: 0 });
  const mails = await Promise.all(
    Array.from({ length: 17 }, (_, i) => client.get(`m${i}`)),
  );
  assert.equal(mails.length, 17);
  assert.equal(peak, 5);
  assert.equal(calls.length - mailbox(calls).length, 1);
});
test("mailbox requests start at least the minimum gap apart", async () => {
  const starts: number[] = [];
  const { fetcher } = fake(async (call) => {
    const granted = grant(call);
    if (granted) return granted;
    starts.push(Date.now());
    return json(toGmail({ from: "a@b.de", body: "Hi" }));
  });
  const client = await gmailClient({ fetch: fetcher, token, minGapMs: 20 });
  await Promise.all(Array.from({ length: 4 }, (_, i) => client.get(`m${i}`)));
  assert.equal(starts.length, 4);
  for (let i = 1; i < starts.length; i++)
    assert.ok(starts[i] - starts[i - 1] >= 18, `gap ${i} was too short`);
});
test("the token file round trips with mode 0600", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jobdesk-gmail-"));
  const path = join(dir, ".data", "gmail-token.json");
  process.env.GMAIL_TOKEN_PATH = path;
  try {
    assert.equal(await readToken(), null);
    await writeToken(token);
    assert.deepEqual(await readToken(), token);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    await chmod(path, 0o644);
    await writeToken({ ...token, refreshToken: "refresh-2" });
    assert.equal((await readToken())?.refreshToken, "refresh-2");
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    await writeFile(path, "not json");
    assert.equal(await readToken(), null);
  } finally {
    delete process.env.GMAIL_TOKEN_PATH;
    await rm(dir, { recursive: true, force: true });
  }
});
test("the consent URL asks for read-only offline access with PKCE", () => {
  const url = new URL(
    consentUrl({
      clientId: "test-client",
      redirectUri: "http://127.0.0.1:51234",
      state: "state-1",
      challenge: "challenge-1",
    }),
  );
  assert.equal(
    url.origin + url.pathname,
    "https://accounts.google.com/o/oauth2/v2/auth",
  );
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    client_id: "test-client",
    redirect_uri: "http://127.0.0.1:51234",
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    access_type: "offline",
    prompt: "consent",
    state: "state-1",
    code_challenge: "challenge-1",
    code_challenge_method: "S256",
  });
});
test("exchangeCode stores nothing but a read-only grant", async () => {
  const input = {
    code: "code-1",
    verifier: "verifier-1",
    redirectUri: "http://127.0.0.1:51234",
    clientId: "test-client",
    clientSecret: "test-secret",
  };
  const google = (scope: string | undefined, refresh = true) =>
    fake((call) =>
      call.url.host === "oauth2.googleapis.com"
        ? json({
            access_token: "access-1",
            expires_in: 3599,
            scope,
            ...(refresh ? { refresh_token: "refresh-1" } : {}),
          })
        : json({ emailAddress: "Arinze@Example.com", messagesTotal: 9 }),
    );
  const ok = google(gmailScope);
  const stored = await exchangeCode({ ...input, fetch: ok.fetcher });
  assert.equal(stored.refreshToken, "refresh-1");
  assert.equal(stored.email, me);
  assert.ok(!Number.isNaN(Date.parse(stored.connectedAt)));
  assert.deepEqual(Object.fromEntries(new URLSearchParams(ok.calls[0].body)), {
    grant_type: "authorization_code",
    code: "code-1",
    code_verifier: "verifier-1",
    redirect_uri: "http://127.0.0.1:51234",
    client_id: "test-client",
    client_secret: "test-secret",
  });
  assert.equal(ok.calls[1].url.pathname, "/gmail/v1/users/me/profile");
  assert.equal(ok.calls[1].method, "GET");
  assert.equal(ok.calls[1].headers.get("authorization"), "Bearer access-1");
  for (const scope of [
    `${gmailScope} https://www.googleapis.com/auth/gmail.modify`,
    "https://mail.google.com/",
    "",
    undefined,
  ]) {
    const wide = google(scope);
    await assert.rejects(
      exchangeCode({ ...input, fetch: wide.fetcher }),
      /read-only/,
    );
    assert.equal(wide.calls.length, 1, "no mailbox request on a refused grant");
  }
  await assert.rejects(
    exchangeCode({ ...input, fetch: google(gmailScope, false).fetcher }),
    /refresh token/,
  );
  let failures = 1;
  const flaky = fake((call) =>
    call.url.host === "oauth2.googleapis.com"
      ? json({
          access_token: "access-1",
          scope: gmailScope,
          refresh_token: "refresh-1",
        })
      : failures-- > 0
        ? new Response("unavailable", { status: 502 })
        : json({ emailAddress: me }),
  );
  const { slept, sleep } = naps();
  const again = await exchangeCode({ ...input, fetch: flaky.fetcher, sleep });
  assert.equal(again.email, me);
  assert.deepEqual(slept, [2000]);
});
