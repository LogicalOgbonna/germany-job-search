import type { Interviewer, ParsedInterview } from "../interviews/types";
import type { RawMail } from "./types";

// A stated zone: a fixed offset (minutes east of UTC) when the mail names one, otherwise an IANA
// name whose daylight saving rules decide the offset ("Central European Time - Berlin").
type Zone = { offset: number | null; iana: string | null };
type Wall = { y: number; mo: number; d: number; h: number; mi: number };
// One date with a time. `startsAt` is null when no zone is stated or two stated zones disagree.
type Found = {
  at: number;
  lead: string; // the text just before the date or time, for "by", "to", "from"
  startsAt: Date | null;
  endsAt: Date | null;
  iana: string | null;
  deadline: boolean;
};

const validZones = new Map<string, boolean>();
function validZone(name: string) {
  if (!validZones.has(name))
    try {
      new Intl.DateTimeFormat("en", { timeZone: name });
      validZones.set(name, true);
    } catch {
      validZones.set(name, false);
    }
  return validZones.get(name)!;
}
const cities = new Map(
  Intl.supportedValuesOf("timeZone").map((zone) => [
    zone.split("/").pop()!.replace(/_/g, " ").toLowerCase(),
    zone,
  ]),
);
const formatters = new Map<string, Intl.DateTimeFormat>();
function offsetAt(zone: string, at: number) {
  let format = formatters.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    formatters.set(zone, format);
  }
  const part = (type: string) =>
    Number(format.formatToParts(at).find((p) => p.type === type)?.value);
  const wall = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
  );
  return (wall - (at - (at % 60000))) / 60000;
}
// Wall-clock time in an IANA zone to an instant. The second pass settles days when the clocks change.
function fromWall(wall: number, zone: string) {
  const first = wall - offsetAt(zone, wall) * 60000;
  return wall - offsetAt(zone, first) * 60000;
}
const instant = (w: Wall, zone: Zone) => {
  const wall = Date.UTC(w.y, w.mo, w.d, w.h, w.mi);
  return new Date(
    zone.offset !== null
      ? wall - zone.offset * 60000
      : fromWall(wall, zone.iana!),
  );
};

const berlin = "Europe/Berlin";
const abbreviations: Record<string, Zone> = {
  CEST: { offset: 120, iana: berlin },
  MESZ: { offset: 120, iana: berlin },
  CET: { offset: 60, iana: berlin },
  MEZ: { offset: 60, iana: berlin },
  WAT: { offset: 60, iana: "Africa/Lagos" },
  BST: { offset: 60, iana: "Europe/London" },
  GMT: { offset: 0, iana: "UTC" },
  UTC: { offset: 0, iana: "UTC" },
  WEST: { offset: 60, iana: "Europe/Lisbon" },
  WET: { offset: 0, iana: "Europe/Lisbon" },
  EEST: { offset: 180, iana: "Europe/Helsinki" },
  EET: { offset: 120, iana: "Europe/Helsinki" },
  EDT: { offset: -240, iana: "America/New_York" },
  EST: { offset: -300, iana: "America/New_York" },
  CDT: { offset: -300, iana: "America/Chicago" },
  CST: { offset: -360, iana: "America/Chicago" },
  MDT: { offset: -360, iana: "America/Denver" },
  MST: { offset: -420, iana: "America/Denver" },
  PDT: { offset: -420, iana: "America/Los_Angeles" },
  PST: { offset: -480, iana: "America/Los_Angeles" },
  ET: { offset: null, iana: "America/New_York" },
  PT: { offset: null, iana: "America/Los_Angeles" },
};
// Windows zone names, in ICS TZIDs and in Outlook and Teams text.
const windowsZones: Record<string, string> = {
  "W. Europe Standard Time": berlin,
  "Central Europe Standard Time": "Europe/Budapest",
  "Central European Standard Time": berlin,
  "Romance Standard Time": "Europe/Paris",
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "W. Central Africa Standard Time": "Africa/Lagos",
  "GTB Standard Time": "Europe/Bucharest",
  "FLE Standard Time": "Europe/Kyiv",
  "Eastern Standard Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles",
  "India Standard Time": "Asia/Kolkata",
  "Coordinated Universal Time": "UTC",
  UTC: "UTC",
};
// Generic names ("Central European Time") follow the region's clock all year; Google uses them in summer too.
const longNames: Record<string, Zone> = {
  "central european summer time": { offset: 120, iana: berlin },
  // Microsoft prints "Central European Standard Time" all year.
  "central european standard time": { offset: null, iana: berlin },
  "central european time": { offset: null, iana: berlin },
  "mitteleuropäische sommerzeit": { offset: 120, iana: berlin },
  "mitteleuropäische normalzeit": { offset: 60, iana: berlin },
  "mitteleuropäische zeit": { offset: null, iana: berlin },
  "west africa standard time": { offset: 60, iana: "Africa/Lagos" },
  "west africa time": { offset: 60, iana: "Africa/Lagos" },
  "british summer time": { offset: 60, iana: "Europe/London" },
  "greenwich mean time": { offset: 0, iana: "UTC" },
  "coordinated universal time": { offset: 0, iana: "UTC" },
  "eastern european summer time": { offset: 180, iana: "Europe/Helsinki" },
  "eastern european standard time": { offset: 120, iana: "Europe/Helsinki" },
  "eastern european time": { offset: null, iana: "Europe/Helsinki" },
  "western european summer time": { offset: 60, iana: "Europe/Lisbon" },
  "western european standard time": { offset: 0, iana: "Europe/Lisbon" },
  "western european time": { offset: null, iana: "Europe/Lisbon" },
  "eastern daylight time": { offset: -240, iana: "America/New_York" },
  "eastern standard time": { offset: -300, iana: "America/New_York" },
  "eastern time": { offset: null, iana: "America/New_York" },
  "central daylight time": { offset: -300, iana: "America/Chicago" },
  "central standard time": { offset: -360, iana: "America/Chicago" },
  "central time": { offset: null, iana: "America/Chicago" },
  "mountain daylight time": { offset: -360, iana: "America/Denver" },
  "mountain standard time": { offset: -420, iana: "America/Denver" },
  "mountain time": { offset: null, iana: "America/Denver" },
  "pacific daylight time": { offset: -420, iana: "America/Los_Angeles" },
  "pacific standard time": { offset: -480, iana: "America/Los_Angeles" },
  "pacific time": { offset: null, iana: "America/Los_Angeles" },
  "india standard time": { offset: 330, iana: "Asia/Kolkata" },
  // Microsoft prints these all year, so they follow the region's clock.
  ...Object.fromEntries(
    Object.entries(windowsZones)
      .filter(([name]) => / Standard Time$/.test(name))
      .map(([name, iana]) => [name.toLowerCase(), { offset: null, iana }]),
  ),
};
// Outlook's "(UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna": the place list names the zone.
const windowsPlaces: Record<string, string> = {
  "west central africa": "Africa/Lagos",
  "eastern time (us & canada)": "America/New_York",
  "central time (us & canada)": "America/Chicago",
  "mountain time (us & canada)": "America/Denver",
  "pacific time (us & canada)": "America/Los_Angeles",
  "coordinated universal time": "UTC",
  "new delhi": "Asia/Kolkata",
};
const alternation = (words: string[]) =>
  [...words]
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
const longPattern = new RegExp(
  `^\\s*\\(?\\s*(${alternation(Object.keys(longNames))})(\\s+-\\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ_ .'-]*[A-Za-zÀ-ÿ]))?`,
  "i",
);
const abbreviationPattern = new RegExp(
  `^\\s*\\(?\\s*(${alternation(Object.keys(abbreviations))})(?![A-Za-z/])`,
);
const signed = (sign: string, hours: string, minutes = "0") =>
  (sign === "+" ? 1 : -1) * (Number(hours) * 60 + Number(minutes));
// The zone stated at the start of `text`, and how many characters it took.
function zoneAt(text: string): { zone: Zone; length: number } | null {
  const label = /^\s*(?:time ?zone|zeitzone)\s*:/i.exec(text)?.[0].length ?? 0;
  const found = zoneAfterLabel(text.slice(label));
  return found && { ...found, length: found.length + label };
}
function zoneAfterLabel(text: string): { zone: Zone; length: number } | null {
  let m =
    /^\s*\((?:UTC|GMT)(?:\s*[+\-−]\s*\d{1,2}(?::?\d{2})?)?\)[ \t]*([^\n]+)/.exec(
      text,
    );
  if (m) {
    const places = m[1]
      .split(",")
      .map((p) => p.trim().replace(/\.$/, "").toLowerCase());
    const iana = places.includes("berlin")
      ? berlin
      : (windowsPlaces[m[1].trim().replace(/\.$/, "").toLowerCase()] ??
        places.map((p) => windowsPlaces[p] ?? cities.get(p)).find(Boolean));
    if (iana) return { zone: { offset: null, iana }, length: m[0].length };
  }
  // A zone name and an offset ("Europe/Berlin (+02:00)"): the name decides, the offset may be stale.
  m =
    /^\s*\(?\s*([A-Z][A-Za-z_]+(?:\/[A-Za-z_+-]+){1,2})(?:\s*\(\s*(?:GMT|UTC)?\s*[+\-−]\d{2}:?\d{2}\s*\))?/.exec(
      text,
    );
  if (m && validZone(m[1]))
    return { zone: { offset: null, iana: m[1] }, length: m[0].length };
  m =
    /^\s*\(?\s*(?:GMT|UTC)\s*([+\-−])\s*(\d{1,2})(?::?(\d{2}))?(?!\d)\)?/.exec(
      text,
    );
  if (m) {
    const iana = /^\s*([A-Z][A-Za-z_]+(?:\/[A-Za-z_+-]+){1,2})/.exec(
      text.slice(m[0].length),
    );
    if (iana && validZone(iana[1]))
      return {
        zone: { offset: null, iana: iana[1] },
        length: m[0].length + iana[0].length,
      };
    const named = longPattern.exec(text.slice(m[0].length));
    return {
      zone: {
        offset: signed(m[1] === "+" ? "+" : "-", m[2], m[3]),
        iana: named ? longNames[named[1].toLowerCase()].iana : null,
      },
      length: m[0].length,
    };
  }
  m = longPattern.exec(text);
  if (m) {
    const base = longNames[m[1].toLowerCase()];
    const place = m[3]?.toLowerCase();
    const city =
      place && (cities.get(place) ?? cities.get(place.split(/\s+/)[0]));
    return {
      zone: { offset: base.offset, iana: city || base.iana },
      length: m[0].length - (city ? 0 : (m[2]?.length ?? 0)),
    };
  }
  m = abbreviationPattern.exec(text);
  if (m) return { zone: abbreviations[m[1]], length: m[0].length };
  return null;
}

const months: Record<string, number> = {
  jan: 0,
  january: 0,
  januar: 0,
  jän: 0,
  jänner: 0,
  feb: 1,
  february: 1,
  februar: 1,
  mar: 2,
  march: 2,
  mär: 2,
  märz: 2,
  apr: 3,
  april: 3,
  may: 4,
  mai: 4,
  jun: 5,
  june: 5,
  juni: 5,
  jul: 6,
  july: 6,
  juli: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  okt: 9,
  oktober: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
  dez: 11,
  dezember: 11,
};
const weekdays: Record<string, number> = {
  sun: 0,
  sunday: 0,
  sonntag: 0,
  so: 0,
  mon: 1,
  monday: 1,
  montag: 1,
  mo: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  dienstag: 2,
  di: 2,
  wed: 3,
  wednesday: 3,
  mittwoch: 3,
  mi: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  donnerstag: 4,
  do: 4,
  fri: 5,
  friday: 5,
  freitag: 5,
  fr: 5,
  sat: 6,
  saturday: 6,
  samstag: 6,
  sa: 6,
};
// Two-letter German weekdays only count with their dot or comma ("Do., 22. Okt."), so "do" stays a verb.
const weekday = `(?<wd>(?:${alternation(Object.keys(weekdays).filter((w) => w.length > 2))})\\b|(?:${alternation(Object.keys(weekdays).filter((w) => w.length === 2))})(?=[.,]))\\.?,?\\s+`;
const month = `(?<mon>${alternation(Object.keys(months))})\\b\\.?`;
const datePatterns = [
  `(?:${weekday})?(?<d>\\d{1,2})(?:\\.|st|nd|rd|th)?\\s+${month},?\\s+(?<y>\\d{4})`,
  `(?:${weekday})?${month}\\s+(?<d>\\d{1,2})(?:st|nd|rd|th)?,?\\s+(?<y>\\d{4})`,
  `(?:${weekday})?(?<d>\\d{1,2})\\.(?<m>\\d{1,2})\\.(?<y>\\d{4})`,
  `(?<y>\\d{4})-(?<m>\\d{2})-(?<d>\\d{2})`,
].map((p) => new RegExp(`(?<![\\w.])${p}(?![\\d])`, "giu"));
// "10.15" counts as a time only before "Uhr" ("10.15 - 10.45 Uhr").
const clock = (n: number) =>
  `(?<h${n}>\\d{1,2})(?:(?::|\\.(?=\\d{2}(?:\\s*(?:-|–|—|bis)\\s*\\d{1,2}\\.\\d{2})?\\s*uhr))(?<m${n}>\\d{2})(?::\\d{2})?)?\\s*(?<a${n}>[ap]\\.?\\s?m\\.?(?![a-z]))?`;
const range = `${clock(1)}(?:\\s*(?:-|–|—|to|bis|until)\\s*${clock(2)})?(?:\\s*uhr\\b)?`;
const afterDate = new RegExp(
  `^(?:[\\s,|@]|-(?=\\s*\\d)|\\b(?:at|um|from|von|ab)\\b|(?:time|uhrzeit|zeit)\\s*:)*${range}`,
  "i",
);
const beforeDate = new RegExp(
  `(?<![\\d:.])${range}(?<rest>[^\\d]{0,60})$`,
  "i",
);

function hour(h?: string, m?: string, ap?: string) {
  if (h === undefined) return null;
  let hours = Number(h);
  const minutes = m === undefined ? 0 : Number(m);
  if (minutes > 59) return null;
  if (ap) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (/^p/i.test(ap) ? 12 : 0);
  } else if (hours > 23) return null;
  return { h: hours, mi: minutes };
}
// Times need minutes or am/pm; a bare "11" only counts as the start of "11 – 11:30am".
// When only one side says am or pm, the other takes the reading that ends after it within 12 hours.
function times(g: Record<string, string | undefined>) {
  const endOk =
    g.h2 !== undefined && (g.m2 !== undefined || g.a2 !== undefined);
  if (g.m1 === undefined && g.a1 === undefined && !(endOk && g.a2)) return null;
  if (!endOk) {
    const start = hour(g.h1, g.m1, g.a1);
    return start && { start, end: null };
  }
  const other = (ap: string) => (/^p/i.test(ap) ? "am" : "pm");
  const readings: [string | undefined, string | undefined][] =
    !g.a1 && g.a2
      ? [
          [g.a2, g.a2],
          [other(g.a2), g.a2],
        ]
      : g.a1 && !g.a2
        ? [
            [g.a1, g.a1],
            [g.a1, other(g.a1)],
            [g.a1, undefined],
          ]
        : [[g.a1, g.a2]];
  const pairs = readings
    .map(([a1, a2]) => ({
      start: hour(g.h1, g.m1, a1),
      end: hour(g.h2, g.m2, a2),
    }))
    .filter((p) => p.start);
  const span = (p: (typeof pairs)[number]) =>
    p.end
      ? (p.end.h * 60 + p.end.mi - p.start!.h * 60 - p.start!.mi + 1440) % 1440
      : 0;
  const best =
    pairs.find((p) => p.end && span(p) > 0 && span(p) < 720) ?? pairs[0];
  return best ? { start: best.start!, end: best.end } : null;
}
const deadlineLead =
  /\b(?:by|before|until|till|no later than|deadline|frist|bis(?: zum| spätestens)?|spätestens(?: am| bis(?: zum)?)?)\s*:?\s*(?:the\s+|am\s+|on\s+)?$/i;
const european = (zone: Zone) => !!zone.iana?.startsWith("Europe/");
// Every "date with a time" in `text`, in reading order, with the zone stated next to it.
function findTimes(text: string): Found[] {
  const found: Found[] = [];
  for (const pattern of datePatterns)
    for (const m of text.matchAll(pattern)) {
      const g = m.groups!;
      const y = Number(g.y);
      const mo = g.mon ? months[g.mon.toLowerCase()] : Number(g.m) - 1;
      const d = Number(g.d);
      const day = new Date(Date.UTC(y, mo, d));
      if (mo < 0 || mo > 11 || day.getUTCMonth() !== mo || y < 2000) continue;
      if (g.wd && weekdays[g.wd.toLowerCase()] !== day.getUTCDay()) continue;
      const end = m.index + m[0].length;
      let clocks = null;
      let zone: { zone: Zone; length: number } | null = null;
      let zoneEnd = 0;
      let first = m.index;
      const after = afterDate.exec(text.slice(end, end + 50));
      if (after) {
        clocks = times(after.groups!);
        if (clocks) {
          zone = zoneAt(
            text.slice(end + after[0].length, end + after[0].length + 120),
          );
          zoneEnd = end + after[0].length + (zone?.length ?? 0);
        }
      }
      if (!clocks) {
        const from = Math.max(0, m.index - 70);
        const before = beforeDate.exec(text.slice(from, m.index));
        if (
          before &&
          !(before.index === 0 && /[\d:.]/.test(text[from - 1] ?? ""))
        ) {
          const rest = before.groups!.rest;
          const stated = zoneAt(rest);
          if (
            /^[\s,)]*(?:on|am|-)?[\s,]*$/i.test(
              stated ? rest.slice(stated.length) : rest,
            )
          ) {
            clocks = times(before.groups!);
            first = from + before.index;
            zone = stated ?? zoneAt(text.slice(end, end + 120));
            zoneEnd = stated ? 0 : end + (zone?.length ?? 0);
          }
        }
      }
      if (!clocks) continue;
      const wall = (c: { h: number; mi: number }, shift = 0): Wall => {
        const date = new Date(Date.UTC(y, mo, d + shift));
        return {
          y: date.getUTCFullYear(),
          mo: date.getUTCMonth(),
          d: date.getUTCDate(),
          ...c,
        };
      };
      const crosses = (c: { h: number; mi: number }) =>
        c.h * 60 + c.mi <= clocks.start.h * 60 + clocks.start.mi ? 1 : 0;
      let startsAt = zone ? instant(wall(clocks.start), zone.zone) : null;
      let endsAt =
        zone && clocks.end
          ? instant(wall(clocks.end, crosses(clocks.end)), zone.zone)
          : null;
      let iana = zone?.zone.iana ?? null;
      // "4:15 AM EDT / 10:15 AM CEST": both must name the same moment.
      const alt = zoneEnd
        ? new RegExp(
            `^\\s*(?:/|\\||\\(|or|oder|bzw\\.?|=)\\s*${range}`,
            "i",
          ).exec(text.slice(zoneEnd, zoneEnd + 60))
        : null;
      const altClocks = alt && times(alt.groups!);
      const altZone =
        altClocks &&
        zoneAt(
          text.slice(zoneEnd + alt![0].length, zoneEnd + alt![0].length + 120),
        );
      if (startsAt && altClocks && altZone) {
        const readings = [-1, 0, 1].map((shift) =>
          instant(wall(altClocks.start, shift), altZone.zone),
        );
        const closest = Math.min(
          ...readings.map((r) => Math.abs(r.getTime() - startsAt!.getTime())),
        );
        if (closest > 60000) startsAt = endsAt = iana = null;
        else if (european(altZone.zone) && !european(zone!.zone))
          iana = altZone.zone.iana;
      }
      const lead = text.slice(Math.max(0, first - 40), first);
      found.push({
        at: m.index,
        lead,
        startsAt,
        endsAt,
        iana,
        deadline: deadlineLead.test(lead),
      });
    }
  return found.sort((a, b) => a.at - b.at);
}

const meetingHosts =
  /^(?:meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}|(?:[\w-]+\.)?zoom\.us\/(?:j|my|w)\/|teams\.microsoft\.com\/(?:l\/meetup-join|meet)\/|teams\.live\.com\/meet\/|whereby\.com\/|[\w-]+\.webex\.com\/(?:meet|join|[\w-]+\/j\.php)|meet\.jit\.si\/)/i;
const calendlyJoin =
  /^calendly\.com\/events\/[\w-]+\/(?:google_meet|zoom|microsoft_teams|webex|gotomeeting)/i;
const eventPages =
  /^(?:[\w.-]+\/v\/events\/|calendar\.google\.com\/calendar\/event\?|calendly\.com\/events\/[\w-]+\/?$)/i;
const rescheduleUrl = /\/cancellations?\/|bookwithme\/user\/[^/]+\/booking\//i;
const rescheduleLabel =
  /reschedul|verschieben|umplanen|neu planen|manage (?:meeting|booking)|cancel or book|riprogrammare|gestisci riunione|change (?:the |your )?(?:time|booking|event)|termin ändern/i;
const eventLabel =
  /event[ -]link|view (?:the )?event|event details|veranstaltungslink|link zum termin|view all guest info|view more details/i;
function links(text: string) {
  const result = {
    meetingUrl: null as string | null,
    eventUrl: null as string | null,
    rescheduleUrl: null as string | null,
  };
  let joinFallback: string | null = null;
  let cancelFallback: string | null = null;
  let last = 0;
  for (const m of text.matchAll(/https?:\/\/[^\s<>"'\]]+/gi)) {
    const label = text.slice(Math.max(last, m.index - 100), m.index);
    last = m.index + m[0].length;
    let url = m[0]
      .replace(/&amp;/g, "&")
      .replace(/&#61;|&#x3d;/gi, "=")
      .replace(/[.,;:!?)]+$/, "");
    const bare = url.replace(/^https?:\/\//i, "");
    // Only the line the link is on and the one above label it.
    const near = label.split("\n").slice(-2).join(" ");
    if (/^meet\.google\.com\//i.test(bare)) url = url.replace(/\?.*$/, "");
    if (meetingHosts.test(bare)) result.meetingUrl ??= url;
    else if (calendlyJoin.test(bare)) joinFallback ??= url;
    else if (/reschedul/i.test(bare) || rescheduleLabel.test(near))
      result.rescheduleUrl ??= url;
    else if (rescheduleUrl.test(bare) || /\bcancel\b/i.test(near))
      cancelFallback ??= url;
    else if (eventPages.test(bare) || eventLabel.test(near))
      result.eventUrl ??= url;
  }
  result.meetingUrl ??= joinFallback;
  result.rescheduleUrl ??= cancelFallback;
  return result;
}

const nameShape = /^\p{Lu}[\p{L}'’.-]*(?:\s+[\p{L}'’.-]+){0,4}$/u;
const notNames =
  /^(?:candidate|kandidat\w*|company|unternehmen|event|public note|when|wann|location|ort|guests|gäste|organizer|you|reschedule)$/i;
function person(text: string): Interviewer | null {
  const m = /^\s*([^()]+?)\s*(?:\(([^()]+)\))?\s*$/.exec(text);
  if (!m) return null;
  const name = m[1].replace(/\s+/g, " ").trim();
  if (
    !nameShape.test(name) ||
    name.length > 60 ||
    notNames.test(name) ||
    /interview|call|meeting|round|gespräch|termin|place|office|room|location|address/i.test(
      name,
    )
  )
    return null;
  return m[2] ? { name, role: m[2].trim() } : { name };
}
const splitNames = (text: string) =>
  text
    .split(/\s*(?:,(?![^()]*\))|;|\band\b|\bund\b|&)\s*/)
    .map(person)
    .filter((p): p is Interviewer => p !== null);
function interviewersIn(body: string, provider: string): Interviewer[] {
  const people: Interviewer[] = [];
  for (const m of body.matchAll(
    /^[ \t]*(?:your )?(?:interviewers?|interviewer:innen|gesprächspartner\S*)[ \t]*:[ \t]*(.+)$/gim,
  ))
    people.push(...splitNames(m[1]));
  const block =
    /^[ \t]*(?:interviewers?|interviewer:innen|gesprächspartner\S*)[ \t]*\n((?:[ \t]*\S.*\n?){1,8})/im.exec(
      body,
    );
  if (block)
    for (const line of block[1].split("\n")) {
      const found = splitNames(line);
      if (!found.length) break;
      people.push(...found);
    }
  const organizer =
    /^[ \t]*(?:organizer|organisator)[ \t]*\n[ \t]*(.+)\n[ \t]*([^\s@]+@[^\s@]+)[ \t]*$/im.exec(
      body,
    );
  if (organizer) {
    const found = person(organizer[1]);
    if (found) people.push({ ...found, email: organizer[2].toLowerCase() });
  }
  // Greenhouse reminders list "title / interviewer (role) / date / time" per interview.
  if (provider === "greenhouse") {
    const lines = body.split("\n").map((l) => l.trim());
    lines.forEach((line, i) => {
      if (
        i > 0 &&
        datePatterns.some((p) => new RegExp(`^${p.source}$`, "iu").test(line))
      ) {
        // A location line ("Work Place") may sit between the name and the date.
        const found =
          person(lines[i - 1]) ?? (i > 1 ? person(lines[i - 2]) : null);
        if (found) people.push(found);
      }
    });
  }
  return people;
}
const unique = (people: Interviewer[]) => {
  const seen = new Set<string>();
  return people.filter((p) => {
    const key = p.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function unescapeIcs(value: string) {
  return value.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
}
function property(line: string) {
  const name = /^[A-Za-z0-9-]+/.exec(line)?.[0];
  if (!name) return null;
  let i = name.length;
  const params: Record<string, string> = {};
  while (line[i] === ";") {
    const eq = line.indexOf("=", i);
    if (eq < 0) return null;
    const key = line.slice(i + 1, eq).toUpperCase();
    i = eq + 1;
    let value: string;
    if (line[i] === '"') {
      const close = line.indexOf('"', i + 1);
      if (close < 0) return null;
      value = line.slice(i + 1, close);
      i = close + 1;
    } else {
      value = /^[^;:]*/.exec(line.slice(i))![0];
      i += value.length;
    }
    params[key] = value;
  }
  if (line[i] !== ":") return null;
  return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
}
function icsZone(tzid: string | undefined) {
  if (!tzid) return null;
  if (windowsZones[tzid]) return windowsZones[tzid];
  if (validZone(tzid)) return tzid;
  const tail = /([A-Za-z_]+\/[A-Za-z_+-]+)$/.exec(tzid)?.[1];
  return tail && validZone(tail) ? tail : null;
}
function icsTime(
  prop: { params: Record<string, string>; value: string } | undefined,
) {
  const m =
    prop &&
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(
      prop.value.trim(),
    );
  // All-day events and floating times (no zone) are not a readable time.
  if (!m || !m[4] || prop.params.VALUE === "DATE") return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  if (m[7]) return { at: new Date(wall), zone: null };
  const zone = icsZone(prop.params.TZID);
  return zone ? { at: new Date(fromWall(wall, zone)), zone } : null;
}
const scheduler =
  /calendly|greenhouse|recruitee|ashby|lever|goodtime|calendar|schedul|no-?reply|notification/i;
export function parseIcs(text: string): Partial<ParsedInterview> | null {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n");
  let method = "";
  const event: NonNullable<ReturnType<typeof property>>[] = [];
  const depth: string[] = [];
  let seen = false;
  for (const line of lines) {
    const prop = property(line.trim());
    if (!prop) continue;
    if (prop.name === "BEGIN") {
      depth.push(prop.value.toUpperCase());
      continue;
    }
    if (prop.name === "END") {
      if (depth.pop() === "VEVENT") seen = true;
      continue;
    }
    if (prop.name === "METHOD" && depth.length === 1)
      method = prop.value.toUpperCase();
    if (!seen && depth[depth.length - 1] === "VEVENT") event.push(prop);
  }
  if (!event.length) return null;
  const get = (name: string) => event.find((p) => p.name === name);
  const start = icsTime(get("DTSTART"));
  let endsAt = icsTime(get("DTEND"))?.at ?? null;
  const duration = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(
    get("DURATION")?.value.trim() ?? "",
  );
  if (!endsAt && start && duration)
    endsAt = new Date(
      start.at.getTime() +
        ((Number(duration[1] ?? 0) * 7 + Number(duration[2] ?? 0)) * 1440 +
          Number(duration[3] ?? 0) * 60 +
          Number(duration[4] ?? 0)) *
          60000,
    );
  const described = [
    "X-GOOGLE-CONFERENCE",
    "X-MICROSOFT-SKYPETEAMSMEETINGURL",
    "LOCATION",
    "URL",
    "DESCRIPTION",
  ]
    .flatMap((name) =>
      event.filter((p) => p.name === name).map((p) => unescapeIcs(p.value)),
    )
    .join("\n");
  const found = links(described);
  const page = get("URL")?.value.trim();
  if (
    page &&
    !found.eventUrl &&
    page !== found.meetingUrl &&
    page !== found.rescheduleUrl
  )
    found.eventUrl = page;
  const address = (p: { value: string }) =>
    p.value
      .replace(/^mailto:/i, "")
      .trim()
      .toLowerCase();
  const named = (p: {
    params: Record<string, string>;
    value: string;
  }): Interviewer | null => {
    const name = p.params.CN?.trim();
    if (
      !name ||
      name.includes("@") ||
      scheduler.test(name) ||
      scheduler.test(address(p).split("@")[0])
    )
      return null;
    return { name, email: address(p) };
  };
  const organizer = get("ORGANIZER");
  const domain = organizer ? address(organizer).split("@")[1] : undefined;
  // The candidate is an attendee too; only the organizer's colleagues count as interviewers.
  const colleagues = event.filter(
    (p) =>
      p.name === "ATTENDEE" &&
      domain &&
      address(p).endsWith(`@${domain}`) &&
      !/^(?:ROOM|RESOURCE|GROUP)$/i.test(p.params.CUTYPE ?? ""),
  );
  return {
    startsAt: start?.at ?? null,
    endsAt,
    timezone: start?.zone ?? null,
    ...found,
    interviewers: unique(
      [organizer, ...colleagues].flatMap((p) => (p && named(p)) || []),
    ),
    title: get("SUMMARY")
      ? unescapeIcs(get("SUMMARY")!.value).trim() || null
      : null,
    provider: "ics",
    cancelled:
      method === "CANCEL" ||
      get("STATUS")?.value.trim().toUpperCase() === "CANCELLED",
  };
}

function provider(mail: RawMail, body: string, googleSubject: boolean) {
  const from = mail.fromAddress;
  if (/recruitee/i.test(from) || /powered by recruitee/i.test(body))
    return "recruitee";
  if (googleSubject || from === "calendar-notification@google.com")
    return "google-calendar";
  if (/calendly\.com$/i.test(from)) return "calendly";
  if (/goodtime\.io/i.test(from) || /scheduled with goodtime\.io/i.test(body))
    return "goodtime";
  if (/greenhouse/i.test(from)) return "greenhouse";
  if (/ashbyhq\.com$/i.test(from)) return "ashby";
  if (/lever\.co$/i.test(from)) return "lever";
  if (
    /invitation from google calendar|google calendar appointment scheduling/i.test(
      body,
    )
  )
    return "google-calendar";
  if (/calendly/i.test(body)) return "calendly";
  return "unknown";
}
const googlePrefix =
  /^(?:invitation from an unknown sender|updated invitation(?: with note)?|invitation|canceled event(?: with note)?|cancelled event|appointment booked|appointment cancel+ed|reminder|aktualisierte einladung|einladung|abgesagte(?:r termin| veranstaltung)|erinnerung)\s*:\s*(.+?)\s+@\s+/i;
const cancelSubject =
  /^(?:canceled|cancelled|cancellation|abgesagt\w*)\b|^appointment cancel+ed|\b(?:has been|was) cancel+ed\b|\btermin (?:wurde )?abgesagt\b/i;
const interviewWords =
  /interview|gespräch|kennenlern|screening|\b(?:intro(?:ductory)?|first|1st|second|2nd|recruiter|discovery|technical|coding|hiring manager) (?:call|round|chat)\b|\bcall with\b|system design|onsite interview/i;
const confirmWords =
  /\b(?:confirm(?:ed|ation|ing|s)?|scheduled|invitation|invited|booked|reminder|updated|rescheduled|cancel+ed|cancellation|appointment|new event|you'?re (?:all )?set)\b|bestätig|einladung|eingeladen|gebucht|erinnerung|abgesagt|verschoben|geplant/i;
const rejection =
  /unfortunately|leider|not (?:to )?(?:be )?(?:move|moving) forward|other candidates|anderen? (?:kandidat|bewerber)|decided (?:not|to (?:pursue|proceed|move forward) with)|absage(?!:)|regret to inform|no longer (?:being )?considered|position has been filled/i;

const rescheduled =
  /\brescheduled\b|\b(?:has|have|was|were) (?:been )?moved\b|\bmoved to\b|\bverschoben\b|\bneue[rn]? (?:termin|zeit|datum)\b|\bnew (?:date|time)\b/i;
const newLead =
  /\b(?:to|auf|for|now|jetzt|nun|new (?:date|time)|neue[rn]? (?:termin|zeit|datum))\s*:?\s*(?:on\s+|am\s+|the\s+)?$/i;
const oldLead =
  /\b(?:from|von|previously|vorher|old|alte[rn]?(?: termin)?|bisherige[rn]?(?: termin)?|ursprünglich\w*(?: termin)?|on|am)\s*:?\s*$/i;
// Several times offered for the candidate to choose from.
const offered =
  /\b(?:pick|choose|select)\b|\bwhich of\b|\bone of (?:these|the following)\b|\boptions?\s*:|\b(?:time ?)?slots\b|\bvorschl[äa]g|\bzur auswahl\b|\bwählen\b|\d\s*(?:\(?[A-Z]{2,5}\)?)?\s+(?:or|oder)\s+(?:on\s+|am\s+)?(?:[A-Z][a-z]+day|[A-Z][a-z]+tag|\d)/;
const legalName =
  /\b(?:GmbH|Technologies|Technology|Inc|Ltd|LLC|AG|SE|KG|Group|Holding)\b/;
const squash = (text: string) => text.toLowerCase().replace(/[^\p{L}\d]/gu, "");
const hiringDomains =
  /^(?:gmail|googlemail|google|outlook|hotmail|yahoo|icloud|gmx|web|recruitee\w*|greenhouse\w*|lever|ashbyhq|calendly|smartrecruiters|personio|bamboohr|myworkday|workday|goodtime|teamtailor\w*|join|linkedin|example)$/i;
// Company names a mail states, so a company line is not mistaken for a person.
function companyHints(fromAddress: string, body: string) {
  const labels = fromAddress.split("@")[1]?.split(".") ?? [];
  const domain = labels.length > 1 ? labels[labels.length - 2] : "";
  const named = [
    /^[ \t]*(?:company|unternehmen)[ \t]*\n[ \t]*(.+)$/im.exec(body)?.[1],
    /^[ \t]*interview (?:with|mit) (.+)$/im.exec(body)?.[1],
  ];
  return [hiringDomains.test(domain) ? "" : domain, ...named]
    .map((name) => squash(name ?? ""))
    .filter((name) => name.length >= 4);
}

// Null when the mail is not an interview confirmation or invitation with at least a time or an event link.
export function parseInterviewMail(mail: RawMail): ParsedInterview | null {
  if (mail.fromMe) return null;
  const tidy = (text: string) =>
    text
      .replace(/<\/?(?:b|strong|i|em|u|span)>/gi, "")
      .replace(/[⋅·  -  ]/g, " ")
      .replace(/\r\n?/g, "\n");
  const subject = tidy(mail.subject).replace(/\s+/g, " ").trim();
  // The thread's quoted history repeats older times; only the newest message counts.
  const body = tidy(mail.bodyText)
    // A forwarded mail keeps its content; only the forward header goes.
    .replace(
      /^[ \t]*(?:-{2,}\s*Forwarded message\s*-{2,}|Begin forwarded message:)[ \t]*\n(?:[ \t]*(?:From|Date|Sent|Subject|To|Cc|Von|Datum|Gesendet|Betreff|An):.*\n)*/gim,
      "",
    )
    .split(
      /^[ \t]*(?:On .{0,200}wrote:|Am .{0,200}schrieb.{0,120}:|-{2,}\s*Original Message\s*-{2,}|From: .+\n(?:Sent|Date): )/im,
    )[0]
    .split("\n")
    .filter((line) => !line.startsWith(">"))
    .join("\n");
  const ics = mail.calendar ? parseIcs(mail.calendar) : null;
  const google = googlePrefix.exec(subject);
  const source = provider(mail, body, !!google);
  const context = `${subject}\n${body}\n${ics?.title ?? ""}`;
  if (!interviewWords.test(context)) return null;
  if (
    !ics &&
    rejection.test(`${subject}\n${body}`) &&
    !cancelSubject.test(subject)
  )
    return null;
  const fromBody = links(body);
  // A meeting link under an interview subject is a confirmation in any language.
  if (
    !ics &&
    source === "unknown" &&
    !confirmWords.test(context) &&
    !(fromBody.meetingUrl && interviewWords.test(subject))
  )
    return null;

  const found = [...findTimes(subject), ...findTimes(body)].filter(
    (f) => !f.deadline,
  );
  const zoned = found.filter((f) => f.startsAt);
  const moments = [...new Set(zoned.map((f) => f.startsAt!.getTime()))];
  let chosen: Found | undefined = zoned[0];
  let previousStartsAt: Date | null = null;
  if (moments.length > 1 && rescheduled.test(`${subject}\n${body}`)) {
    const next =
      zoned.find((f) => newLead.test(f.lead)) ??
      zoned.filter((f) => !oldLead.test(f.lead)).pop() ??
      zoned[zoned.length - 1];
    chosen = next;
    previousStartsAt =
      zoned.find((f) => f.startsAt!.getTime() !== next.startsAt!.getTime())
        ?.startsAt ?? null;
  } else if (moments.length > 1 && offered.test(`${subject}\n${body}`))
    chosen = undefined;
  const startsAt = ics?.startsAt ?? chosen?.startsAt ?? null;
  // Other mentions of the same moment can add the end or the zone's name.
  const same = startsAt
    ? zoned.filter((f) => f.startsAt!.getTime() === startsAt.getTime())
    : [];
  const endsAt =
    (ics?.startsAt ? ics.endsAt : null) ??
    same.find((f) => f.endsAt)?.endsAt ??
    null;
  const timezone =
    (ics?.startsAt ? ics.timezone : null) ??
    (chosen?.iana && same.includes(chosen) ? chosen.iana : null) ??
    same.find((f) => f.iana)?.iana ??
    null;
  const meetingUrl = ics?.meetingUrl ?? fromBody.meetingUrl;
  const eventUrl = fromBody.eventUrl ?? ics?.eventUrl ?? null;
  // A time without a stated zone is not a usable time on its own.
  if (!startsAt && !meetingUrl && !eventUrl) return null;

  let title: string | null = ics?.title ?? null;
  let subjectPerson: string | null = null;
  if (google) {
    const short = google[1].replace(/\s*(?:\.{3}|…)$/, "");
    title ??=
      body
        .split("\n")
        .map((l) => l.trim())
        .find((l) => l.startsWith(short) && l.length > short.length) ??
      google[1];
  }
  // "Confirmation: Video interview on <date> with <name>", "Confirmed: <event> with <name> on <date>".
  const labelled =
    /^(?:confirmation|confirmed|bestätigung|cancell?ation|canceled|cancelled|updated|rescheduled|new event)\s*:\s*(.+?)(\s+(?:on|am|with|mit)\s+.+)?$/i.exec(
      subject,
    );
  if (labelled && !google) {
    title ??= labelled[1].trim();
    if ((source === "recruitee" || source === "calendly") && labelled[2])
      subjectPerson =
        /\s(?:with|mit)\s+(.+?)(?:\s+(?:on|am)\s+.*)?$/i.exec(
          labelled[2],
        )?.[1] ?? null;
  }
  const companies = companyHints(mail.fromAddress, body);
  const people = unique([
    ...(ics?.interviewers ?? []),
    ...interviewersIn(body, source),
    ...(subjectPerson
      ? [person(subjectPerson)].filter((p): p is Interviewer => !!p)
      : []),
  ]).filter((p) => {
    const name = squash(p.name);
    return !legalName.test(p.name) && !companies.some((c) => name.includes(c));
  });
  return {
    startsAt,
    endsAt,
    timezone,
    meetingUrl,
    eventUrl,
    rescheduleUrl: fromBody.rescheduleUrl ?? ics?.rescheduleUrl ?? null,
    interviewers: people,
    title,
    provider: source === "unknown" && ics ? "ics" : source,
    cancelled: !!ics?.cancelled || cancelSubject.test(subject),
    previousStartsAt,
  };
}
