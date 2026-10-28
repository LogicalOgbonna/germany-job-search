import { hash, safeUrl } from "../domain";

import { EUROPE } from "./countries";
export { EUROPE } from "./countries";
export function europeanCountry(value: string): string | null {
  const v = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    uk: "GB",
    england: "GB",
    scotland: "GB",
    wales: "GB",
    "northern ireland": "GB",
    "czech republic": "CZ",
    holland: "NL",
    deutschland: "DE",
    "the netherlands": "NL",
  };
  return (
    aliases[v] ??
    Object.keys(EUROPE).find(
      (k) => k.toLowerCase() === v || EUROPE[k].toLowerCase() === v,
    ) ??
    null
  );
}
export type IncomingEvent = {
  externalId: string;
  title: string;
  url: string;
  description: string;
  kind: string;
  city: string;
  country: string;
  format: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  timezone?: string | null;
  topics: string[];
  cost?: string;
  free?: boolean;
  eligibility?: string;
  status?: string;
};
export const topicRules: [string, RegExp, number, string][] = [
  [
    "AI & agents",
    /\b(ai|llms?|rag|agentic|agents?|machine learning|artificial intelligence|claude|openai|copilot)\b/i,
    30,
    "AI tooling and agent projects",
  ],
  [
    "Web engineering",
    /\b(react|next\.?js|javascript|typescript|frontend|front.end|full.stack|web dev|vue|angular|css|html|ux|accessibility)\b/i,
    28,
    "Frontend and full-stack experience",
  ],
  [
    "Backend & payments",
    /\b(backend|back.end|node\.?js|graphql|apis?|postgres|database|stripe|payments?|fintech)\b/i,
    22,
    "Backend, APIs and payments experience",
  ],
  [
    "Cloud & DevOps",
    /\b(devops|cloud|cloudflare|ci\/cd|kubernetes|docker|platform engineering|sre|testing|developer tools|devtools)\b/i,
    22,
    "CI/CD, cloud and developer tooling",
  ],
  [
    "Open source",
    /\b(open.source|foss|linux|hacktoberfest)\b/i,
    14,
    "Engineering community and collaboration",
  ],
  [
    "Tech community",
    /\b(tech|software|developers?|engineers?|builders?|saas|startup|founder|afrotech)\b/i,
    12,
    "Meet other engineers and product builders",
  ],
];
export function eventMatch(
  e: Pick<
    IncomingEvent,
    "title" | "description" | "topics" | "country" | "kind" | "format"
  >,
) {
  const text = `${e.title} ${e.description} ${e.topics.join(" ")}`;
  const matched = topicRules.filter(([, pattern]) => pattern.test(text));
  const reasons = matched.map(([, , , reason]) => reason);
  let score = matched.reduce((n, [, , weight]) => n + weight, 0);
  if (e.kind === "hackathon") {
    score += 22;
    reasons.push("Hands-on building and potential teammates");
  }
  if (!score) return { score: 0, topics: [], reasons: [] };
  if (e.country === "DE") {
    score += 12;
    reasons.push("Germany travel priority");
  }
  if (e.format !== "online") {
    score += 8;
    reasons.push("In-person networking");
  }
  return {
    score: Math.min(99, score),
    topics: matched.map(([topic]) => topic),
    reasons,
  };
}
export function eventKey(url: string, start: Date) {
  const u = new URL(safeUrl(url));
  if (u.hostname === "lu.ma") u.hostname = "luma.com";
  u.hostname = u.hostname.replace(/^www\./, "");
  u.hash = "";
  for (const key of [...u.searchParams.keys()])
    if (/^utm_|^(ref|source|fbclid)$/i.test(key)) u.searchParams.delete(key);
  // Keep editions on separate dates; a changed date is resolved by the source listing ID.
  return hash(
    `${u.toString().replace(/\/$/, "")}|${start.toISOString().slice(0, 10)}`,
  );
}
export function isUpcomingEurope(e: IncomingEvent, now = new Date()) {
  return (
    !!europeanCountry(e.country) &&
    e.format !== "online" &&
    Number.isFinite(e.startsAt.valueOf()) &&
    Number.isFinite(e.endsAt.valueOf()) &&
    e.endsAt > e.startsAt &&
    e.endsAt > now &&
    e.startsAt.valueOf() < now.valueOf() + 366 * 86400000
  );
}
const escapeIcs = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
function fold(line: string) {
  const lines: string[] = [];
  let part = "";
  let length = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char);
    if (length + bytes > 75) {
      lines.push(part);
      part = " ";
      length = 1;
    }
    part += char;
    length += bytes;
  }
  return [...lines, part].join("\r\n");
}
export function eventCalendar(e: {
  id: string;
  title: string;
  url: string;
  city: string;
  country: string;
  description: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  status: string;
}) {
  const date = (d: Date) =>
    e.allDay ? d.toISOString().slice(0, 10).replaceAll("-", "") : stamp(d);
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Jobdesk//European Tech Events//EN",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${e.id}@jobdesk.local`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART${e.allDay ? ";VALUE=DATE" : ""}:${date(e.startsAt)}`,
      `DTEND${e.allDay ? ";VALUE=DATE" : ""}:${date(e.endsAt)}`,
      `SUMMARY:${escapeIcs(e.title)}`,
      `LOCATION:${escapeIcs(`${e.city}, ${EUROPE[e.country] ?? e.country}`)}`,
      `DESCRIPTION:${escapeIcs(`${e.description}\nVerify details and register with the organizer. ${e.url}`)}`,
      `URL:${e.url}`,
      `STATUS:${e.status === "cancelled" ? "CANCELLED" : "TENTATIVE"}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .map(fold)
      .join("\r\n") + "\r\n"
  );
}
