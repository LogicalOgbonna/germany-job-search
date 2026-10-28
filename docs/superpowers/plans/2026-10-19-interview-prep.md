# Interview Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Interview records filled from email, a generated and honesty-checked prep sheet, per-question notes, a spoken mock interview, and a debrief, in the Jobdesk dashboard.

**Architecture:** New `src/lib/interviews/` module (store, prep, practice) with a shared Claude client in `src/lib/claude.ts`. The mail pipeline gains an interview-confirmation parser and creates interviews. Prep generation runs in the BullMQ worker; practice runs through API routes with speech in the browser.

**Tech Stack:** TypeScript, Next.js 16 route handlers, Prisma 6 / PostgreSQL, BullMQ worker, `node:test` with `tsx`, Claude Messages API over `fetch` (no SDK), browser Web Speech API.

**Spec:** `docs/superpowers/specs/2026-10-19-interview-prep-design.md`. Read it first.

## Rules for every task

- Touch only your listed files. Other agents edit other files at the same time.
- No commits, no `prisma migrate`, no package installs, no server or worker restarts.
- No real Claude, Gmail or network calls in tests: inject fakes.
- Tests with `node:test`; test first; `npx tsx --test <file>`; `npx prettier --write` on your files; `npm run typecheck` clean for your files.
- The local database is the user's live data. Integration tests create only synthetic rows (company names `Ivtest-<random>`) and delete everything in `finally`; never modify a real application.
- User-facing text: plain English, no em dashes.
- Finish with a report: what you built, test summary lines, deviations from the contract and why, exported signatures.

## Done by the coordinator (Task 0)

- Prisma models `Interview`, `InterviewQuestion`, `PracticeSession` (migration `202610190001_interviews`, applied). Read `prisma/schema.prisma`.
- `src/lib/interviews/types.ts`: shared types (`InterviewStage`, `Interviewer`, `ParsedInterview`, `PrepSheet` and parts, `PracticeTurn`, `PracticeSummary`). Do not edit.
- `RawMail.calendar?: string` in `src/lib/mail/types.ts`.

## File map

| Task | Files |
| --- | --- |
| 1 Claude client | `src/lib/claude.ts`, `tests/claude.test.ts` |
| 2 Interview store and API | `src/lib/interviews/store.ts`, `src/app/api/interviews/route.ts`, `src/app/api/interviews/[id]/route.ts`, `src/app/api/interviews/[id]/questions/[qid]/route.ts`, `src/app/api/interviews/[id]/prep/route.ts`, `src/app/api/interviews/[id]/thank-you/route.ts`, `tests/integration/interviews.test.ts` |
| 3 Confirmation parser | `src/lib/mail/interview-parse.ts`, `src/lib/mail/gmail.ts` (calendar part only), `tests/mail-interview-parse.test.ts`, `tests/mail-gmail.test.ts` (calendar cases) |
| 4 Prep generation | `src/lib/interviews/prep.ts`, `src/lib/interviews/honesty.ts`, `tests/interview-prep.test.ts` |
| 5 Practice | `src/lib/interviews/practice.ts`, `src/app/api/practice/route.ts`, `src/app/api/practice/[id]/route.ts`, `src/components/practice.tsx`, `tests/interview-practice.test.ts` |
| 6 Mail hook | `src/lib/mail/store.ts`, `scripts/interviews-from-mail.ts`, `scripts/worker.ts`, `tests/integration/mail.test.ts`, `package.json` (one script) |
| 7 Dashboard | `src/components/interviews.tsx`, `src/components/dashboard.tsx`, `src/components/mail.tsx` (review "Add as interview"), `src/app/api/mail/[id]/route.ts` (one action), `src/app/globals.css` |

Order: 1, 2, 3 in parallel; then 4 and 5; then 6 and 7; then review.

## Task 1: Claude client (`src/lib/claude.ts`)

Load the `claude-api` skill first and follow it (request shape, headers, model ids, structured outputs, the web search server tool and its citations, refusals, `stop_reason`). `src/lib/mail/ai.ts` is a working example of this codebase's style; do not edit it.

```ts
export type ClaudeMessage = { role: "user" | "assistant"; content: string };
export type ClaudeRequest = {
  system: string;
  messages: ClaudeMessage[];
  schema?: Record<string, unknown>; // JSON schema: the reply is parsed and returned as `data`
  model?: string; // default process.env.PREP_AI_MODEL ?? "claude-opus-5-5"
  maxTokens?: number;
  webSearch?: { maxUses: number }; // enable the web search server tool
  effort?: "low" | "medium" | "high";
  timeoutMs?: number; // default 180000
};
export type ClaudeReply<T> =
  | { ok: true; data: T; text: string; sources: { url: string; title: string }[] }
  | { ok: false; error: string }; // readable, never contains the key or the request body
export function claudeConfigured(): boolean; // ANTHROPIC_API_KEY present
export function askClaude<T = unknown>(
  request: ClaudeRequest,
  options?: { fetch?: typeof fetch; apiKey?: string },
): Promise<ClaudeReply<T>>;
```

- Without `schema`, `data` is the concatenated text. With `schema`, `data` is the parsed JSON; invalid JSON is `{ ok: false }`.
- If the API does not allow web search and structured output in one request, `askClaude` must still honour both, by the method the skill recommends; document what you chose.
- `sources` collects web search citations (deduplicated by URL).
- Never throws. 429/5xx: one retry after `retry-after` (cap 30 s), then `{ ok: false }`.
- Tests with a fake `fetch`: text reply; schema reply; invalid JSON; refusal; 500 then 200; 401 readable error; request carries key header, model, tools when `webSearch` is set; citations collected; missing key gives `{ ok: false }`.

## Task 2: Interview store and API

```ts
// src/lib/interviews/store.ts
export type InterviewInput = {
  stage: InterviewStage;
  title?: string;
  startsAt?: Date | null;
  endsAt?: Date | null;
  timezone?: string;
  interviewerTimezone?: string | null;
  interviewers?: Interviewer[];
  meetingUrl?: string | null;
  eventUrl?: string | null;
  rescheduleUrl?: string | null;
};
export function createInterview(applicationId: string, input: InterviewInput): Promise<{ id: string }>;
export function updateInterview(
  id: string,
  patch: Partial<InterviewInput> & {
    status?: "scheduled" | "done" | "cancelled";
    notes?: string;
    debrief?: string;
    nextSteps?: string;
    checklist?: { label: string; done: boolean }[];
  },
): Promise<void>;
export function deleteInterview(id: string): Promise<void>;
export function upcomingInterviews(now?: Date): Promise<Array<{
  id: string; applicationId: string; jobId: string; company: string; role: string;
  stage: InterviewStage; startsAt: Date | null; endsAt: Date | null; timezone: string;
  meetingUrl: string | null; status: string; prepStatus: string;
}>>; // scheduled, startsAt in the future or within the last 2 hours, or startsAt null; soonest first, undated last
export function interviewsForApplication(applicationId: string): Promise<Array<{ id: string; stage: InterviewStage; title: string; startsAt: Date | null; status: string }>>;
export function interviewDetail(id: string): Promise<{
  interview: { /* all Interview columns, prep typed as PrepSheet | null */ };
  application: { id: string; jobId: string; status: string; notes: string; company: string; role: string; location: string; description: string };
  questions: Array<{ id: string; position: number; question: string; outline: string; evidence: unknown; userNotes: string; ready: boolean; stale: boolean }>;
  practice: Array<{ id: string; startedAt: Date; endedAt: Date | null; turns: number; summary: PracticeSummary | null }>;
  prepFile: { path: string; markdown: string } | null;
  mails: Array<{ id: string; subject: string; fromName: string; fromAddress: string; receivedAt: Date; category: string; threadId: string }>;
}>;
// Called by the mail pipeline (Task 6). Same interview = same application and (same eventUrl, or startsAt within 5 minutes, or the earlier interview from the same sourceMail thread). Cancelled confirmations set status "cancelled". Returns null when parsed has no startsAt and no eventUrl.
export function upsertInterviewFromMail(input: {
  applicationId: string; mailId: string; parsed: ParsedInterview; receivedAt: Date;
}): Promise<{ interviewId: string; created: boolean } | null>;
// Replace questions from a new sheet, keeping userNotes/ready where the question text matches (normalised); unmatched old questions get stale = true.
export function syncQuestions(interviewId: string, sheet: PrepSheet): Promise<void>;
export function updateQuestion(id: string, patch: { userNotes?: string; ready?: boolean }): Promise<void>;
// jobs/<DD-MM-YYYY>/<company>/<title>/intro_prep.md for this application's company and role (normalised folder names); newest date first.
export function findPrepFile(company: string, role: string): Promise<{ path: string; markdown: string } | null>;
export function requestPrep(id: string): Promise<void>; // prepStatus "queued", prepError null
```

- Next step on the card: when an interview with a future `startsAt` is created or its time changes, set `Application.nextStep` to "Interview <Thu 22 Oct, 10:15>" (in `timezone`) and `nextStepDueAt` to `startsAt`, unless the card's existing next step is due later than this interview and was not set by an interview. When an interview is cancelled or deleted and the card's next step is that interview's text, clear it. When `nextSteps` is saved in the debrief and non-empty, it becomes the card's next step (no due date). Write an `ApplicationEvent` (status unchanged, note "Interview scheduled ..." / "Interview cancelled ...") for create and cancel.
- API (zod, `checkMutation` on mutations, `errorResponse`): `GET /api/interviews` upcoming; `POST /api/interviews` `{ applicationId, ...InterviewInput }`; `GET/PATCH/DELETE /api/interviews/[id]`; `PATCH /api/interviews/[id]/questions/[qid]`; `POST /api/interviews/[id]/prep` calls `requestPrep`; `POST /api/interviews/[id]/thank-you` calls `draftThankYou` from `src/lib/interviews/prep.ts` (Task 4; import it, it will exist) and returns `{ draft }`.
- Integration tests on synthetic rows: create, next step set, upcoming order, update time, cancel clears next step, upsertInterviewFromMail dedupe by eventUrl and by time, syncQuestions keeps notes, findPrepFile against a temp `jobs` folder (make the root overridable with `JOBS_ROOT`).

## Task 3: Confirmation parser

```ts
// src/lib/mail/interview-parse.ts
export function parseInterviewMail(mail: RawMail): ParsedInterview | null; // null when it is not an interview confirmation/invitation with at least a time or an event link
export function parseIcs(text: string): Partial<ParsedInterview> | null; // VEVENT DTSTART/DTEND with TZID or Z, LOCATION/URL/DESCRIPTION links, ORGANIZER/ATTENDEE names, METHOD:CANCEL
```

- Providers: Recruitee (the real example: subject "Confirmation: Video interview on Thursday, 22 October 2026 at 10:15 - 10:45 with Aulia Cahyani", body has "Europe/Berlin (+02:00)", "Reschedule <url>", "Event link <url>", "Interviewers <names>"), Calendly ("Confirmed: <event> with <name> on <date>"; "New Event"; times with time zone names like "Central European Summer Time"), Google Calendar invitations (subject "Invitation: <title> @ Tue Apr 21, 2026 2pm - 3pm (CEST) (<email>)", "Updated invitation", "Canceled event"), Greenhouse, Ashby, Lever, GoodTime scheduling confirmations, and any mail with a `text/calendar` part (`mail.calendar`). English and German ("Bestätigung", "Einladung", "am Donnerstag, 22. Oktober 2026 um 10:15").
- Times: produce correct UTC instants for the stated zone (handle CEST/CET/BST/UTC offsets and IANA names). Never guess a missing date or year; return `startsAt: null` then.
- `src/lib/mail/gmail.ts`: in `toRawMail`, put the decoded text of a `text/calendar` part (also `application/ics` attachments with inline data) into `calendar`. Nothing else in gmail.ts changes.
- Tests: the Recruitee example above (Thursday 22 Oct 2026 10:15 to 10:45 Europe/Berlin = 08:15 to 08:45 UTC), each provider in English, a German Recruitee variant, a Google "Updated invitation", a cancellation, an ICS with TZID and with Z times, a reminder mail without a time (null), a rejection mail mentioning an interview (null), a mail with only an event link.

## Task 4: Prep generation

```ts
// src/lib/interviews/honesty.ts (pure)
export function checkHonesty(
  sheet: Omit<PrepSheet, "warnings" | "dropped">,
  sources: { experience: string; skills: string; notes: string },
): PrepSheet;
// src/lib/interviews/prep.ts
export function generatePrep(interviewId: string, deps?: { ask?: typeof askClaude; now?: Date; root?: string }): Promise<void>;
export function draftThankYou(interviewId: string, deps?: { ask?: typeof askClaude }): Promise<string>;
```

- `generatePrep` sets `prepStatus` running, builds inputs (spec "Generate prep"), asks Claude (web search for the company, structured `PrepSheet` reply via `askClaude`), runs `checkHonesty`, saves `prep`, `prepGeneratedAt`, `prepStatus` ready and calls `syncQuestions`; on any failure `prepStatus` failed with a readable `prepError` and the old sheet kept. Experience files from `<root>/cv/experience.md` and `cv/base_experience.md` (root defaults to cwd). Include the CLAUDE.md Critical Rules section verbatim in the instruction. Stage-specific instruction per spec.
- `checkHonesty`: evidence whose `quote` is not found (whitespace and case insensitive) in experience or skills is removed and named in `dropped`; numbers with units or % in scripts, outlines and claims that do not occur in experience, skills or notes produce `warnings`; job titles in `role` must match a title line in experience.md, otherwise the item is dropped; em dashes are replaced with commas.
- `draftThankYou`: short note (under 120 words) to the first interviewer using the debrief, stage, company and role; no claims beyond the debrief and experience files; no em dashes.
- Worker: Task 6 adds the job. Provide `export function nextQueuedPrep(): Promise<string | null>` in prep.ts for the worker to claim (atomic `updateMany` from queued to running).
- Tests (fake `ask`): sheet saved and questions synced; Claude failure keeps the old sheet; honesty cases (quote present, absent, unverified number, wrong title, em dash); thank-you prompt contains the debrief.

## Task 5: Practice

```ts
// src/lib/interviews/practice.ts
export function measureAnswer(transcript: string, seconds: number): { words: number; wordsPerMinute: number; fillerWords: Record<string, number> }; // pure
export function startPractice(interviewId: string, options: { questions: 5 | 10 }, deps?): Promise<{ sessionId: string; question: string }>;
export function answerTurn(sessionId: string, input: { transcript: string; seconds: number }, deps?): Promise<{ feedback: PracticeTurn["feedback"]; next: { question: string; followUp: boolean } | null }>;
export function finishPractice(sessionId: string, deps?): Promise<PracticeSummary>;
export function deletePractice(sessionId: string): Promise<void>;
```

- Interviewer persona per stage and company; uses the prep sheet (if any), job description, experience files; at most one follow-up per question; stops after the planned count. Feedback structured (`PracticeTurn.feedback`), `unsupported` claims quote what was checked. Summary with exactly three improvements.
- API: `POST /api/practice` `{ interviewId, questions }`; `POST /api/practice/[id]` `{ action: "answer", transcript, seconds }` or `{ action: "finish" }`; `DELETE /api/practice/[id]`.
- `src/components/practice.tsx` exports `Practice({ interviewId }: { interviewId: string })`: setup (5/10), question shown and spoken with `speechSynthesis` (mute toggle, English voice), answer with `webkitSpeechRecognition`/`SpeechRecognition` (continuous, interim text, auto-restart while open, "Done" button, editable transcript, typing fallback with a notice when unsupported), feedback card per answer, final summary, past sessions with delete. Uses the dashboard's existing `api` style (copy the small helper; do not import from dashboard.tsx).
- Tests: `measureAnswer` (filler words in English and German, empty transcript, zero seconds); turn flow with fake `ask` (follow-up once, stops at planned count, summary has three improvements); session deletion. UI verified in Task 7's browser check.

## Task 6: Mail hook

- In `src/lib/mail/store.ts`: after a mail is stored and matched `unique` with corroboration to an application (any category, including notices from scheduling systems), run `parseInterviewMail` on the mail (with `calendar` when present) and, when it returns a result, `upsertInterviewFromMail`. Not in dry runs (record the parsed interview in the proposal so the backfill report lists "Interviews that would be added", and add them on `--apply`). When the match is not unique or not corroborated and a parse succeeds, attach `interview` (the ParsedInterview) to the review row in `mailOverview().review[]`, and add a review action `addInterview(mailMessageId, applicationId)` exported from store.ts.
- `scripts/interviews-from-mail.ts` (`npm run interviews:from-mail`): parse stored mail bodies linked to applications (`applicationId` not null) and upsert interviews; print what was added. Safe to re-run.
- `scripts/worker.ts`: on each tick, claim queued prep with `nextQueuedPrep()` and enqueue an `interview-prep` job (`jobId: prep-<id>`); handler calls `generatePrep(id)`.
- Integration tests: a Recruitee confirmation for a synthetic application creates an interview and sets the next step; the same mail twice creates one; an uncorroborated confirmation goes to review with `interview` attached; `addInterview` creates it.

## Task 7: Dashboard

- `src/components/interviews.tsx` exports `UpcomingInterviews` (Overview panel, hidden when empty), `ApplicationInterviews({ applicationId })` (list plus "Add interview" form), `InterviewPage({ id, onBack })` with sections Details (editable fields, both time zones, links, status), Prep sheet (Generate / Regenerate button with status polling, rendered sheet with sources, warnings and dropped items shown plainly, or the `intro_prep.md` file rendered with `react-markdown` when no sheet exists), Questions (outline, evidence, notes textarea saved on blur, Ready toggle, stale marked), Practice (mount `<Practice interviewId />` from `./practice`), After the call (debrief, people, next steps, status, Draft thank-you with copy button), Checklist.
- `dashboard.tsx`: view `interview` with `id` in the URL (`?view=interview&id=...`), mount `UpcomingInterviews` on Today, `ApplicationInterviews` in the job detail panel for jobs with an application.
- `mail.tsx` + `PATCH /api/mail/[id]` `{ action: "add-interview", applicationId }`: review rows with `interview` show "Add as interview" with the parsed time.
- Styling reuses existing classes and variables; mobile works.
- Browser check on the running app (use a temporary second server like the mail task did if the live one cannot load new Prisma models): synthetic application with an interview, overview panel, interview page sections, typed practice turn with a fake or real Claude only if `ANTHROPIC_API_KEY` is set and the user's data is not sent (use synthetic text), screenshots `.context/interview-*.png` desktop and mobile; remove all synthetic rows afterwards.

## Final (coordinator)

Docs (README section, `.env.example` `PREP_AI_MODEL`), full test run, restart the dev stack, run `npm run interviews:from-mail`, confirm the Distribusion interview (22 October 2026, 10:15 to 10:45 Berlin) appears with its links, independent review.
