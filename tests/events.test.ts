import test from "node:test";
import assert from "node:assert/strict";
import {
  eventCalendar,
  eventKey,
  eventMatch,
  europeanCountry,
  isUpcomingEurope,
  type IncomingEvent,
} from "../src/lib/events/domain";
import {
  parseDevelopers,
  parseConfs,
  parseLuma,
  parseLumaDiscover,
  parseMlh,
  parseHacktrack,
} from "../src/lib/events/connectors";
const event: IncomingEvent = {
  externalId: "test",
  title: "React and agentic AI hackathon",
  url: "https://example.com/event",
  description: "",
  kind: "hackathon",
  city: "Berlin",
  country: "DE",
  format: "in-person",
  startsAt: new Date("2026-10-10"),
  endsAt: new Date("2026-10-12"),
  allDay: true,
  topics: [],
};
test("Europe, dates and explicit relevance gate out unrelated or expired events", () => {
  assert.equal(europeanCountry("UK"), "GB");
  assert.equal(europeanCountry("Czech Republic"), "CZ");
  assert.equal(europeanCountry("United States"), null);
  assert.ok(isUpcomingEurope(event, new Date("2026-10-11")));
  assert.equal(isUpcomingEurope(event, new Date("2026-10-12")), false);
  assert.equal(
    isUpcomingEurope({ ...event, country: "US" }, new Date("2026-10-01")),
    false,
  );
  assert.equal(
    isUpcomingEurope({ ...event, format: "online" }, new Date("2026-10-01")),
    false,
  );
  assert.equal(
    eventMatch({ ...event, title: "Pilates evening", kind: "meetup" }).score,
    0,
  );
  assert.ok(eventMatch(event).topics.includes("AI & agents"));
  assert.ok(
    eventMatch({ ...event, title: "React meetup", kind: "meetup" }).score >
      eventMatch({
        ...event,
        title: "React meetup",
        kind: "meetup",
        country: "FR",
      }).score,
  );
});
test("deduplication recognizes Luma aliases and separates different dates", () => {
  assert.equal(
    eventKey("https://lu.ma/abc?utm_source=x", event.startsAt),
    eventKey("https://luma.com/abc", event.startsAt),
  );
  assert.notEqual(
    eventKey(event.url, event.startsAt),
    eventKey(event.url, new Date("2027-10-10")),
  );
});
test("conference adapters preserve inclusive source dates as exclusive calendar ends", () => {
  const d = parseDevelopers([
    {
      name: "React",
      hyperlink: event.url,
      date: [Date.parse("2026-10-10"), Date.parse("2026-10-11")],
      country: "Germany",
      city: "Berlin",
      tags: [{ value: "react" }],
    },
    { name: "Bad link", hyperlink: "javascript:alert(1)", date: [1] },
  ]);
  assert.equal(d.length, 1);
  assert.equal(d[0].endsAt.toISOString(), "2026-10-12T00:00:00.000Z");
  const c = parseConfs(
    [
      {
        name: "Test",
        url: event.url,
        startDate: "2026-10-10",
        endDate: "2026-10-11",
        country: "UK",
        city: "London",
        online: true,
      },
    ],
    "javascript",
  );
  assert.equal(c[0].format, "hybrid");
  assert.equal(c[0].country, "GB");
});
test("Luma keeps actual time, price and approval requirements without importing guest profiles", () => {
  const data = {
    props: {
      pageProps: {
        initialData: {
          data: {
            place: { name: "Berlin" },
            events: [
              {
                event: {
                  api_id: "evt-test",
                  name: "AI meetup",
                  url: "abc",
                  start_at: "2026-10-10T16:00:00Z",
                  end_at: "2026-10-10T18:00:00Z",
                  timezone: "Europe/Berlin",
                  geo_address_info: { city: "Berlin", country_code: "DE" },
                },
                ticket_info: {
                  is_free: false,
                  price: { cents: 1250, currency: "eur" },
                  require_approval: true,
                },
                hosts: [{ name: "Not retained" }],
              },
            ],
          },
        },
      },
    },
  };
  const batch = parseLuma(
    `<script id="__NEXT_DATA__">${JSON.stringify(data)}</script>`,
  );
  assert.equal(batch.complete, false);
  assert.equal(batch.events[0].allDay, false);
  assert.equal(batch.events[0].free, false);
  assert.match(batch.events[0].cost!, /12.50/);
  assert.match(batch.events[0].eligibility!, /approval/);
  assert.ok(!JSON.stringify(batch.events).includes("Not retained"));
  assert.throws(() => parseLuma("<html>Layout changed</html>"));
});
test("the Luma discovery listing reads the same rows and reports paging", () => {
  const entry = (id: string, city?: string) => ({
    event: {
      api_id: id,
      name: "Payments hack",
      url: id,
      start_at: "2026-10-24T08:00:00Z",
      end_at: "2026-10-24T18:00:00Z",
      timezone: "Europe/Berlin",
      location_type: "offline",
      geo_address_info: city ? { city, country_code: "DE" } : undefined,
    },
    ticket_info: { is_free: true },
  });
  const page = parseLumaDiscover(
    { entries: [entry("evt-a", "Berlin"), entry("evt-b")], has_more: true, next_cursor: "c1" },
    "Berlin",
  );
  assert.deepEqual(page.events.map((e) => e.externalId), ["evt-a", "evt-b"]);
  assert.equal(page.events[1].city, "Berlin", "falls back to the place name");
  assert.equal(page.events[0].kind, "hackathon");
  assert.equal(page.events[0].free, true);
  assert.deepEqual([page.more, page.cursor], [true, "c1"]);
  const last = parseLumaDiscover({ entries: [], has_more: false }, "Berlin");
  assert.deepEqual([last.more, last.cursor], [false, null]);
  assert.throws(() => parseLumaDiscover({ events: [] }, "Berlin"), /format changed/);
});
test("MLH requirements remain explicit and HackTrack ranges do not become exact times", () => {
  const html =
    '<a itemtype="https://schema.org/Event"><h4>Student Hack</h4><meta itemprop="url" content="https://example.com/hack"><meta itemprop="startDate" content="2026-10-10T16:00:00Z"><meta itemprop="endDate" content="2026-10-11T17:00:00Z"><meta itemprop="addressCountry" content="GB"><meta itemprop="addressLocality" content="London"><meta itemprop="isAccessibleForFree" content="true"></a>';
  const mlh = parseMlh(html);
  assert.match(mlh[0].eligibility!, /Student/);
  assert.equal(mlh[0].free, true);
  const rows = parseHacktrack(
    "<!-- UPCOMING_TABLE_START -->\n| Agents Hack | London, UK | 23 Oct-25, 2026 | AI | [Link](https://luma.com/test) |\n<!-- UPCOMING_TABLE_END -->",
  );
  assert.equal(rows[0].endsAt.toISOString(), "2026-10-26T00:00:00.000Z");
  assert.equal(rows[0].allDay, true);
});
test("calendar export escapes text, folds UTF-8 safely and preserves date-only semantics", () => {
  const ics = eventCalendar({
    ...event,
    id: "test",
    status: "listed",
    title: "AI, React; " + "é".repeat(90) + "\nBEGIN:FAKE",
  });
  assert.match(ics, /DTSTART;VALUE=DATE:20261010/);
  assert.match(ics, /DTEND;VALUE=DATE:20261012/);
  assert.ok(ics.includes("SUMMARY:AI\\, React\\;"));
  assert.ok(!ics.includes("\r\nBEGIN:FAKE"));
  for (const line of ics.split("\r\n"))
    assert.ok(Buffer.byteLength(line) <= 75);
  const timed = eventCalendar({
    ...event,
    id: "test",
    status: "cancelled",
    allDay: false,
  });
  assert.match(timed, /DTSTART:20261010T000000Z/);
  assert.match(timed, /STATUS:CANCELLED/);
});
