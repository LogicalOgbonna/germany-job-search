# LinkedIn sync: messages and connections

Date: 28 October 2026. Status: approved design, not yet implemented.

## Goal

Bring the member's own LinkedIn data into Jobdesk, read-only:

1. LinkedIn messages from recruiters and companies keep application cards current, exactly as Gmail does.
2. Every job and application shows which first-degree connections work at that company, with a one-click way to save one as a referral contact.

Out of scope: Easy Apply history, saved jobs, job alerts, sending messages, posting, people search. LinkedIn offers no API for sending messages or searching people to a self-serve app, and Jobdesk never automates the LinkedIn website.

## Source

The "JobDesk Data" developer app with the Member Data Portability API (Member) product, scope `r_dma_portability_self_serve`, token in `.data/linkedin-data-token.json` (written by `npm run linkedin:connect -- --data`). Tokens last 60 days and cannot be refreshed programmatically.

Two endpoints, both `LinkedIn-Version: 202312`:

- `GET /rest/memberSnapshotData?q=criteria&domain=<DOMAIN>&start=<n>`: full history per domain, paged; a page past the end answers 404. Domains used: `INBOX`, `CONNECTIONS`.
- `GET /rest/memberChangeLogs?q=memberAndApplication&startTime=<ms>&count=<n>`: activity since consent, last 28 days; message events have `resourceName: "messages"`.

How quickly the snapshot reflects new messages is not documented. The changelog is the fast path; the snapshot is the daily catch-up.

## Approach

LinkedIn messages enter the existing mail pipeline (`processMessage` in `src/lib/mail/store.ts`) as `RawMail`. No second classifier, review list or timeline is built. Connections get one new table and a lookup used by the job and application views.

## Units

### `src/lib/linkedin/data.ts`: API client

- `snapshot(domain)`: all pages of one domain; stops at the first 404 after page 0. A 404 on page 0 means "not ready yet" and returns `null`.
- `changes(since)`: changelog events since `since`, paged with `count=10` and `startTime` advanced to the latest `processedAt`, as LinkedIn recommends.
- A 401 throws `LinkedinAuthError`; the sync records "Reconnect LinkedIn: run npm run linkedin:connect -- --data". 429 and 5xx retry with backoff (same policy as the Gmail client) and then throw.
- Only GET requests, except the documented empty `POST /rest/memberAuthorizations` that `linkedin:connect` already makes.

### `src/lib/linkedin/messages.ts`: messages to `RawMail`

Pure functions:

- `fromSnapshot(row, me)` and `fromChangelog(event, me)` return `RawMail | null`.
  - `gmailId`: `linkedin:` + sha256 of conversation id, sender, timestamp floored to the second, and content. The same message read from either source gets the same id, so `MailMessage.gmailId @unique` prevents duplicates.
  - `threadId`: `linkedin:` + conversation id (the changelog thread URN is reduced to the same id as the snapshot's `CONVERSATION ID`).
  - `fromAddress`: the sender's LinkedIn profile URL, lower case. `fromName`: sender name.
  - `subject`: conversation title, else subject, else `LinkedIn message from <name>`.
  - `bodyText`: content with HTML removed, at most 20,000 characters.
  - `fromMe`: sender is the member. `bulk`: false.
  - Returns `null` for folders other than `INBOX` and `ARCHIVE`, for empty content, and for the member's own messages.
- `withinWindow(mail, since)`: first run reads the last 30 days; later runs read from `lastSuccessAt` minus 1 hour.

### Company for a LinkedIn sender

Mail matching requires the sender to confirm the company (a hiring-system or employer address). A LinkedIn profile URL is neither. A LinkedIn message counts as confirmed only when the sender is a stored connection whose `company` matches the candidate card's company (same normalisation as the mail matcher). Otherwise the message goes to Needs review with reason "LinkedIn sender's company is unknown". This is implemented as one extra confirmation path in the matcher, keyed on the `linkedin:` id prefix.

### `LinkedinConnection` table and `src/lib/linkedin/connections.ts`

```
model LinkedinConnection {
  id          String   @id @default(cuid())
  profileUrl  String   @unique
  name        String
  company     String   @default("")
  companyKey  String   @default("")   // normalised, indexed
  position    String   @default("")
  email       String   @default("")
  connectedOn DateTime?
  updatedAt   DateTime @updatedAt
  @@index([companyKey])
}
```

- `refreshConnections(rows)`: upsert by `profileUrl`; delete rows absent from a complete snapshot.
- `connectionsAt(company)`: matches by `companyKey`, including the leading-word rule already used for company names (a key matches when one is the other followed by a space and more words). Ordered: engineering roles, then engineering managers and founders, then recruiters, then others.

### Sync and worker

- `LinkedinSync` row (id `linkedin`): `nextRunAt`, `leaseUntil`, `lastCheckedAt`, `lastSuccessAt`, `lastSnapshotAt`, `lastError`, same lease pattern as `MailSync`.
- `syncLinkedin()`: every hour, changelog messages since `lastSuccessAt`; once a day (or on first run), snapshot `INBOX` within the window and `CONNECTIONS`. Messages go through `processMessage` oldest first with the same AI classifier settings as mail. Counters are returned like `syncMail`.
- Scheduled runs need a stored data token and the mail pipeline being live (`mailLive()`), because LinkedIn messages change cards through the same rules.
- `scripts/worker.ts`: the tick queues `linkedin-sync` when due. `npm run linkedin:sync` runs one check by hand.

### UI

- Job detail and application card: "You know N people here" with name, position and profile link; "Add as referral contact" creates a `Referral` on that job (`sourceKind: "linkedin_connection"`, `sourceUrl` = profile URL, `linkedin` = profile URL, title = position) through the existing referrals store, so duplicate and do-not-contact checks apply.
- Overview: a LinkedIn line with last check, counts and any error, next to the Gmail line.
- Timeline entries for LinkedIn messages say "LinkedIn message" and link to `https://www.linkedin.com/messaging/thread/<conversation id>/` instead of Gmail. If that link format does not open the thread, they link to the sender's profile instead.

## Data and privacy

LinkedIn data is stored only in PostgreSQL and `.data/`. Message text reaches the Claude API under the existing mail rules (unclassifiable messages and second readings). Nothing is committed to git. Jobdesk sends nothing to LinkedIn and posts nothing.

## Errors

- Snapshot not ready (404 on page 0): skip that domain this run, retry next day, no error shown.
- Token expired or revoked: sync stops, `lastError` shows the reconnect command; mail sync is unaffected.
- A message that cannot be converted is counted as `failed` and skipped; the run continues.
- Token expiry within 14 days: overview warning.

## Testing

- Unit: `fromSnapshot`/`fromChangelog` field mapping, identical ids for the same message from both sources, folder and own-message filtering, 30-day window, thread URN reduction; `connectionsAt` normalisation and ordering; client paging and 404/401/429 handling with a fake fetch.
- Integration (synthetic records, removed afterwards): a fake LinkedIn client feeding a rejection from a known connection updates the matching card; the same message from an unknown sender goes to review; re-running stores nothing twice; "Add as referral contact" creates one referral.
- Live: one `npm run linkedin:sync` against the member's account, reporting counts only.
