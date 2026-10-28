import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { plain } from "../connectors";
import type { MailClient, RawMail } from "./types";

// Read-only by construction: this is the only scope ever requested, and every
// mailbox request below is a GET.
export const gmailScope = "https://www.googleapis.com/auth/gmail.readonly";
const authEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
const api = "https://gmail.googleapis.com/gmail/v1/users/me";

export const tokenPath =
  process.env.GMAIL_TOKEN_PATH ??
  join(process.cwd(), ".data", "gmail-token.json");
// Looked up on every call so tests can point at a temp directory.
const tokenFile = () => process.env.GMAIL_TOKEN_PATH ?? tokenPath;

export type StoredToken = {
  refreshToken: string;
  email: string;
  connectedAt: string;
};
export async function readToken(): Promise<StoredToken | null> {
  try {
    const token = JSON.parse(await readFile(tokenFile(), "utf8"));
    return typeof token?.refreshToken === "string" &&
      typeof token.email === "string"
      ? {
          refreshToken: token.refreshToken,
          email: token.email,
          connectedAt: String(token.connectedAt ?? ""),
        }
      : null;
  } catch {
    return null;
  }
}
export async function writeToken(token: StoredToken): Promise<void> {
  const path = tokenFile();
  await mkdir(dirname(path), { recursive: true });
  // A fresh file, so the mode holds even when an older token file was readable by others.
  const draft = `${path}.${process.pid}.tmp`;
  await rm(draft, { force: true });
  await writeFile(draft, `${JSON.stringify(token, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  await rename(draft, path);
}

// Thrown when Google rejects the refresh token or none is stored. store.ts shows "Reconnect Gmail".
export class MailAuthError extends Error {
  name = "MailAuthError";
}
// Thrown by `get` when the message no longer exists (deleted between listing and reading).
export class MailNotFoundError extends Error {
  name = "MailNotFoundError";
}
// Thrown for 429 and 5xx once the retries are used up; carries the Retry-After seconds when present.
export class MailProviderError extends Error {
  name = "MailProviderError";
  constructor(
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

function decode(bytes: Uint8Array, charset: string) {
  try {
    return new TextDecoder(charset || "utf-8").decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}
const encodedWord = /=\?([^?\s]+)\?([bq])\?([^?\s]*)\?=/gi;
// RFC 2047 headers such as "=?UTF-8?Q?Gespr=C3=A4ch?=".
function decodeWords(value: string) {
  return (
    value
      // Whitespace between two encoded words is not part of the text.
      .replace(/\?=\s+(?==\?[^?\s]+\?[bq]\?[^?\s]*\?=)/gi, "?=")
      .replace(/(?:=\?[^?\s]+\?[bq]\?[^?\s]*\?=)+/gi, (run) => {
        // Senders split multi-byte characters across words, so bytes are joined before decoding.
        let out = "";
        let charset = "";
        let bytes: Buffer[] = [];
        const flush = () => {
          if (bytes.length) out += decode(Buffer.concat(bytes), charset);
          bytes = [];
        };
        for (const [, label, encoding, text] of run.matchAll(encodedWord)) {
          const name = label.split("*")[0].toLowerCase();
          if (name !== charset) flush();
          charset = name;
          bytes.push(
            encoding.toLowerCase() === "b"
              ? Buffer.from(text, "base64")
              : Buffer.from(
                  text
                    .replace(/_/g, " ")
                    .replace(/=([0-9a-f]{2})/gi, (_, hex) =>
                      String.fromCharCode(parseInt(hex, 16)),
                    ),
                  "latin1",
                ),
          );
        }
        flush();
        return out;
      })
  );
}
function parseFrom(raw: string) {
  const angle = raw.match(/^(.*)<([^<>\s]+)>[^<>]*$/s);
  if (!angle)
    return {
      address: raw
        .replace(/\(.*?\)/g, "")
        .trim()
        .toLowerCase(),
      name: "",
    };
  return {
    address: angle[2].toLowerCase(),
    name: decodeWords(
      angle[1]
        .trim()
        .replace(/^"(.*)"$/s, "$1")
        .replace(/\\(.)/g, "$1"),
    )
      .replace(/\s+/g, " ")
      .trim(),
  };
}
const tidy = (text: string) =>
  text
    .replace(/\r\n?/g, "\n")
    // NUL (Postgres refuses it) and the invisible padding of preview lines.
    .replace(/[\u0000­͏​-‍⁠﻿]/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
function content(payload: any) {
  const found: Record<string, string[]> = { "text/plain": [], "text/html": [] };
  let calendar: string | undefined;
  const read = (part: any) => {
    const declared = (part.headers ?? []).find(
      (h: any) => String(h?.name).toLowerCase() === "content-type",
    )?.value;
    return decode(
      Buffer.from(part.body.data, "base64url"),
      /charset="?([^";\s]+)/i.exec(declared ?? "")?.[1] ?? "utf-8",
    );
  };
  const walk = (part: any) => {
    if (!part) return;
    const type = String(part.mimeType ?? "").toLowerCase();
    const data = typeof part.body?.data === "string";
    // Invitations arrive as an inline text/calendar part or a small invite.ics attachment.
    if (/^(?:text\/calendar|application\/ics)$/.test(type) && data)
      calendar ??= read(part).slice(0, 100000);
    if (part.filename) return;
    if (found[type] && data) found[type].push(read(part));
    for (const child of Array.isArray(part.parts) ? part.parts : [])
      walk(child);
  };
  walk(payload);
  const text =
    tidy(found["text/plain"].join("\n")) ||
    tidy(found["text/html"].map(plain).join("\n"));
  return {
    bodyText: text
      .slice(0, 20000)
      .replace(/[\ud800-\udbff]$/, "")
      .trimEnd(),
    ...(calendar === undefined ? {} : { calendar }),
  };
}
// The calendar part to download, when the message has no inline one. Over 100 kB is not an invitation.
function calendarAttachment(payload: any): any {
  const parts: any[] = [];
  const walk = (part: any) => {
    if (!part) return;
    if (
      /^(?:text\/calendar|application\/ics)$/i.test(String(part.mimeType ?? ""))
    )
      parts.push(part);
    for (const child of Array.isArray(part.parts) ? part.parts : [])
      walk(child);
  };
  walk(payload);
  if (parts.some((part) => typeof part.body?.data === "string")) return null;
  return (
    parts.find(
      (part) =>
        typeof part.body?.attachmentId === "string" &&
        Number(part.body.size) > 0 &&
        Number(part.body.size) <= 100000,
    ) ?? null
  );
}
// Pure. `message` is a Gmail API users.messages.get response with format=full.
export function toRawMail(message: unknown, myAddress: string): RawMail {
  const m = message as any;
  const headers: any[] = Array.isArray(m?.payload?.headers)
    ? m.payload.headers
    : [];
  const header = (name: string): string =>
    String(
      headers.find((h) => String(h?.name).toLowerCase() === name)?.value ?? "",
    );
  const received = Number(m?.internalDate) || Date.parse(header("date"));
  if (
    typeof m?.id !== "string" ||
    typeof m.threadId !== "string" ||
    !Number.isFinite(received)
  )
    throw new Error("Gmail message shape changed");
  const from = parseFrom(header("from"));
  const mine = myAddress.trim().toLowerCase();
  return {
    gmailId: m.id,
    threadId: m.threadId,
    fromAddress: from.address,
    fromName: from.name,
    subject: decodeWords(header("subject")).replace(/\s+/g, " ").trim(),
    receivedAt: new Date(received),
    fromMe:
      (mine !== "" && from.address === mine) ||
      (Array.isArray(m.labelIds) && m.labelIds.includes("SENT")),
    bulk:
      headers.some((h) =>
        /^list-(unsubscribe|id)$/i.test(String(h?.name).trim()),
      ) || /^(bulk|list)$/i.test(header("precedence").trim()),
    ...content(m.payload),
  };
}
// Gmail search query for mail received after `since` (epoch seconds form: "after:1760000000"),
// optionally only mail carrying one of your labels.
export function sinceQuery(since: Date, label?: string): string {
  const after = `after:${Math.floor(since.getTime() / 1000)}`;
  return label ? `${after} label:"${label.replace(/"/g, "")}"` : after;
}

type Io = { fetcher: typeof fetch; sleep: (ms: number) => Promise<void> };
const io = (options: { fetch?: typeof fetch; sleep?: Io["sleep"] }): Io => ({
  fetcher: options.fetch ?? fetch,
  sleep: options.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms))),
});
async function failure(response: Response, what: string): Promise<Error> {
  const body: any = await response.json().catch(() => null);
  // OAuth errors are { error: "invalid_grant", error_description }, API errors { error: { message, errors } }.
  const oauth = typeof body?.error === "string" ? body.error : "";
  const detail = oauth
    ? (body.error_description ?? oauth)
    : body?.error?.message;
  const message = `${what} returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`;
  if (response.status === 401 || oauth === "invalid_grant")
    return new MailAuthError(message);
  // Gmail reports its per-user, per-minute quota as a 403 without Retry-After.
  const perMinute =
    response.status === 403 &&
    (/rateLimitExceeded/i.test(body?.error?.errors?.[0]?.reason ?? "") ||
      /quota exceeded.*per minute/i.test(detail ?? ""));
  if (response.status === 429 || response.status >= 500 || perMinute) {
    const retry = response.headers.get("retry-after");
    const seconds = !retry
      ? // The quota window is a minute, so shorter waits only fail again.
        perMinute
        ? 60
        : NaN
      : /^\d+$/.test(retry)
        ? Number(retry)
        : Math.max(0, (Date.parse(retry) - Date.now()) / 1000);
    return new MailProviderError(
      message,
      Number.isFinite(seconds) ? seconds : undefined,
    );
  }
  return response.status === 404 && what === "Gmail message"
    ? new MailNotFoundError(message)
    : new Error(message);
}
const backoff = [2000, 4000, 8000, 16000];
// One JSON request. Rate limits, 5xx, network failures and timeouts get four more attempts,
// so one bad moment does not abort a long import; every other failure is final at once.
// `init` runs per attempt because a long wait can outlive the access token.
async function request(
  { fetcher, sleep }: Io,
  what: string,
  url: string,
  init: () => RequestInit | Promise<RequestInit>,
): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    const options = await init();
    let response: Response | null = null;
    let error: unknown;
    try {
      response = await fetcher(url, {
        ...options,
        signal: AbortSignal.timeout(20000),
        redirect: "error",
        cache: "no-store",
      });
      if (response.ok) return await response.json();
    } catch (thrown) {
      error = thrown;
    }
    if (response && !response.ok) {
      error = await failure(response, what);
      if (!(error instanceof MailProviderError)) throw error;
    }
    if (attempt >= backoff.length) throw error;
    const asked =
      error instanceof MailProviderError ? error.retryAfterSeconds : undefined;
    await sleep(
      asked === undefined ? backoff[attempt] : Math.min(asked, 60) * 1000,
    );
  }
}
async function grant(io: Io, params: Record<string, string>): Promise<any> {
  const body = await request(io, "Google sign-in", tokenEndpoint, () => ({
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  }));
  if (typeof body?.access_token !== "string")
    throw new Error("Google sign-in returned no access token");
  return body;
}
// The only way this module talks to the mailbox.
const read = (
  io: Io,
  path: string,
  accessToken: () => string | Promise<string>,
): Promise<any> =>
  request(
    io,
    /^\/messages\/[^/?]+\?/.test(path) ? "Gmail message" : "Gmail",
    `${api}${path}`,
    async () => ({
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${await accessToken()}`,
      },
    }),
  );

export function consentUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  return `${authEndpoint}?${new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: gmailScope,
    access_type: "offline",
    prompt: "consent",
    state: input.state,
    code_challenge: input.challenge,
    code_challenge_method: "S256",
  })}`;
}
// Second half of the sign-in. Throws instead of returning a token for anything but a read-only grant.
export async function exchangeCode(input: {
  code: string;
  verifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): Promise<StoredToken> {
  const google = io(input);
  const granted = await grant(google, {
    grant_type: "authorization_code",
    code: input.code,
    code_verifier: input.verifier,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    client_secret: input.clientSecret,
  });
  const scopes = String(granted.scope ?? "")
    .split(/\s+/)
    .filter(Boolean);
  if (scopes.length !== 1 || scopes[0] !== gmailScope)
    throw new Error(
      `Google granted "${scopes.join(" ")}" instead of read-only Gmail access. Nothing was stored.`,
    );
  if (typeof granted.refresh_token !== "string" || !granted.refresh_token)
    throw new Error("Google returned no refresh token. Nothing was stored.");
  const profile = await read(google, "/profile", () => granted.access_token);
  if (typeof profile?.emailAddress !== "string")
    throw new Error("Gmail profile shape changed");
  return {
    refreshToken: granted.refresh_token,
    email: profile.emailAddress.toLowerCase(),
    connectedAt: new Date().toISOString(),
  };
}

// Real client: exchanges the refresh token for an access token (cached until expiry),
// pages through users.messages.list, fetches with users.messages.get?format=full.
// The argument exists for tests.
export async function gmailClient(
  options: {
    fetch?: typeof fetch;
    token?: StoredToken;
    sleep?: (ms: number) => Promise<void>;
    minGapMs?: number;
  } = {},
): Promise<MailClient> {
  const google = io(options);
  const minGapMs = options.minGapMs ?? 60;
  const token = options.token ?? (await readToken());
  if (!token) throw new MailAuthError("Gmail is not connected");
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    throw new MailAuthError(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set",
    );
  let access: { value: string; expiresAt: number } | null = null;
  let pending: Promise<string> | null = null;
  const accessToken = () => {
    if (access && Date.now() < access.expiresAt)
      return Promise.resolve(access.value);
    pending ??= grant(google, {
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    })
      .then((granted) => {
        access = {
          value: granted.access_token,
          expiresAt:
            Date.now() + (Number(granted.expires_in) || 0) * 1000 - 60000,
        };
        return access.value;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
  // Requests start at least 60 ms apart: at most 1,000 a minute at 5 units each, under the
  // 6,000 units per user per minute Gmail allows this project, so a resume re-reading known
  // mail stays under the limit.
  let nextStart = 0;
  const pace = async () => {
    const wait = nextStart - Date.now();
    nextStart = Math.max(nextStart, Date.now()) + minGapMs;
    if (wait > 0) await new Promise((done) => setTimeout(done, wait));
  };
  const get = async (path: string) => {
    await pace();
    try {
      return await read(google, path, accessToken);
    } catch (error) {
      if (error instanceof MailAuthError) access = null;
      throw error;
    }
  };
  let active = 0;
  const waiting: (() => void)[] = [];
  return {
    async list(query) {
      const found: { id: string; threadId: string }[] = [];
      let pageToken = "";
      // 1,000 pages is 500,000 messages; more means the paging never ends.
      for (let page = 0; page < 1000; page++) {
        const params = new URLSearchParams({ q: query, maxResults: "500" });
        if (pageToken) params.set("pageToken", pageToken);
        const data = await get(`/messages?${params}`);
        if (data?.messages !== undefined && !Array.isArray(data.messages))
          throw new Error("Gmail response shape changed");
        for (const m of data?.messages ?? [])
          found.push({ id: String(m.id), threadId: String(m.threadId) });
        pageToken =
          typeof data?.nextPageToken === "string" ? data.nextPageToken : "";
        if (!pageToken) return found;
      }
      throw new Error("Gmail listing did not end");
    },
    async get(id) {
      // A finished request hands its slot to the next waiter, so the count never passes 5.
      // The slot is kept while a request waits to retry.
      if (active >= 5) await new Promise<void>((next) => waiting.push(next));
      else active++;
      try {
        const path = `/messages/${encodeURIComponent(id)}`;
        const message = await get(`${path}?format=full`);
        // Outlook and Teams send the invitation as an invite.ics attachment, which format=full
        // returns as an attachmentId only. Fetch the first small one so its time is read.
        const invite = calendarAttachment(message?.payload);
        if (invite) {
          const data = (
            await get(
              `${path}/attachments/${encodeURIComponent(invite.body.attachmentId)}`,
            )
          )?.data;
          if (typeof data === "string") invite.body.data = data;
        }
        return toRawMail(message, token.email);
      } finally {
        const next = waiting.shift();
        if (next) next();
        else active--;
      }
    },
  };
}
