import test from "node:test";
import assert from "node:assert/strict";
import { parseIcs, parseInterviewMail } from "../src/lib/mail/interview-parse";
import type { RawMail } from "../src/lib/mail/types";

// Fixtures follow real confirmation formats; names, addresses and links are invented.
const mail = (
  subject: string,
  bodyText: string,
  extra: Partial<RawMail> = {},
): RawMail => ({
  gmailId: "g1",
  threadId: "t1",
  fromAddress: "jobs@acme.example",
  fromName: "",
  subject,
  receivedAt: new Date("2026-10-19T09:00:00Z"),
  bodyText,
  fromMe: false,
  ...extra,
});
const iso = (date: Date | null | undefined) => date?.toISOString() ?? null;
const times = (
  parsed: { startsAt?: Date | null; endsAt?: Date | null } | null,
) => [iso(parsed?.startsAt), iso(parsed?.endsAt)];

test("Recruitee confirmation: exact UTC times, links and interviewer", () => {
  const parsed = parseInterviewMail(
    mail(
      "Confirmation: Video interview on Thursday, 22 October 2026 at 10:15 - 10:45 with Mara Lindqvist",
      `Interview with Acme Mobility
When
<b>Thursday</b> 22 October 2026 at <b>10:15 - 10:45</b>
Europe/Berlin (+02:00)

Can't make it?
Reschedule
https://careers.acme.example/v/i/s/abc123/def456/reschedule

Company
Acme Mobility
Interviewers
Mara Lindqvist
Candidate

Event link
https://careers.acme.example/v/events/evt789

Public note

Powered by Recruitee`,
      { fromAddress: "notifications@recruiteemail.com" },
    ),
  );
  assert.deepEqual(parsed, {
    startsAt: new Date("2026-10-22T08:15:00Z"),
    endsAt: new Date("2026-10-22T08:45:00Z"),
    timezone: "Europe/Berlin",
    meetingUrl: null,
    eventUrl: "https://careers.acme.example/v/events/evt789",
    rescheduleUrl:
      "https://careers.acme.example/v/i/s/abc123/def456/reschedule",
    interviewers: [{ name: "Mara Lindqvist" }],
    title: "Video interview",
    provider: "recruitee",
    cancelled: false,
    previousStartsAt: null,
  });
});
test("Recruitee confirmation in German", () => {
  const parsed = parseInterviewMail(
    mail(
      "Bestätigung: Videointerview am Donnerstag, 22. Oktober 2026 um 10:15 - 10:45 mit Mara Lindqvist",
      `Interview mit Acme Mobility
Wann
<b>Donnerstag</b> 22. Oktober 2026 um <b>10:15 - 10:45</b>
Europe/Berlin (+02:00)

Termin verschieben
https://careers.acme.example/v/i/s/abc/def/reschedule

Interviewer
Mara Lindqvist
Jonas Weber
Kandidat

Event-Link
https://careers.acme.example/v/events/evt789

Powered by Recruitee`,
      { fromAddress: "notifications@recruiteemail.com" },
    ),
  );
  assert.deepEqual(times(parsed), [
    "2026-10-22T08:15:00.000Z",
    "2026-10-22T08:45:00.000Z",
  ]);
  assert.equal(parsed?.title, "Videointerview");
  assert.deepEqual(parsed?.interviewers, [
    { name: "Mara Lindqvist" },
    { name: "Jonas Weber" },
  ]);
  assert.equal(
    parsed?.eventUrl,
    "https://careers.acme.example/v/events/evt789",
  );
  assert.equal(parsed?.provider, "recruitee");
});
test("Calendly confirmation with a long time zone name", () => {
  const parsed = parseInterviewMail(
    mail(
      "Confirmed: 30 Minute Interview with Mara Lindqvist on Tuesday, March 31, 2026",
      `Hi Ogbonna,

Your event has been scheduled.

Event Type:
30 Minute Interview

Event Date/Time:
10:30am - 11:00am (Central European Summer Time) on Tuesday, March 31, 2026

Location:
https://acme.zoom.us/j/123456789

Need to make changes to this event?
Cancel: https://calendly.com/cancellations/aaaa-bbbb
Reschedule: https://calendly.com/reschedulings/aaaa-bbbb

Powered by Calendly.com`,
      { fromAddress: "notifications@calendly.com" },
    ),
  );
  assert.deepEqual(parsed, {
    startsAt: new Date("2026-03-31T08:30:00Z"),
    endsAt: new Date("2026-03-31T09:00:00Z"),
    timezone: "Europe/Berlin",
    meetingUrl: "https://acme.zoom.us/j/123456789",
    eventUrl: null,
    rescheduleUrl: "https://calendly.com/reschedulings/aaaa-bbbb",
    interviewers: [{ name: "Mara Lindqvist" }],
    title: "30 Minute Interview",
    provider: "calendly",
    cancelled: false,
    previousStartsAt: null,
  });
});
test("Calendly reminder with the time in the subject and body", () => {
  const parsed = parseInterviewMail(
    mail(
      "Friendly reminder: Your first interview with Acme :rocket: Tuesday, March 31, 2026 at 10:30 (West Africa Time)",
      `Hi Ogbonna,

Just a quick reminder that your interview with us at Acme is scheduled for tomorrow (Tuesday, March 31, 2026 at 10:30 (West Africa Time)).

Join the meeting here:
https://calendly.com/events/0e93c970-0000-4000-8000-000000000000/microsoft_teams

Reschedule

Cancel`,
      { fromAddress: "notifications@calendly.com" },
    ),
  );
  assert.equal(iso(parsed?.startsAt), "2026-03-31T09:30:00.000Z");
  assert.equal(parsed?.endsAt, null);
  assert.equal(parsed?.timezone, "Africa/Lagos");
  assert.equal(
    parsed?.meetingUrl,
    "https://calendly.com/events/0e93c970-0000-4000-8000-000000000000/microsoft_teams",
  );
});
const googleBody = (
  heading: string,
  when: string,
) => `${heading}Interview with Acme
${when}
Central European Time - Berlin

Join with Google Meet
https://meet.google.com/abc-defg-hij?hs=224

Organizer
Jonas Weber
jonas.weber@acme.example

Guests
candidate@example.com
View all guest info
https://calendar.google.com/calendar/event?action=VIEW&eid=xyz&tok=abc

Invitation from Google Calendar: https://calendar.google.com/calendar/

Forwarding this invitation could allow any recipient to send a response to the organizer.`;
test("Google Calendar invitation", () => {
  const parsed = parseInterviewMail(
    mail(
      "Invitation: Interview with Acme @ Tue Apr 21, 2026 2pm - 3pm (CEST) (candidate@example.com)",
      googleBody("", "Tuesday Apr 21, 2026 ⋅ 2pm – 3pm"),
      { fromAddress: "jonas.weber@acme.example" },
    ),
  );
  assert.deepEqual(parsed, {
    startsAt: new Date("2026-04-21T12:00:00Z"),
    endsAt: new Date("2026-04-21T13:00:00Z"),
    timezone: "Europe/Berlin",
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    eventUrl:
      "https://calendar.google.com/calendar/event?action=VIEW&eid=xyz&tok=abc",
    rescheduleUrl: null,
    interviewers: [{ name: "Jonas Weber", email: "jonas.weber@acme.example" }],
    title: "Interview with Acme",
    provider: "google-calendar",
    cancelled: false,
    previousStartsAt: null,
  });
});
test("Google Calendar updated invitation with an offset and a shared am/pm", () => {
  const parsed = parseInterviewMail(
    mail(
      "Updated invitation: Interview with Acme @ Wed Apr 22, 2026 11am - 11:30am (GMT+2) (candidate@example.com)",
      googleBody(
        "This event has been updated\nChanged: time\n\n",
        "Wednesday Apr 22, 2026 ⋅ 11 – 11:30am",
      ),
      { fromAddress: "jonas.weber@acme.example" },
    ),
  );
  assert.deepEqual(times(parsed), [
    "2026-04-22T09:00:00.000Z",
    "2026-04-22T09:30:00.000Z",
  ]);
  assert.equal(parsed?.timezone, "Europe/Berlin");
  assert.equal(parsed?.cancelled, false);
  assert.equal(parsed?.provider, "google-calendar");
});
test("a cancelled Google Calendar event", () => {
  const parsed = parseInterviewMail(
    mail(
      "Canceled event: Interview with Acme @ Tue Apr 21, 2026 2pm - 3pm (CEST) (candidate@example.com)",
      googleBody(
        "This event has been canceled and removed from your calendar.\n\n",
        "Tuesday Apr 21, 2026 ⋅ 2pm – 3pm",
      ),
      { fromAddress: "jonas.weber@acme.example" },
    ),
  );
  assert.equal(parsed?.cancelled, true);
  assert.equal(iso(parsed?.startsAt), "2026-04-21T12:00:00.000Z");
});
test("Calendly cancellation", () => {
  const parsed = parseInterviewMail(
    mail(
      "Canceled: 30 Minute Interview with Mara Lindqvist",
      "Your event has been canceled.\n\nEvent Date/Time:\n10:30am - 11:00am (Central European Summer Time) on Tuesday, March 31, 2026",
      { fromAddress: "notifications@calendly.com" },
    ),
  );
  assert.equal(parsed?.cancelled, true);
  assert.equal(iso(parsed?.startsAt), "2026-03-31T08:30:00.000Z");
});
test("Greenhouse reminder and a Greenhouse-scheduled confirmation", () => {
  const reminder = parseInterviewMail(
    mail(
      "Reminder for interview with Acme for the Senior Frontend Engineer position",
      `Hi Ogbonna,

As a reminder, here is more information about your interview:

Core Skills Interview
David Example
January 13, 2026
1:00pm WAT
https://meet.google.com/abc-defg-hij`,
      { fromAddress: "no-reply@eu.greenhouse.io" },
    ),
  );
  assert.equal(iso(reminder?.startsAt), "2026-01-13T12:00:00.000Z");
  assert.equal(reminder?.timezone, "Africa/Lagos");
  assert.equal(reminder?.provider, "greenhouse");
  assert.deepEqual(reminder?.interviewers, [{ name: "David Example" }]);
  assert.equal(reminder?.meetingUrl, "https://meet.google.com/abc-defg-hij");
  const confirmed = parseInterviewMail(
    mail(
      "Your next interview at Acme",
      `I can now confirm your interview as follows:

Date/Time: Apr 24, 2026 1:00pm-2:15pm CEST
Interviewers: Anna Berg (Frontend Engineer)

Date/Time: Apr 24, 2026 1:00pm-2:15pm CEST
Interviewers: Marek Nowak (Head of Engineering)

Google Meet: https://meet.google.com/abc-defg-hij

Questions? Visit our support center ( https://support.greenhouse.io/?utm_medium=email )`,
    ),
  );
  assert.deepEqual(times(confirmed), [
    "2026-04-24T11:00:00.000Z",
    "2026-04-24T12:15:00.000Z",
  ]);
  assert.deepEqual(confirmed?.interviewers, [
    { name: "Anna Berg", role: "Frontend Engineer" },
    { name: "Marek Nowak", role: "Head of Engineering" },
  ]);
});
test("Ashby confirmation with separate date and time lines", () => {
  const parsed = parseInterviewMail(
    mail(
      "Interview confirmed: Senior Frontend Engineer at Acme",
      `Hi Ogbonna,

Your interview with Acme has been scheduled.

Date: Tuesday, October 20, 2026
Time: 2:00 PM - 3:00 PM CEST
Interviewers: Mara Lindqvist, Jonas Weber
Location: https://meet.google.com/abc-defg-hij

Need to reschedule? https://app.ashbyhq.com/candidate/reschedule/abc`,
      { fromAddress: "no-reply@ashbyhq.com" },
    ),
  );
  assert.deepEqual(times(parsed), [
    "2026-10-20T12:00:00.000Z",
    "2026-10-20T13:00:00.000Z",
  ]);
  assert.equal(parsed?.provider, "ashby");
  assert.deepEqual(parsed?.interviewers, [
    { name: "Mara Lindqvist" },
    { name: "Jonas Weber" },
  ]);
  assert.equal(
    parsed?.rescheduleUrl,
    "https://app.ashbyhq.com/candidate/reschedule/abc",
  );
});
test("Lever confirmation keeps the Zoom password", () => {
  const parsed = parseInterviewMail(
    mail(
      "Your interview with Acme is confirmed",
      "Your interview is confirmed for Tuesday, October 20, 2026 at 2:00 PM CEST.\nJoin: https://acme.zoom.us/j/987654321?pwd=abc.",
      { fromAddress: "no-reply@hire.lever.co" },
    ),
  );
  assert.equal(iso(parsed?.startsAt), "2026-10-20T12:00:00.000Z");
  assert.equal(parsed?.meetingUrl, "https://acme.zoom.us/j/987654321?pwd=abc");
  assert.equal(parsed?.provider, "lever");
});
test("GoodTime confirmation", () => {
  const parsed = parseInterviewMail(
    mail(
      "Confirming your interview with Acme!",
      `Interview Scheduled: Your Virtual Interview with Acme

Thu Dec 18, 2025 at 12:00PM (WAT)

You are confirmed for Thu Dec 18, 2025 at 12:00PM (WAT).

scheduled with goodtime.io`,
      { fromAddress: "recruiter@acme.example" },
    ),
  );
  assert.equal(iso(parsed?.startsAt), "2025-12-18T11:00:00.000Z");
  assert.equal(parsed?.endsAt, null);
  assert.equal(parsed?.timezone, "Africa/Lagos");
  assert.equal(parsed?.provider, "goodtime");
});
test("hiring-system confirmations with numeric dates and offsets", () => {
  const personio = parseInterviewMail(
    mail(
      "Interview confirmation for Senior Software Engineer with Acme",
      "We hereby confirm the interview for the position of Senior Software Engineer on 10.12.2026 at 14:00 (Europe/Berlin) with Acme.\n\nhttps://meet.google.com/abc-defg-hij",
      { fromAddress: "acme-jobs@m.personio.de" },
    ),
  );
  assert.equal(iso(personio?.startsAt), "2026-12-10T13:00:00.000Z");
  assert.equal(personio?.timezone, "Europe/Berlin");
  assert.equal(personio?.provider, "unknown");
  const smart = parseInterviewMail(
    mail(
      "Video interview - Candidate and Acme",
      "Your meeting is scheduled for March 26, 2026 at 10:00 AM GMT+1 Location: https://teams.microsoft.com/meet/333?p&#61;abc\nIf you need to reschedule, please do so here: https://www.smartrecruiters.com/app/interviews/schedule/abc",
      { fromAddress: "notifications@smartrecruiters.com" },
    ),
  );
  assert.equal(iso(smart?.startsAt), "2026-03-26T09:00:00.000Z");
  assert.equal(smart?.timezone, null);
  assert.equal(smart?.meetingUrl, "https://teams.microsoft.com/meet/333?p=abc");
  assert.equal(
    smart?.rescheduleUrl,
    "https://www.smartrecruiters.com/app/interviews/schedule/abc",
  );
  const german = parseInterviewMail(
    mail(
      "Einladung zum Vorstellungsgespräch",
      "Hiermit bestätigen wir Ihren Termin am Do., 10.12.2026 um 14:00 Uhr (MEZ).\nhttps://meet.google.com/abc-defg-hij",
    ),
  );
  assert.equal(iso(german?.startsAt), "2026-12-10T13:00:00.000Z");
});
const ics = (event: string, method = "REQUEST") =>
  [
    "BEGIN:VCALENDAR",
    "PRODID:-//Example//Calendar//EN",
    `METHOD:${method}`,
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Berlin",
    "BEGIN:DAYLIGHT",
    "DTSTART:19700329T020000",
    "TZOFFSETTO:+0200",
    "END:DAYLIGHT",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    event,
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "DESCRIPTION:Reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
test("ICS with TZID: times, links, organizer and colleagues only", () => {
  const parsed = parseIcs(
    ics(
      [
        "DTSTART;TZID=Europe/Berlin:20261022T101500",
        "DTEND;TZID=Europe/Berlin:20261022T104500",
        "SUMMARY:Interview with Acme",
        'ORGANIZER;CN="Weber, Jonas":mailto:jonas.weber@acme.example',
        "ATTENDEE;CN=Mara Lindqvist;ROLE=REQ-PARTICIPANT:mailto:mara@acme.example",
        "ATTENDEE;CN=Candidate Person:mailto:candidate@example.com",
        "ATTENDEE;CUTYPE=ROOM;CN=Room 1:mailto:room1@acme.example",
        "LOCATION:https://meet.google.com/abc-defg-hij",
        "DESCRIPTION:Join: https://meet.google.com/abc-defg-hij\\nReschedule: https://acme.example/reschedule/abc",
        " def",
      ].join("\r\n"),
    ),
  );
  assert.deepEqual(parsed, {
    startsAt: new Date("2026-10-22T08:15:00Z"),
    endsAt: new Date("2026-10-22T08:45:00Z"),
    timezone: "Europe/Berlin",
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    eventUrl: null,
    rescheduleUrl: "https://acme.example/reschedule/abcdef",
    interviewers: [
      { name: "Weber, Jonas", email: "jonas.weber@acme.example" },
      { name: "Mara Lindqvist", email: "mara@acme.example" },
    ],
    title: "Interview with Acme",
    provider: "ics",
    cancelled: false,
  });
});
test("ICS with UTC times, a duration and METHOD:CANCEL", () => {
  const parsed = parseIcs(
    ics(
      "DTSTART:20261022T081500Z\nDURATION:PT30M\nSUMMARY:Interview",
      "CANCEL",
    ),
  );
  assert.deepEqual(times(parsed), [
    "2026-10-22T08:15:00.000Z",
    "2026-10-22T08:45:00.000Z",
  ]);
  assert.equal(parsed?.timezone, null);
  assert.equal(parsed?.cancelled, true);
  assert.equal(
    parseIcs(ics("DTSTART:20261022T081500Z\nSTATUS:CANCELLED"))?.cancelled,
    true,
  );
});
test("ICS zones it cannot read give no time", () => {
  assert.equal(
    iso(
      parseIcs(
        ics(
          'DTSTART;TZID="W. Europe Standard Time":20261210T140000\nDTEND;TZID="W. Europe Standard Time":20261210T143000',
        ),
      )?.startsAt,
    ),
    "2026-12-10T13:00:00.000Z",
  );
  assert.equal(
    parseIcs(ics("DTSTART;VALUE=DATE:20261022"))?.startsAt,
    null,
    "all-day",
  );
  assert.equal(
    parseIcs(ics("DTSTART:20261022T101500"))?.startsAt,
    null,
    "floating",
  );
  assert.equal(
    parseIcs(ics("DTSTART;TZID=Mars/Olympus:20261022T101500"))?.startsAt,
    null,
  );
  assert.equal(parseIcs("not a calendar"), null);
});
test("a calendar part decides the time for a booking mail without one", () => {
  const parsed = parseInterviewMail(
    mail(
      "Candidate Person - Acme Interview",
      `This meeting was scheduled from the bookings page of Jonas Weber.

Use the following link to reschedule or cancel this meeting:
Manage meeting<https://outlook.office.com/bookwithme/user/abc@acme.example/booking/xyz?anonymous>

Microsoft Teams meeting
Join: https://teams.microsoft.com/meet/123456?p=abc
For organizers: Meeting options<https://teams.microsoft.com/meetingOptions/?organizerId=x>`,
      {
        calendar: ics(
          'DTSTART;TZID="W. Europe Standard Time":20261020T150000\nDTEND;TZID="W. Europe Standard Time":20261020T153000\nSUMMARY:Acme Interview\nORGANIZER;CN=Jonas Weber:mailto:jonas.weber@acme.example',
        ),
      },
    ),
  );
  assert.deepEqual(parsed, {
    startsAt: new Date("2026-10-20T13:00:00Z"),
    endsAt: new Date("2026-10-20T13:30:00Z"),
    timezone: "Europe/Berlin",
    meetingUrl: "https://teams.microsoft.com/meet/123456?p=abc",
    eventUrl: null,
    rescheduleUrl:
      "https://outlook.office.com/bookwithme/user/abc@acme.example/booking/xyz?anonymous",
    interviewers: [{ name: "Jonas Weber", email: "jonas.weber@acme.example" }],
    title: "Acme Interview",
    provider: "ics",
    cancelled: false,
    previousStartsAt: null,
  });
});
test("a mail with only an event or meeting link has no time", () => {
  const event = parseInterviewMail(
    mail(
      "Your interview with Acme",
      "Your interview with Acme has been scheduled.\nEvent link\nhttps://careers.acme.example/v/events/evt789",
      { fromAddress: "notifications@recruiteemail.com" },
    ),
  );
  assert.equal(event?.startsAt, null);
  assert.equal(event?.eventUrl, "https://careers.acme.example/v/events/evt789");
  const teams = parseInterviewMail(
    mail(
      "Candidate Person - Acme Interview",
      "This meeting was scheduled from the bookings page of Jonas Weber.\nJoin: https://teams.microsoft.com/meet/123456?p=abc",
    ),
  );
  assert.equal(teams?.startsAt, null);
  assert.equal(
    teams?.meetingUrl,
    "https://teams.microsoft.com/meet/123456?p=abc",
  );
});
test("missing year, missing zone or a wrong weekday give no time", () => {
  const link = "\nhttps://meet.google.com/abc-defg-hij";
  const confirmed = (when: string, withLink = true) =>
    parseInterviewMail(
      mail(
        "Your interview with Acme is confirmed",
        `Your interview is confirmed for ${when}.${withLink ? link : ""}`,
        { fromAddress: "no-reply@hire.lever.co" },
      ),
    );
  assert.equal(
    confirmed("Tuesday, October 20 at 2:00 PM CEST")?.startsAt,
    null,
  );
  assert.equal(confirmed("Tuesday, October 20 at 2:00 PM CEST", false), null);
  const noZone = confirmed("Tuesday, October 20, 2026 at 14:00");
  assert.ok(noZone);
  assert.equal(noZone.startsAt, null);
  assert.equal(noZone.meetingUrl, "https://meet.google.com/abc-defg-hij");
  assert.equal(
    confirmed("Tuesday, October 20, 2026 at 14:00", false),
    null,
    "a time without a zone is not enough on its own",
  );
  assert.equal(
    confirmed("Wednesday, October 20, 2026 at 2:00 PM CEST")?.startsAt,
    null,
  );
});
test("a booking in another language counts by its meeting link and subject", () => {
  const parsed = parseInterviewMail(
    mail(
      "Candidate Person - Recruiter Call @Acme Tech",
      "La riunione è stata pianificata dalla pagina delle prenotazioni di Mara Lindqvist.\nGestisci riunione<https://outlook.office.com/bookwithme/user/abc@acme.example/booking/xyz?anonymous>\nRiunione di Microsoft Teams\nPartecipa a: https://teams.microsoft.com/meet/381?p=abc",
    ),
  );
  assert.equal(
    parsed?.meetingUrl,
    "https://teams.microsoft.com/meet/381?p=abc",
  );
  assert.equal(
    parsed?.rescheduleUrl,
    "https://outlook.office.com/bookwithme/user/abc@acme.example/booking/xyz?anonymous",
  );
});
test("a Greenhouse reminder skips the location line above the date", () => {
  const parsed = parseInterviewMail(
    mail(
      "Reminder for interview with Acme for the Software Engineer position",
      "As a reminder, here is more information about your interviews:\n\nTeam Get 2 Know\nMara Lindqvist (Chief Product Officer)\nWork Place\nMay 4, 2026\n9:30am UTC",
      { fromAddress: "no-reply@eu.greenhouse.io" },
    ),
  );
  assert.equal(iso(parsed?.startsAt), "2026-05-04T09:30:00.000Z");
  assert.deepEqual(parsed?.interviewers, [
    { name: "Mara Lindqvist", role: "Chief Product Officer" },
  ]);
});
test("not interview confirmations", () => {
  assert.equal(
    parseInterviewMail(
      mail(
        "Reminder - Your Virtual Interview with Acme",
        'Hi Ogbonna,\n\nI noticed you haven\'t picked a time for your meeting. Please click the "Find a Time" button below.\n\nscheduled with goodtime.io',
      ),
    ),
    null,
    "a reminder without a time",
  );
  assert.equal(
    parseInterviewMail(
      mail(
        "Your application at Acme",
        "Thank you for taking the time to interview with us on Tuesday, 20 October 2026 at 14:00 CEST. Unfortunately, we have decided to move forward with other candidates.\nhttps://meet.google.com/abc-defg-hij",
      ),
    ),
    null,
    "a rejection mentioning an interview",
  );
  assert.equal(
    parseInterviewMail(
      mail(
        "Acme | 1st Round Interview",
        "We would like to get to know you better. You can use this link to book a convenient appointment: https://calendly.com/recruiter-name/first-call",
      ),
    ),
    null,
    "an invitation to book a slot",
  );
  assert.equal(
    parseInterviewMail(
      mail(
        "System Design Interview: How Would You Send 1 Million Notifications",
        "Published on Tuesday, October 20, 2026 at 2:00 PM CEST by a writer.",
        { fromAddress: "noreply@medium.example" },
      ),
    ),
    null,
    "a newsletter",
  );
  assert.equal(
    parseInterviewMail(
      mail(
        "Re: [acme/elections] feat: candidate import",
        "Merged and confirmed. Deployed Sep 19, 2026 21:52 UTC to the candidate pages.",
        { fromAddress: "notifications@github.example" },
      ),
    ),
    null,
    "a code notification about election candidates",
  );
  const confirmation = mail(
    "Your interview with Acme is confirmed",
    "Your interview is confirmed for Tuesday, October 20, 2026 at 2:00 PM CEST.\nhttps://meet.google.com/abc-defg-hij",
    { fromAddress: "no-reply@hire.lever.co" },
  );
  assert.equal(parseInterviewMail({ ...confirmation, fromMe: true }), null);
  assert.equal(
    parseInterviewMail(
      mail(
        "Re: Interview",
        "Thanks, see you then!\n\nOn Mon, Jan 12, 2026 at 10:00 AM Candidate <c@example.com> wrote:\n> Confirmed for Tuesday, January 13, 2026 at 1:00pm WAT https://meet.google.com/abc-defg-hij",
      ),
    ),
    null,
    "only the quoted history has a time",
  );
});

const lever = (
  body: string,
  subject = "Your interview with Acme is confirmed",
) =>
  parseInterviewMail(
    mail(subject, body, { fromAddress: "no-reply@hire.lever.co" }),
  );
const zoom = "\nhttps://acme.zoom.us/j/1";
test("a deadline is not the interview time", () => {
  assert.equal(
    parseInterviewMail(
      mail(
        "Interview invitation",
        "We'd like to invite you to an interview. Please book a slot by Friday, 23 October 2026 at 18:00 CEST using https://calendly.com/acme/30min",
      ),
    ),
    null,
  );
  const german = parseInterviewMail(
    mail(
      "Einladung zum Vorstellungsgespräch",
      `Bitte buchen Sie spätestens am Freitag, 23. Oktober 2026 um 18:00 Uhr (MESZ) einen Termin.${zoom}`,
    ),
  );
  assert.equal(german?.startsAt, null);
});
test("offered slots are not a confirmed time", () => {
  assert.equal(
    parseInterviewMail(
      mail(
        "Interview invitation",
        "You are invited to an interview. Please pick one: Monday, 26 October 2026 at 10:00 CET or Tuesday, 27 October 2026 at 14:00 CET. Reply with your choice.",
      ),
    ),
    null,
  );
  const withLink = parseInterviewMail(
    mail(
      "Interview invitation",
      `Which of these suits you? Monday, 26 October 2026 at 10:00 CET or Tuesday, 27 October 2026 at 14:00 CET${zoom}`,
    ),
  );
  assert.equal(withLink?.startsAt, null);
  assert.equal(withLink?.meetingUrl, "https://acme.zoom.us/j/1");
  const sessions = parseInterviewMail(
    mail(
      "Reminder for interview with Acme for the Software Engineer position",
      "As a reminder, here is more information about your interviews:\n\nTechnical interview\nMara Lindqvist\nMay 4, 2026\n9:30am UTC\nTeam interview\nJonas Weber\nMay 4, 2026\n10:15am UTC",
      { fromAddress: "no-reply@eu.greenhouse.io" },
    ),
  );
  assert.equal(
    iso(sessions?.startsAt),
    "2026-05-04T09:30:00.000Z",
    "a schedule of several sessions keeps the first",
  );
});
test("a start without am/pm takes the reading that ends after it", () => {
  const range = (text: string) =>
    times(
      lever(
        `Your interview is confirmed for Thursday, 22 October 2026, ${text} CEST.${zoom}`,
      ),
    );
  assert.deepEqual(range("11:30 - 12:30 PM"), [
    "2026-10-22T09:30:00.000Z",
    "2026-10-22T10:30:00.000Z",
  ]);
  assert.deepEqual(range("11:30 - 1:00 PM"), [
    "2026-10-22T09:30:00.000Z",
    "2026-10-22T11:00:00.000Z",
  ]);
  assert.deepEqual(range("9 - 10am"), [
    "2026-10-22T07:00:00.000Z",
    "2026-10-22T08:00:00.000Z",
  ]);
  assert.deepEqual(range("11pm - 12:30am"), [
    "2026-10-22T21:00:00.000Z",
    "2026-10-22T22:30:00.000Z",
  ]);
  assert.deepEqual(range("10:15 - 10:45 PM"), [
    "2026-10-22T20:15:00.000Z",
    "2026-10-22T20:45:00.000Z",
  ]);
});
test("a reschedule gives the new time and remembers the old one", () => {
  const moved = parseInterviewMail(
    mail(
      "Interview rescheduled",
      `Your interview on Thursday, 22 October 2026 at 10:15 CEST has been rescheduled to Friday, 23 October 2026 at 11:00 CEST.${zoom}`,
    ),
  );
  assert.equal(iso(moved?.startsAt), "2026-10-23T09:00:00.000Z");
  assert.equal(iso(moved?.previousStartsAt), "2026-10-22T08:15:00.000Z");
  const german = parseInterviewMail(
    mail(
      "Ihr Vorstellungsgespräch wurde verschoben",
      `Neuer Termin: Freitag, 23. Oktober 2026 um 11:00 Uhr (MESZ)\nBisheriger Termin: Donnerstag, 22. Oktober 2026 um 10:15 Uhr (MESZ)${zoom}`,
    ),
  );
  assert.equal(iso(german?.startsAt), "2026-10-23T09:00:00.000Z");
  assert.equal(iso(german?.previousStartsAt), "2026-10-22T08:15:00.000Z");
  const single = parseInterviewMail(
    mail(
      "Interview rescheduled",
      `Your interview has been moved to Friday, 23 October 2026 at 11:00 CEST.${zoom}`,
    ),
  );
  assert.equal(iso(single?.startsAt), "2026-10-23T09:00:00.000Z");
  assert.equal(single?.previousStartsAt, null);
});
test("Microsoft zone labels follow daylight saving", () => {
  const at = (when: string) => {
    const parsed = lever(`Your interview is confirmed for ${when}${zoom}`);
    return [iso(parsed?.startsAt), parsed?.timezone];
  };
  assert.deepEqual(
    at(
      "Thursday, 22 October 2026 10:15-10:45 (UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna",
    ),
    ["2026-10-22T08:15:00.000Z", "Europe/Berlin"],
  );
  assert.deepEqual(
    at(
      "Thursday, 10 December 2026 10:15-10:45 (UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna",
    ),
    ["2026-12-10T09:15:00.000Z", "Europe/Berlin"],
  );
  assert.deepEqual(
    at("Thursday, 22 October 2026 10:15 AM (Central European Standard Time)"),
    ["2026-10-22T08:15:00.000Z", "Europe/Berlin"],
  );
  assert.deepEqual(
    at("Thursday, 22 October 2026 10:15 AM W. Europe Standard Time"),
    ["2026-10-22T08:15:00.000Z", "Europe/Berlin"],
  );
  assert.deepEqual(
    at("Thursday, 22 October 2026 4:15 AM (Eastern Standard Time)"),
    ["2026-10-22T08:15:00.000Z", "America/New_York"],
  );
  assert.deepEqual(
    at("Thursday, 22 October 2026 10:15 AM (UTC+01:00) West Central Africa"),
    ["2026-10-22T09:15:00.000Z", "Africa/Lagos"],
  );
});
test("an IANA zone wins over a disagreeing offset", () => {
  const parsed = parseInterviewMail(
    mail(
      "Confirmation: Video interview on Tuesday, 27 October 2026 at 10:15 - 10:45 with Mara Lindqvist",
      "When\nTuesday 27 October 2026 at 10:15 - 10:45\nEurope/Berlin (+02:00)\nEvent link\nhttps://careers.acme.example/v/events/2\nPowered by Recruitee",
      { fromAddress: "notifications@recruiteemail.com" },
    ),
  );
  assert.deepEqual(times(parsed), [
    "2026-10-27T09:15:00.000Z",
    "2026-10-27T09:45:00.000Z",
  ]);
  assert.equal(parsed?.timezone, "Europe/Berlin");
  const offsetFirst = lever(
    "Your interview is confirmed for Tuesday, 27 October 2026, 10:15 - 10:45 (GMT+02:00) Europe/Berlin\nhttps://acme.zoom.us/j/1",
  );
  assert.deepEqual(times(offsetFirst), [
    "2026-10-27T09:15:00.000Z",
    "2026-10-27T09:45:00.000Z",
  ]);
  assert.equal(offsetFirst?.timezone, "Europe/Berlin");
});
test("two zones for one time: the European one names it, a disagreement gives no time", () => {
  const both = lever(
    `Your interview is confirmed for Thursday, 22 October 2026 at 4:15 AM EDT / 10:15 AM CEST.${zoom}`,
  );
  assert.equal(iso(both?.startsAt), "2026-10-22T08:15:00.000Z");
  assert.equal(both?.timezone, "Europe/Berlin");
  const american = lever(
    `Your interview is confirmed for Thursday, 22 October 2026 at 4:15 AM EDT (1:15 AM PDT).${zoom}`,
  );
  assert.equal(iso(american?.startsAt), "2026-10-22T08:15:00.000Z");
  assert.equal(american?.timezone, "America/New_York");
  const wrong = lever(
    `Your interview is confirmed for Thursday, 22 October 2026 at 4:15 AM EDT / 11:15 AM CEST.${zoom}`,
  );
  assert.ok(wrong);
  assert.equal(wrong.startsAt, null);
});
test("company names are not interviewers", () => {
  const parsed = parseInterviewMail(
    mail(
      "Confirmation: Video interview on Thursday, 22 October 2026 at 10:15 - 10:45 with Mara Lindqvist",
      "Interview with Acme Mobility\nWhen\nThursday 22 October 2026 at 10:15 - 10:45\nEurope/Berlin (+02:00)\nInterviewers\nMara Lindqvist\nAcme Technologies\nAcme Talent Team\nNorth Star GmbH\nCandidate\nEvent link\nhttps://careers.acme.example/v/events/1",
      { fromAddress: "mara.lindqvist@acme.example" },
    ),
  );
  assert.deepEqual(parsed?.interviewers, [{ name: "Mara Lindqvist" }]);
});
test("other written forms of a time", () => {
  const at = (body: string, subject?: string) =>
    iso(lever(`${body}${zoom}`, subject)?.startsAt);
  assert.equal(
    at("Termin bestätigt: 22.10.2026, 10.15 - 10.45 Uhr MESZ."),
    "2026-10-22T08:15:00.000Z",
  );
  assert.equal(
    at(
      "Your interview is confirmed for Thursday, 22 October 2026 at 10:15:00 CEST.",
    ),
    "2026-10-22T08:15:00.000Z",
  );
  assert.equal(
    at(
      "Your interview is confirmed for Thursday, 22 October 2026 at 10:15\nTime zone: Europe/Berlin",
    ),
    "2026-10-22T08:15:00.000Z",
  );
  assert.equal(
    at(
      "---------- Forwarded message ---------\nFrom: Acme <jobs@acme.example>\nDate: Mon, 19 Oct 2026 at 09:00\nSubject: Interview confirmed\n\nYour interview: Thursday, 22 October 2026 at 10:15 CEST",
      "Fwd: Interview confirmed",
    ),
    "2026-10-22T08:15:00.000Z",
  );
});
