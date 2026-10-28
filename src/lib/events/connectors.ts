import * as cheerio from "cheerio";
import { safeUrl } from "../domain";
import { europeanCountry, type IncomingEvent } from "./domain";

type Row = Record<string, any>; // External documents are checked at each adapter boundary.
export type EventBatch = {
  events: IncomingEvent[];
  complete: boolean;
  message: string | null;
};
const day = (s: string | number) => new Date(s);
const nextDay = (d: Date) => new Date(d.valueOf() + 86400000);
const clean = (text: unknown) =>
  cheerio
    .load(String(text ?? ""))
    .text()
    .replace(/\s+/g, " ")
    .trim();
function base(
  title: string,
  url: string,
  start: Date,
  end: Date,
): IncomingEvent {
  if (
    !safeUrl(url) ||
    !Number.isFinite(start.valueOf()) ||
    !Number.isFinite(end.valueOf())
  )
    throw new Error("Invalid event link or date.");
  return {
    externalId: url,
    title: clean(title),
    url: safeUrl(url),
    description: "",
    kind: "conference",
    city: "",
    country: "",
    format: "in-person",
    startsAt: start,
    endsAt: end,
    allDay: true,
    topics: [],
  };
}
export function parseDevelopers(rows: unknown): IncomingEvent[] {
  if (!Array.isArray(rows)) throw new Error("Conference feed format changed.");
  return rows.flatMap((r: Row) => {
    if (!r.name || !r.hyperlink || !Array.isArray(r.date) || !r.date.length)
      return [];
    try {
      const dates = r.date
        .map(Number)
        .filter(Number.isFinite)
        .sort((a: number, b: number) => a - b);
      if (!dates.length) return [];
      return [
        {
          ...base(
            r.name,
            r.hyperlink,
            day(dates[0]),
            nextDay(day(dates.at(-1)!)),
          ),
          externalId: `${r.hyperlink}|${new Date(dates[0]).getUTCFullYear()}`,
          city: r.city ?? "",
          country: europeanCountry(r.country ?? "") ?? "",
          description: clean(r.misc),
          topics: (r.tags ?? []).map((x: Row) => String(x.value)),
          status: /cancel/i.test(r.status ?? "") ? "cancelled" : "listed",
        },
      ];
    } catch {
      return [];
    }
  });
}
export function parseConfs(rows: unknown, category: string): IncomingEvent[] {
  if (!Array.isArray(rows)) throw new Error("Confs.tech feed format changed.");
  return rows.flatMap((r: Row) => {
    if (!r.name || !r.url || !/^\d{4}-\d{2}-\d{2}$/.test(r.startDate))
      return [];
    try {
      return [
        {
          ...base(
            r.name,
            r.url,
            day(r.startDate),
            nextDay(day(r.endDate || r.startDate)),
          ),
          externalId: `${r.url}|${r.startDate.slice(0, 4)}`,
          city: r.city ?? "",
          country: europeanCountry(r.country ?? "") ?? "",
          format: r.online
            ? r.city && r.country
              ? "hybrid"
              : "online"
            : "in-person",
          topics: [category, "software development"],
          description: `${category} conference. ${r.locales ? `Published languages: ${r.locales}.` : ""}`,
        },
      ];
    } catch {
      return [];
    }
  });
}
function lumaPage(html: string): { events: Row[]; place: Row } {
  const $ = cheerio.load(html);
  const raw = $("#__NEXT_DATA__").text();
  if (!raw) throw new Error("Luma public page format changed.");
  const data = JSON.parse(raw).props?.pageProps?.initialData?.data;
  if (!Array.isArray(data?.events) || !data?.place)
    throw new Error("Luma city listings are unavailable.");
  return data;
}
// City page rows and discovery feed entries share one shape: { event, ticket_info }.
function lumaEvents(rows: Row[], placeName: string): IncomingEvent[] {
  return rows.flatMap((row: Row) => {
    const e = row.event;
    if (!e?.start_at || !e.end_at || !e.url) return [];
    try {
      const ticket = row.ticket_info;
      const price = ticket?.price;
      const cost = ticket?.is_free
        ? "Free"
        : price && Number.isFinite(price.cents) && price.currency
          ? `From ${new Intl.NumberFormat("en", { style: "currency", currency: price.currency }).format(price.cents / 100)}`
          : "Price not published";
      return [
        {
          ...base(
            e.name,
            `https://luma.com/${e.url}`,
            day(e.start_at),
            day(e.end_at),
          ),
          externalId: e.api_id,
          city: e.geo_address_info?.city ?? placeName,
          country:
            europeanCountry(
              e.geo_address_info?.country_code ??
                e.geo_address_info?.country ??
                "",
            ) ?? "",
          format: e.location_type === "online" ? "online" : "in-person",
          allDay: false,
          timezone: e.timezone,
          kind: /hackathon|hack day|\bhack\b/i.test(e.name)
            ? "hackathon"
            : /workshop|hands.on|bootcamp/i.test(e.name)
              ? "workshop"
              : /conference|summit/i.test(e.name)
                ? "conference"
                : "meetup",
          cost,
          free: ticket?.is_free === true,
          eligibility: ticket?.require_approval
            ? "Organizer approval required. Check participation requirements."
            : "Check the organizer's participation requirements.",
          status: ticket?.is_sold_out
            ? "sold-out"
            : e.cancelled_at
              ? "cancelled"
              : "listed",
        },
      ];
    } catch {
      return [];
    }
  });
}
export function parseLuma(html: string): EventBatch {
  const data = lumaPage(html);
  return {
    events: lumaEvents(data.events, data.place.name),
    complete: false,
    message: `Public city page selection (${data.events.length} listings); not the full Luma catalogue. Ticket availability can change.`,
  };
}
// The public listing behind a city page, which reaches further than the page's first 20.
export function parseLumaDiscover(
  body: unknown,
  placeName: string,
): { events: IncomingEvent[]; more: boolean; cursor: string | null } {
  const data = body as Row;
  if (!Array.isArray(data?.entries))
    throw new Error("Luma discovery listing format changed.");
  return {
    events: lumaEvents(data.entries, placeName),
    more: data.has_more === true,
    cursor: typeof data.next_cursor === "string" ? data.next_cursor : null,
  };
}
const lumaDiscoverPages = 5;
async function fetchLuma(city: string): Promise<EventBatch> {
  const page = lumaPage((await get(`https://luma.com/${city}`))!);
  const events = lumaEvents(page.events, page.place.name);
  const placeId = page.place.api_id;
  if (typeof placeId !== "string")
    return {
      events,
      complete: false,
      message: `Public city page selection (${events.length} listings); the extended listing has no place id.`,
    };
  const seen = new Set(events.map((e) => e.externalId));
  let cursor: string | null = null;
  let more = false;
  try {
    for (let n = 0; n < lumaDiscoverPages; n++) {
      const params = new URLSearchParams({
        discover_place_api_id: placeId,
        pagination_limit: "50",
      });
      if (cursor) params.set("pagination_cursor", cursor);
      const batch = parseLumaDiscover(
        JSON.parse(
          (await get(
            `https://api.lu.ma/discover/get-paginated-events?${params}`,
          ))!,
        ),
        page.place.name,
      );
      for (const e of batch.events)
        if (!seen.has(e.externalId)) {
          seen.add(e.externalId);
          events.push(e);
        }
      ({ cursor, more } = batch);
      if (!more || !cursor) break;
    }
  } catch (error) {
    // The city page alone is still a usable, if shorter, selection.
    return {
      events,
      complete: false,
      message: `Public city page selection (${page.events.length} listings); the extended listing failed: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
  return {
    events,
    complete: false,
    message: `Public city listing (${events.length} listings${more ? `, more after ${lumaDiscoverPages} pages not read` : ""}); not the full Luma catalogue. Ticket availability can change.`,
  };
}
export function parseMlh(html: string): IncomingEvent[] {
  const $ = cheerio.load(html);
  const cards = $('[itemtype="https://schema.org/Event"]');
  if (!cards.length)
    throw new Error("MLH event markup changed or has no published events.");
  return cards.toArray().flatMap((el) => {
    const card = $(el);
    const prop = (name: string) =>
      card.find(`[itemprop="${name}"]`).attr("content") ??
      card.find(`[itemprop="${name}"]`).text();
    try {
      const start = prop("startDate"),
        end = prop("endDate");
      if (!start || !end) return [];
      return [
        {
          ...base(
            card.find("h4").text() || prop("name"),
            prop("url"),
            day(start),
            day(end),
          ),
          externalId: `${prop("url")}|${start.slice(0, 4)}`,
          city: prop("addressLocality"),
          country: europeanCountry(prop("addressCountry")) ?? "",
          format: /OnlineEvent/.test(prop("eventAttendanceMode"))
            ? "online"
            : "in-person",
          allDay: false,
          kind: "hackathon",
          free: prop("isAccessibleForFree") === "true",
          cost:
            prop("isAccessibleForFree") === "true"
              ? "Free"
              : "Price not published",
          topics: ["software development"],
          eligibility:
            "Student-focused MLH event. Verify student/recent-graduate eligibility before planning travel.",
        },
      ];
    } catch {
      return [];
    }
  });
}
export function parseHacktrack(markdown: string): IncomingEvent[] {
  const block = markdown
    .split("<!-- UPCOMING_TABLE_START -->")[1]
    ?.split("<!-- UPCOMING_TABLE_END -->")[0];
  if (block === undefined)
    throw new Error("HackTrack EU table format changed.");
  return block.split("\n").flatMap((line) => {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((s) => s.trim());
    if (cells.length < 5) return [];
    const url = cells[4].match(/\]\((https:\/\/[^)]+)\)/)?.[1];
    // This index publishes date-only ranges such as "23 Oct-25, 2026".
    const d = cells[2].match(
      /^(\d{1,2}) ([A-Za-z]{3,9})(?:-(\d{1,2}))?,? (\d{4})$/,
    );
    if (!url || !d) return [];
    try {
      const start = new Date(`${d[2]} ${d[1]}, ${d[4]} 00:00:00 GMT`);
      const end = new Date(`${d[2]} ${d[3] ?? d[1]}, ${d[4]} 00:00:00 GMT`);
      const location = cells[1].split(",").map((x) => x.trim());
      return [
        {
          ...base(cells[0], url, start, nextDay(end)),
          kind: "hackathon",
          city: location.slice(0, -1).join(", "),
          country: europeanCountry(location.at(-1) ?? "") ?? "",
          topics: [cells[3]],
          description:
            "Listed by HackTrack EU. Date-only listing; verify the schedule, ticket price and eligibility with the organizer.",
        },
      ];
    } catch {
      return [];
    }
  });
}
class FeedError extends Error {
  constructor(
    message: string,
    public retryAfterSeconds = 0,
  ) {
    super(message);
  }
}
async function get(url: string, allow404 = false): Promise<string | null> {
  // All network destinations come from adapter constants; user-supplied event links are never fetched.
  const response = await fetch(url, {
    signal: AbortSignal.timeout(25000),
    headers: {
      "User-Agent": "Jobdesk/0.1 personal event discovery",
      Accept: "application/json,text/html,text/plain",
    },
    redirect: "error",
    cache: "no-store",
  });
  if (allow404 && response.status === 404) return null;
  if (!response.ok) {
    const retry = response.headers.get("retry-after");
    const seconds = retry
      ? /^\d+$/.test(retry)
        ? Number(retry)
        : Math.max(0, (Date.parse(retry) - Date.now()) / 1000)
      : 0;
    throw new FeedError(
      `Event feed returned HTTP ${response.status}.`,
      Number.isFinite(seconds) ? seconds : 0,
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty event feed response.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 12_000_000) {
      await reader.cancel();
      throw new Error("Event feed exceeds the 12 MB response limit.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function fetchEvents(
  source: { kind: string; scope: string },
  now = new Date(),
): Promise<EventBatch> {
  if (source.kind === "developers")
    return {
      events: parseDevelopers(
        JSON.parse((await get("https://developers.events/all-events.json"))!),
      ),
      complete: true,
      message:
        "Community-maintained conference index; organizer details need verification.",
    };
  if (source.kind === "luma") {
    if (!LUMA_CITIES.includes(source.scope))
      throw new Error("Unsupported Luma city.");
    return fetchLuma(source.scope);
  }
  if (source.kind === "mlh") {
    const year = now.getUTCFullYear() + (now.getUTCMonth() >= 6 ? 1 : 0);
    return {
      events: parseMlh(
        (await get(`https://www.mlh.com/seasons/${year}/events`))!,
      ),
      complete: true,
      message: `MLH ${year} season. Student-focused eligibility requires review.`,
    };
  }
  if (source.kind === "hacktrack")
    return {
      events: parseHacktrack(
        (await get(
          "https://raw.githubusercontent.com/lorenzopalaia/HackTrack-EU/main/README.md",
        ))!,
      ),
      complete: true,
      message:
        "Community index of upcoming European hackathons. Verify dates with the organizer.",
    };
  if (source.kind === "confs") {
    const events: IncomingEvent[] = [];
    const errors: string[] = [];
    let found = 0;
    for (const year of [now.getUTCFullYear(), now.getUTCFullYear() + 1])
      for (const category of [
        "javascript",
        "typescript",
        "api",
        "data",
        "devops",
        "general",
        "opensource",
        "css",
        "testing",
      ]) {
        try {
          const raw = await get(
            `https://raw.githubusercontent.com/tech-conferences/conference-data/main/conferences/${year}/${category}.json`,
            true,
          );
          if (raw) {
            events.push(...parseConfs(JSON.parse(raw), category));
            found++;
          }
        } catch (e) {
          errors.push(
            `${year}/${category}: ${e instanceof Error ? e.message : "Fetch failed"}`,
          );
        }
      }
    if (!found) throw new Error("No conference categories could be fetched.");
    return {
      events,
      complete: errors.length === 0,
      message: errors.length
        ? `${errors.length} category feeds failed. ${errors[0]}`
        : "Nine engineering topics, current and next calendar year.",
    };
  }
  throw new Error("Unsupported event source.");
}
export const LUMA_CITIES = [
  "berlin",
  "munich",
  "london",
  "paris",
  "amsterdam",
  "lisbon",
  "barcelona",
  "zurich",
];
