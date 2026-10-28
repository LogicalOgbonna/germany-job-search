# Interview preparation

Status: design approved by Arinze on 19 October 2026.

## Goal

When an interview is scheduled, Jobdesk knows when it is, with whom, and how to join, and gives a place to prepare: a generated prep sheet grounded in the candidate's verified experience, question-by-question notes, a spoken mock interview, and a debrief afterwards.

## Decisions taken

| Question | Decision |
| --- | --- |
| Prep content | A Generate button in Jobdesk, using the Claude API with web search |
| Practice | Spoken mock interview in the first version |
| Speech | The browser's built-in speech recognition and voice (Chrome) |

## Out of scope

Calendar writes, sending email, joining calls, video practice, practice without an interview record (a manual interview of stage "other" covers it).

## Data model

- `Interview`: `id`, `applicationId`, `stage` (`talent`, `technical`, `assessment`, `final`, `other`), `title`, `startsAt`, `endsAt`, `timezone` (the time zone the confirmation states, default Europe/Berlin), `interviewerTimezone` (optional), `interviewers` (JSON list of `{ name, role, email, linkedin }`), `meetingUrl`, `eventUrl`, `rescheduleUrl`, `status` (`scheduled`, `done`, `cancelled`), `sourceMailId` (optional), `prep` (JSON, the generated sheet), `prepStatus` (`none`, `queued`, `running`, `ready`, `failed`), `prepError`, `prepGeneratedAt`, `checklist` (JSON list of `{ label, done }`), `notes`, `debrief`, `nextSteps`, `thankYouDraft`, `createdAt`, `updatedAt`.
- `InterviewQuestion`: `id`, `interviewId`, `position`, `question`, `outline` (from the prep sheet), `evidence` (quoted lines from the experience files), `userNotes`, `ready`. Kept apart from `prep` so regenerating the sheet never loses the candidate's notes: regeneration matches questions by text and keeps notes on matches; unmatched old questions stay, marked "from an earlier sheet".
- `PracticeSession`: `id`, `interviewId`, `stage`, `startedAt`, `endedAt`, `turns` (JSON list of `{ question, followUp, transcript, seconds, words, fillerWords, feedback }`), `summary` (JSON), deletable.

## Where it appears

- **Overview:** "Upcoming interviews", sorted by start, each with a countdown, stage, company, role and a link to its page. Hidden when empty.
- **Application card:** an Interviews section listing its rounds, with "Add interview".
- **Interview page** (dashboard view `interview`, id in the URL): sections Details, Prep sheet, Questions, Practice, After the call.
- **Existing prep files:** when the application's job folder (`jobs/<date>/<company>/<title>/`) has an `intro_prep.md` and no sheet has been generated, the Prep sheet section shows it rendered, labelled with its file path.

## Interviews from email

- A parser reads interview confirmations: Recruitee ("Confirmation: Video interview on Thursday, 22 October 2026 at 10:15 - 10:45", with time zone and event, reschedule links), Calendly, Google Calendar invitations (subject "Invitation: ... @ <date>" and `text/calendar` parts), and scheduling confirmations from Greenhouse, Ashby, Lever and GoodTime. It extracts start, end, time zone, meeting/event/reschedule links and interviewer names. It never guesses a time it cannot read.
- When the mail is matched to exactly one application and the sender confirms the company (the mail pipeline's existing `unique` + corroborated test), the interview is created or updated (same application and same start, or the same event link, is the same interview). Otherwise it is offered in Needs review as "Add as interview".
- Creating an interview never changes the card's stage. The card's next step becomes "Interview <weekday> <date>, <time>" with the start as its due date, unless a later stage already set a newer next step.
- A one-off command reads mail already stored to create interviews for confirmations received before this feature existed.

## Generate prep

- Runs as a background job in the worker. The page shows queued, running, ready or failed, and can be re-run.
- Inputs: the job description, application notes (salary expectation, permit, start date, location preferences as recorded), the interview's stage, interviewers and emails (subject and body of the mails linked to the application), `cv/experience.md`, `cv/base_experience.md`, and the CLAUDE.md honesty rules.
- The Claude API researches the company with its web search tool and returns a structured sheet: logistics, company facts each with a source URL, role analysis (responsibilities, challenges, must-have versus nice-to-have), matching evidence (each with a verbatim quote from the experience files and the role it is from), transferable experience, gaps with honest framing, scripts ("Why this company", "What are you looking for", "Tell me about yourself"), likely questions with answer outlines and evidence, questions to ask, and a checklist. Content depends on the stage: a talent screen covers motivation, salary, notice, permit and logistics; a technical round covers stack, architecture, testing and system design.
- Honesty check before saving: an evidence quote that does not occur in the experience files drops that item; a number (years, percentages, counts) in a script or outline that does not occur in the experience files or the application notes is marked as unverified in the sheet; job titles must be the exact titles in `cv/experience.md`; no em dashes; the Python and other rules in CLAUDE.md apply. The check is code, not a request to the model.
- Model from `PREP_AI_MODEL`, default `claude-opus-5-5` (few calls, quality matters). Fails visibly without `ANTHROPIC_API_KEY`.

## Spoken practice

- Start from the interview page: choose 5 or 10 questions; the stage defaults to the interview's stage.
- The interviewer is Claude, playing that stage's interviewer for that company, using the prep sheet, the job description and the experience files. One question at a time; it may ask one follow-up when an answer is thin.
- The question is spoken with the browser's speech synthesis and shown as text; a mute control turns the voice off.
- The candidate answers aloud: Chrome's speech recognition transcribes live; "Done" ends the answer; the transcript can be edited before sending; typing works everywhere as a fallback. Outside Chrome the page says speech is not available and offers typing.
- Measured in the browser per answer: duration, words per minute, filler words (um, uh, like, you know, basically, actually, so, ähm). Sent to Claude: the question, the transcript and these measures.
- Feedback per answer: structure (situation, action, result), specificity, evidence, length, and any claim the experience files do not support (for example years of a tool), quoting the line it checked. At the end: what went well, three things to improve, a rating per question.
- Sessions are saved in the local database and can be deleted. No audio is recorded or stored.

## After the call

- Once the start time has passed, the page shows After the call: debrief notes, people met, next steps (which update the card's next step), outcome (`done`, `cancelled`).
- "Draft thank-you email" asks Claude for a short note to the interviewer, using the debrief; shown with a copy button. Jobdesk never sends it.

## What leaves the machine

- Generate prep: the job description, application notes, experience files and the application's emails go to the Claude API, plus web searches about the company. Meeting and reschedule links are not sent (a reschedule link can cancel the interview).
- Practice: the voice goes to Google through Chrome's speech recognition while speaking; transcripts, the prep sheet, the job description, application notes (for consistency with what was submitted) and experience files go to the Claude API.
- Thank-you draft: the debrief, stage, company, role, interviewer names and the candidate's name go to the Claude API.

## Failure handling

| Failure | Behaviour |
| --- | --- |
| No API key, Claude error or timeout | Prep shows "failed" with the reason; practice shows the error and allows retry; nothing partial is saved as a sheet |
| Web search returns nothing usable | Sheet is still produced from the job description and emails, with "No sources found" on the company section |
| Speech recognition unavailable or stops | Typing input; a stopped recogniser restarts while the answer is open |
| Confirmation mail that cannot be parsed | Stays an ordinary mail; no interview is created |
| Rescheduled interview (new confirmation, same event link) | The existing interview is updated, not duplicated |

## Testing

- Parser unit tests on real-shaped confirmations (Recruitee, Calendly, Google invitation subject and ICS, Greenhouse, Ashby, Lever), in English and German, including time zones and reschedules.
- Prep: honesty-check unit tests (quote present, quote absent, unverified number, wrong title, em dash); job with a fake Claude client end to end.
- Practice: filler-word and pace helpers; turn handling with a fake Claude client.
- Integration tests on synthetic rows: interview from mail, next-step update, regeneration keeps notes, practice session saved and deleted.
- Browser check on the running app with synthetic rows: overview panel, interview page, typed practice turn; speech is checked by hand in Chrome.

## Tightened after review

- Times: a booking deadline or a list of offered slots is not an interview time; a morning start does not inherit "PM" from the end; reschedules use the new time; Microsoft's "(UTC+01:00) Amsterdam, Berlin" and "Central European Standard Time" labels mean Europe/Berlin with daylight saving; an IANA zone wins over a printed offset.
- The card's next step is always written in Europe/Berlin time; interview pages show both zones.
- One thread can hold several rounds: a mail in a known thread with a different time is a new interview unless it is a reschedule naming the old time. Google invitation links are compared by event id. Processing the same mail again changes nothing, so manual edits survive re-runs.
- Honesty check: claims must be supported by their own quote or role section, skills-file quotes only count for the roles their row names, numbers must match with their unit, years per technology are never verified, and the CLAUDE.md rules are checked in every text field of the sheet.
- Regenerate is refused while a sheet is being generated; stale runs are requeued after 90 minutes.
