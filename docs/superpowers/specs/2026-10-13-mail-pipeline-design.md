# Mail pipeline: application updates from Gmail

Status: design approved by Arinze on 13 October 2026. Implemented the same day; the section "Tightened after review" at the end overrides the text above where they differ.

## Goal

Jobdesk reads arinzeogbo@gmail.com, recognises mail about job applications, and keeps the board current: receipt confirmed, moved to the next stage, assessment set, interview invited, offer, rejected. Clear cases update the board on their own. Unclear cases go to a short review list. Nothing in the mailbox is ever changed.

## Decisions taken

| Question | Decision |
| --- | --- |
| Mail access | Gmail API, `gmail.readonly` scope, one-time Google sign-in |
| Autonomy | Auto-update when confident, review the rest, every automatic change can be undone |
| Classification | English and German rules first; Claude API only for mail the rules cannot settle |
| Unknown applications | Create a card from the email, going forward and back to 1 September 2025 |
| Acting on mail | "Action needed" list on the dashboard with next step and deadline; no push notifications |

## Out of scope

Replying to mail, booking interview slots, Telegram or other push alerts, mail accounts other than the one Gmail address, LinkedIn messages, and closing processes that have gone quiet.

## Approach

Mail is one more scheduled job in the existing BullMQ worker (`scripts/worker.ts`), checked every 10 minutes. Rejected alternatives: Gmail push notifications (needs Google Pub/Sub and a reachable endpoint, too much for a loopback app) and a separate cron script (would duplicate the worker's scheduling, lease and health handling).

## Flow

```
Gmail (read-only)
  -> fetch      new messages since the last check, stored once by Gmail ID
  -> classify   rules, then Claude for the undecided
  -> match      link to an application, or create a card from the email
  -> apply      move the card if confident and uniquely matched, else "Needs review"
```

Each stage is a module under `src/lib/mail/` with a pure core that is tested without Gmail, the database or the network.

### 1. Fetch (`gmail.ts`, `fetch.ts`)

- OAuth for installed apps: `npm run mail:connect` opens the Google consent page, receives the code on a loopback port, and stores the refresh token in `.data/gmail-token.json` with mode 0600. `.data/` is already git-ignored. Client ID and secret come from `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
- Each check lists messages with `q=after:<last check, minus a 1 hour overlap>` and keeps a message when at least one holds:
  - the sender is a known hiring system (Ashby, Greenhouse, Lever, Personio, Recruitee, Teamtailor, SmartRecruiters, Workable, JOIN, Workday, SuccessFactors, BambooHR, LinkedIn jobs);
  - the subject contains an application keyword in English or German (application, applying, Bewerbung, interview, assessment, candidacy and similar);
  - the sender's domain or display name matches a company with an application on the board;
  - the Gmail thread is already linked to an application.
- Kept messages are stored as `MailMessage` rows, unique on Gmail message ID, so repeated checks and the 1 hour overlap are harmless. Plain text is extracted from the body (HTML stripped with the existing `plain()` helper) and capped at 20,000 characters.
- Mail the user sent (`from:me`) inside a linked thread is stored as context for the thread but never classified.

### 2. Classify (`classify.ts`, `rules.ts`, `ai.ts`)

Categories:

| Category | Meaning | Effect on the card |
| --- | --- | --- |
| `confirmation` | Employer or hiring system acknowledges receipt | Attach as proof of submission |
| `rejection` | Not moving forward, position filled | Status `rejected` |
| `assessment` | Take-home task, coding test, online assessment, questionnaire | Status `assessment` |
| `interview` | Invitation, scheduling request, calendar invite, interview confirmation | Status `interview` |
| `offer` | Offer or contract | Status `offer` |
| `recruiter_question` | A person asks something that needs an answer | Status `response` |
| `notice` | GDPR and data-retention notices, talent-pool requests, candidate surveys, account verification, job alerts | None, stored as ignored |
| `unrelated` | Not about an application | None, stored as ignored |

Rules run first. Each rule has an ID, a category, patterns for subject and body in English and German, and a precision flag. Only rules marked high precision may lead to an automatic change. `notice` rules run before all others, because data notices often contain the words "your application".

When no rule decides, the subject, sender and body text go to the Claude API with a fixed instruction and a structured reply: category, confidence (`high`, `medium`, `low`), company, role, next step, deadline, and the exact sentence the verdict rests on. A verdict counts as confident only when confidence is `high` and the quoted sentence is found verbatim in the mail. The model is set by `MAIL_AI_MODEL` (default `claude-sonnet-5-5`); the key is `ANTHROPIC_API_KEY`. Without a key, or when the call fails, the mail goes to review.

The classifier also extracts, when present: company, role title, next step (one sentence), deadline (a date), and a scheduling link.

### 3. Match (`match.ts`)

In order:

1. The Gmail thread is already linked to an application.
2. Company match against applications on the board. Company evidence comes from the sender (`xolife-jobs@m.personio.de`, `aignostics.teamtailor-mail.com`, `jobs@envelio.de`), the sender display name, and the subject ("Thanks for applying to Peec AI"). Names are compared after normalising case, accents, legal suffixes (GmbH, AG, SE, Inc) and punctuation.
3. When a company has several applications, the role title in the subject or body picks one. If it does not, the match is ambiguous.
4. The mail must not be older than the application's `submittedAt`, less one day.

Outcomes: `unique`, `ambiguous` (review), or `none`. A `none` result on a `confirmation`, `rejection`, `assessment`, `interview`, `offer` or `recruiter_question` creates a card from the email (see Data model). A `none` result on anything else is stored and ignored.

### 4. Apply (`apply.ts`)

An automatic change needs both a confident classification and a unique match (or a newly created card). Everything else becomes `needs_review` with the best guess attached.

Stage order: `submitted` < `response` < `assessment` < `interview` < `offer`. Rules:

- A card only moves forward. Mail for an earlier stage is attached to the timeline without changing the status.
- `rejected` closes a card. Later positive mail on a rejected card goes to review instead of reopening it.
- `rejection` is the costly mistake, so it auto-applies only with a unique match and either a high-precision rule or a confident AI verdict. A rejection on an ambiguous match always goes to review.
- `confirmation` on a card already `submitted` or later only attaches the receipt. On a card still `queued` or `prepared` it sets `submitted` with the email as evidence and the email's date as `submittedAt`.
- `withdrawn` and `skipped` cards are never changed by mail; such mail goes to review.
- Next step and deadline are written only from mail less than 14 days old, and are cleared when a later mail moves the card to another stage or rejects it.

Each automatic change writes an `ApplicationEvent` linked to the `MailMessage`, in one serializable transaction, the same way `changeApplication` does today. Undo restores the status, next step and deadline recorded before that event, and returns the mail to `needs_review`.

## Data model

New enum-like values and fields (Prisma migration):

- `statuses` in `src/lib/domain.ts` gains `assessment` after `response`.
- `Application` gains `origin` (`jobdesk` default, or `email`), `nextStep String?`, `nextStepDueAt DateTime?`, `lastMailAt DateTime?`.
- `ApplicationEvent` gains `mailMessageId String?` and `previous Json?` (status, next step and deadline before the change, used by undo).
- New `MailMessage`: `gmailId` (unique), `threadId` (indexed), `fromAddress`, `fromName`, `subject`, `receivedAt`, `bodyText`, `category`, `confidence`, `decidedBy` (rule ID or `ai`), `evidenceQuote`, extracted `company`, `role`, `nextStep`, `deadline`, `applicationId?`, `matchReason`, `state` (`applied`, `attached`, `needs_review`, `ignored`), `createdAt`.
- New `MailSync` (single row): `lastCheckedAt`, `lastSuccessAt`, `lastError`, `leaseUntil`, plus counters for the last run. This mirrors `Source` so the Sources page can show mail health the same way.

Cards created from email need a `Job`, because `Application.jobId` is required. They use a `Source` of kind `mail` and a `Job` with `liveStatus: "unverified"`, the company and role from the mail ("Role not stated" when absent), the email text as description, and `canonicalKey` derived from the Gmail thread ID. They are excluded from Discover and from the daily goal: `src/app/api/dashboard/route.ts` counts only applications with `origin: "jobdesk"`.

## Dashboard

- **Card timeline:** mail events show category, subject, sender, date, the quoted evidence sentence, an "Open in Gmail" link (`https://mail.google.com/mail/u/0/#all/<threadId>`), and Undo for automatic changes.
- **Action needed (Today view):** applications with a `nextStep`, sorted by `nextStepDueAt`, undated last. Each has "Done", which clears the next step.
- **Needs review:** a list of `needs_review` mail with Jobdesk's guess. One action confirms or corrects the category and the application, or marks the mail as not relevant. Corrections are stored on the message so the back-test can count them.
- **Pipeline funnel:** gains an "Assessment" column.
- **Sources page:** a mail connection row with last check, last error, and a reconnect prompt when the Google token is rejected.

API: `GET /api/mail` (review list and connection health), `PATCH /api/mail/[id]` (confirm, correct, ignore, undo). Both go through the existing `checkMutation` and local-access guards.

## History import

`npm run mail:backfill` reads from 1 September 2025. It always runs in two steps:

1. Dry run: fetch, classify and match everything, store the `MailMessage` rows with their proposed outcome, change no application, and write a report (counts per category, auto-apply versus review versus ignored, cards that would be created, status each existing card would end on).
2. `npm run mail:backfill -- --apply` applies the stored proposals in date order after the user has read the report.

Mail older than 14 days never sets a next step, so January interview invitations do not appear under "Action needed".

## Failure handling

| Failure | Behaviour |
| --- | --- |
| Google token expired or revoked | `MailSync.lastError` is set, the Sources page shows "Reconnect Gmail", no data is lost, the next successful check resumes from `lastSuccessAt` |
| Gmail rate limit or 5xx | Retry on the next tick, respecting `Retry-After`; the check window is not advanced |
| Claude API missing, failing or returning an invalid reply | The mail goes to `needs_review` with `decidedBy: none` |
| Worker crash mid-check | Lease expires after 15 minutes, as for job sources; stored messages are not duplicated because of the unique Gmail ID |
| A rule is later found to be wrong | `npm run mail:reclassify` re-runs classification on stored messages; a different verdict on an already applied message goes to review instead of changing the card again |

## Privacy

- The Google scope is read-only. Jobdesk cannot send, delete, label or mark mail as read.
- Mail bodies are stored only in the local Postgres database. `/api/export` includes mail subjects, senders, dates and categories, not bodies.
- Only mail the rules cannot classify is sent to the Claude API. Mail classified as `notice` or `unrelated` by rules never leaves the machine.
- The refresh token lives in `.data/gmail-token.json`, outside the database and outside git.

## One-time setup by the user

1. Create a Google Cloud project, enable the Gmail API, configure the OAuth consent screen as External, and set its publishing status to "In production". Left in "Testing", Google expires the refresh token after 7 days. An unverified personal app shows a warning screen at sign-in; that is expected.
2. Create an OAuth client of type "Desktop app" and put its ID and secret in `.env`.
3. Run `npm run mail:connect` and approve read-only access.
4. Add `ANTHROPIC_API_KEY` to `.env`.

## Testing

- **Rules:** unit tests on English and German sample mails for every category, including the traps seen in the real mailbox: GDPR notices that mention "your application", "we're moving forward with other candidates" (a rejection that contains "moving forward"), talent-pool requests, and interview reminders.
- **Matching:** unit tests for sender-based company extraction per hiring system, name normalisation, several roles at one company, and the date guard.
- **Apply:** unit tests for forward-only movement, rejection gating, confirmation on a prepared card, next-step age limit, and undo.
- **Integration (`npm run test:integration`):** synthetic applications and synthetic `MailMessage` rows through match and apply against the test database, removed afterwards.
- **Back-test:** the backfill dry-run report on real mail since 1 September 2025 is the acceptance check. Target before switching on automatic changes: at most 15% of job-related mail in review, and no rejection applied to the wrong card in a manual check of every auto-applied rejection.
- No test calls Gmail or the Claude API; both sit behind interfaces with fakes.

## Build order

1. Data model, `assessment` stage, and the pure classify, match and apply cores with tests.
2. Gmail connection and fetch, `mail:connect`, mail health on the Sources page.
3. Backfill dry run and report; tune rules against it.
4. Claude fallback.
5. Review list, timeline entries, Action needed, undo.
6. Scheduled checks in the worker and `--apply` for the backfill.

## Tightened after review

An independent review of the first implementation reproduced ways a card could end up wrong without a human seeing it. The code is stricter than the sections above in these places:

- **Two readers.** A second review showed that word-list rules cannot be trusted alone: newly written emails kept producing wrong automatic changes. A card is now changed or created automatically only when the rules and Claude, each on its own, reach the same category. One reader alone, or a disagreement, goes to review with both readings. Exceptions that need no second reader: a receipt attached to a card that is already submitted, and a card created for a rule-read receipt from a hiring system that names the role. This sends more mail to the Claude API than the original decision ("only what the rules cannot settle"): rule-read outcome mail and receipts that would create or change a card. `MAIL_SECOND_OPINION=off` restores the original scope; outcome mail then waits in review.
- **Outcome sentences only.** A rejection or offer rule fires only on a sentence that states the outcome for this application. Policy, footer, conditional and future wording ("will be rejected if", "candidates not selected will not be contacted") does not count. Hard-wrapped plain text is unwrapped before matching.
- **Sender must confirm the company.** A match where the company is named only in the mail's text, by a sender that is neither a hiring system nor the employer, never changes a card; it goes to review.
- **Different role, same company.** When a company has one card and the mail names a role whose words are not a subset of the card's title (or the reverse), the mail goes to review.
- **Dates.** Mail older than a card (its submission date, or its creation date when never submitted) cannot match it. Up to 14 days older goes to review; more than that is treated as an earlier application round and gets its own card.
- **Cards never submitted.** On a queued or prepared card only a confident receipt acts (it marks the card submitted). Everything else, including a rejection, goes to review.
- **Creating cards.** A card is created from an email only when the sender is a hiring system or the mail names a role. Flat, visa, bank, university and conference "applications" are filed as unrelated by rules and never sent to the Claude API.
- **Bulk mail.** Mail with bulk headers from a sender that is not a hiring system cannot be a confident interview, assessment, offer or question, and is only fetched at all when its thread is linked or its subject is about an application.
- **Next step refresh.** A later mail for the same stage that carries a next step replaces the card's next step and deadline without moving the stage, unless a newer mail already set it. Earlier-stage mail that asks for something goes to review.
- **Order.** Outcome mail older than the recorded submission, or older than mail that already changed the card, goes to review. A mail in a linked thread that names another company or a different role goes to review.
- **Claude verdicts.** A company or role the model names is dropped unless the mail states it. A quote shorter than 3 words or 12 characters cannot support a confident verdict. Quoted reply history is not sent.
- **Live switch.** Nothing changes a card until `npm run mail:backfill -- --apply` has completed once, and that needs a completed dry run. Before that, scheduled checks and `npm run mail:sync` do nothing. The dry run can be repeated (it discards the previous proposals first), resumed with `-- --resume`, or thrown away with `-- --discard`. `-- --off` turns scheduled checks off again.
- **Apply matches the report.** `--apply` re-checks each proposal against the board as it is now; where the outcome would differ from the report, or the card changed in between, the mail goes to review instead. Individual proposals can be held back with `--hold=<mail id>`.
- **Retries.** The check window does not advance past a message that failed to load. After five failed checks the message is named in the connection error and given up on.
- **Undo.** Only the latest change on a card can be undone. A change the user undid or corrected is never re-applied by `mail:reclassify`. An email attached to the wrong card can be unlinked. Undoing the email that created a card is refused when the card has other mail, later events, notes or documents.
- **Reclassify scope.** `mail:reclassify` re-reads mail that is undecided or waiting for review. It does not re-read mail already applied, attached or ignored.
- **Known limits.** Mail that sat in Spam for more than an hour before being rescued is not seen (Jobdesk does not read Spam). A crafted email sent from an employer's real domain can still move that employer's card; Undo is the remedy.
