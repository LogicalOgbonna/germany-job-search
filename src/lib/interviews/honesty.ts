import type { PrepEvidence, PrepSheet } from "./types";

type Draft = Omit<PrepSheet, "warnings" | "dropped">;
export type HonestySources = {
  experience: string; // cv/experience.md
  skills: string; // cv/base_experience.md
  notes: string; // application notes, plus the CLAUDE.md rules
  company?: string; // the company being interviewed with: its name is not a made-up product
  interview?: {
    startsAt: Date | null;
    endsAt?: Date | null;
    timezone: string;
    interviewerTimezone?: string | null;
  };
  now?: Date; // for roles that run to "Present"
};

type Role = {
  name: string; // "Genentech (Roche), Frontend Engineer"
  company: string;
  title: string;
  aliases: string[];
  raw: string; // the section without maintenance notes
  lines: string[]; // squashed, one per line
  amounts: Set<string>;
  months: number | null;
  dates: string | null;
};
type Row = { skill: string; where: string; text: string };
type Amount = {
  text: string;
  values: number[];
  unit: string;
  index: number;
  end: number;
};

// --- text helpers ---

// Paragraphs the profile keeps for whoever writes documents. They limit claims; they are not
// something to quote or to count as evidence.
const withoutNotes = (text: string) =>
  text
    .split(/\n\s*\n/)
    .filter((part) => !/^\s*Profile maintenance note/i.test(part))
    .join("\n\n");
const squash = (text: string) =>
  text
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[*`]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
const roleKey = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const bare = (text: string) => text.replace(/\([^)]*\)/g, " ");
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (term: string, flags = "i") =>
  new RegExp(
    `(?<![\\p{L}\\p{N}])${escape(term)}(?![\\p{L}\\p{N}-])`,
    `u${flags}`,
  );
const mentions = (text: string, term: string, caseSensitive = false) =>
  word(term, caseSensitive ? "" : "i").test(text);
const sentences = (text: string) =>
  text.split(/(?<=[.!?])\s+|\n+/).filter((part) => part.trim());

// --- the experience and skills files ---

const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const span =
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})\s*[-–]\s*(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})|Present)/i;

function aliasesOf(company: string) {
  const plain = bare(company).replace(/\s+/g, " ").trim();
  const inner = [...company.matchAll(/\(([^)]*)\)/g)].map((match) =>
    match[1].trim(),
  );
  const first = plain.split(" ")[0];
  return [
    ...new Set([
      company,
      plain,
      ...inner,
      // "ActivEdge Technologies" is called ActivEdge; "Founders Lair" keeps both words.
      ...(plain.includes(" ") && /[a-z][A-Z]/.test(first) ? [first] : []),
    ]),
  ].filter(Boolean);
}

function rolesOf(experience: string, now: Date): Role[] {
  return withoutNotes(experience)
    .split(/^## /m)
    .slice(1)
    .flatMap((section) => {
      const [heading, ...body] = section.split("\n");
      const parts = /^(.+?)\s+[—–-]\s+(.+?)\s*$/.exec(heading);
      if (!parts) return [];
      const [, company, title] = parts;
      const raw = `${heading}\n${body.join("\n")}`;
      const dated = span.exec(raw);
      let length: number | null = null;
      if (dated) {
        const start =
          Number(dated[2]) * 12 + months.indexOf(dated[1].toLowerCase());
        const end = dated[3]
          ? Number(dated[4]) * 12 + months.indexOf(dated[3].toLowerCase())
          : now.getUTCFullYear() * 12 + now.getUTCMonth();
        length = end - start + 1;
      }
      return [
        {
          name: `${company}, ${title}`,
          company,
          title,
          aliases: aliasesOf(company),
          raw,
          lines: raw
            .split("\n")
            .map((line) => squash(line.replace(/^\s*[-*]\s+/, "")))
            .filter(Boolean),
          amounts: keys(amountsIn(raw)),
          months: length,
          dates: dated ? dated[0] : null,
        },
      ];
    });
}

function rowsOf(skills: string): Row[] {
  return skills.split("\n").flatMap((line) => {
    if (!line.trim().startsWith("|")) return [];
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (
      cells.length < 2 ||
      /^-+$/.test(cells[0]) ||
      /^(skill|sector)$/i.test(cells[0])
    )
      return [];
    return [{ skill: cells[0], where: cells[1], text: squash(line) }];
  });
}

// Technology names: the skills file's first column and the roles' technology lines, plus
// well-known names that are not in the files at all.
const outside = [
  "Kubernetes",
  "K8s",
  "Go",
  "Golang",
  "Rust",
  "Java",
  "Kotlin",
  "Swift",
  "Scala",
  "Elixir",
  "Ruby",
  "Rails",
  "C#",
  ".NET",
  "C++",
  "Angular",
  "Svelte",
  "SvelteKit",
  "Ember",
  "Django",
  "FastAPI",
  "Flask",
  "Spring",
  "Terraform",
  "Ansible",
  "Kafka",
  "RabbitMQ",
  "gRPC",
  "Azure",
  "GCP",
  "BigQuery",
  "Snowflake",
  "Spark",
  "Hadoop",
  "Cassandra",
  "DynamoDB",
  "Elasticsearch",
  "MySQL",
  "Flutter",
  "React Native",
  "Electron",
  "Deno",
  "Remix",
  "Nuxt",
  "Gatsby",
  "Shopify",
  "Salesforce",
  "Solidity",
];
function vocabularyOf(experience: string, rows: Row[]) {
  const terms = new Set<string>(outside);
  const add = (raw: string) => {
    const term = raw.replace(/^[\s\-*]+|[\s*.]+$/g, "");
    if (
      term.length >= 2 &&
      /\p{L}/u.test(term) &&
      term.split(/\s+/).length <= 3
    )
      terms.add(term);
  };
  for (const row of rows)
    for (const part of row.skill.split(/\s*\/\s*|\s*[(),]\s*|\s+&\s+|\s+\+\s+/))
      add(part);
  for (const line of experience.split("\n")) {
    const listed = /^\*\*(?:Key|Confirmed) technologies:\*\*\s*(.+)$/i.exec(
      line.trim(),
    );
    if (listed) for (const part of listed[1].split(/,\s*/)) add(part);
  }
  return [...terms].sort((a, b) => b.length - a.length);
}
// A Title-case word such as "Prettier" or "Temporal" counts only when capitalised.
const caseSensitive = (term: string) =>
  /^[A-Z][a-z]+$/.test(term) || term.length <= 2 || outside.includes(term);

// --- numbers ---

const wordValues: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};
const units: Record<string, string> = {
  "%": "percent",
  percent: "percent",
  "per cent": "percent",
  years: "year",
  year: "year",
  yrs: "year",
  yr: "year",
  months: "month",
  month: "month",
  weeks: "week",
  week: "week",
  days: "day",
  day: "day",
  hours: "hour",
  hour: "hour",
  hrs: "hour",
  hr: "hour",
  minutes: "minute",
  minute: "minute",
  mins: "minute",
  min: "minute",
  seconds: "second",
  second: "second",
  secs: "second",
  sec: "second",
  s: "second",
  milliseconds: "ms",
  millisecond: "ms",
  ms: "ms",
  x: "times",
  interns: "intern",
  intern: "intern",
  people: "person",
  person: "person",
  engineers: "engineer",
  engineer: "engineer",
  developers: "developer",
  developer: "developer",
  members: "member",
  member: "member",
  teams: "team",
  team: "team",
  projects: "project",
  project: "project",
  users: "user",
  user: "user",
  customers: "customer",
  customer: "customer",
  clients: "client",
  client: "client",
  states: "state",
  state: "state",
  documents: "document",
  document: "document",
  files: "file",
  file: "file",
  agents: "agent",
  agent: "agent",
  services: "service",
  service: "service",
  applications: "application",
  application: "application",
  apps: "application",
  app: "application",
  transactions: "transaction",
  transaction: "transaction",
  chunks: "chunk",
  sessions: "session",
  session: "session",
  visitors: "visitor",
  visitor: "visitor",
  eur: "money",
  euros: "money",
  euro: "money",
  usd: "money",
  gbp: "money",
  dollars: "money",
  dollar: "money",
};
const unitPattern = Object.keys(units)
  .sort((a, b) => b.length - a.length)
  .map(escape)
  .join("|");
const number = `\\d[\\d.,]*\\d|\\d|(?:${Object.keys(wordValues).join("|")})(?![\\p{L}])`;
const scale = "k|m|million|thousand|billion|bn";
const amountPattern = new RegExp(
  `(?<![\\p{L}\\p{N}.,])(?<cur>[€$£]\\s?)?(?<num>${number})(?:\\s?(?<scale>${scale})(?![\\p{L}]))?\\+?` +
    `(?:\\s?(?:-|–|to)\\s?(?<num2>\\d[\\d.,]*\\d|\\d)(?:\\s?(?<scale2>${scale})(?![\\p{L}]))?)?\\+?` +
    `(?:\\s?-?\\s?(?<unit>${unitPattern})(?![\\p{L}\\p{N}]))?`,
  "giu",
);

function value(token: string, suffix?: string) {
  const lower = token.toLowerCase();
  const base =
    lower in wordValues
      ? wordValues[lower]
      : Number(
          /^\d{1,3}(?:[.,]\d{3})+$/.test(token)
            ? token.replace(/[.,]/g, "")
            : token.replace(",", "."),
        );
  const factor =
    { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, bn: 1e9, billion: 1e9 }[
      (suffix ?? "").toLowerCase()
    ] ?? 1;
  return Math.round(base * factor * 1000) / 1000;
}

function amountsIn(text: string): Amount[] {
  return [...text.matchAll(amountPattern)].flatMap((match) => {
    const groups = match.groups ?? {};
    const unit = groups.cur
      ? "money"
      : groups.unit
        ? units[groups.unit.toLowerCase()]
        : null;
    if (!unit) return [];
    const values = [value(groups.num, groups.scale ?? groups.scale2)];
    if (groups.num2)
      values.push(value(groups.num2, groups.scale2 ?? groups.scale));
    return [
      {
        text: match[0].trim(),
        values,
        unit,
        index: match.index,
        end: match.index + match[0].length,
      },
    ];
  });
}
// "two junior developers (interns)" supports "2 interns" and "2 developers": the number within
// a few words of the noun, or of a parenthetical naming it. Other nouns are not synonyms.
const measures = new Set([
  "percent",
  "year",
  "month",
  "week",
  "day",
  "hour",
  "minute",
  "second",
  "ms",
  "times",
  "money",
]);
function counted(raw: string, amount: number, unit: string) {
  if (measures.has(unit)) return false;
  const spoken = Object.entries(wordValues).find(
    ([, item]) => item === amount,
  )?.[0];
  const said = [String(amount), ...(spoken ? [spoken] : [])]
    .map(escape)
    .join("|");
  const nouns = Object.keys(units)
    .filter((key) => units[key] === unit && /^\p{L}/u.test(key))
    .map(escape)
    .join("|");
  return new RegExp(
    `(?<![\\p{L}\\p{N}.,])(?:${said})\\s+(?:[\\p{L}-]+\\s+){0,3}\\(?\\s*(?:${nouns})(?![\\p{L}])`,
    "iu",
  ).test(raw);
}
const keys = (amounts: Amount[]) =>
  new Set(
    amounts.flatMap((amount) =>
      amount.values.map((item) => `${item}|${amount.unit}`),
    ),
  );
// Any number the notes state, for money: "70k", "70.000" and "70,000" are all 70000.
function plainNumbers(text: string) {
  const found = new Set<number>();
  for (const [, token, suffix] of text.matchAll(
    /(\d[\d.,]*\d|\d)(\s?[kKmM](?![\p{L}]))?/gu,
  )) {
    found.add(value(token));
    if (suffix) found.add(value(token, suffix.trim()));
  }
  return found;
}
const experienceAfter =
  /^\+?\s*(?:of\s+)?(?:(?:professional|industry|hands-on|commercial|software|engineering|total|relevant|work)\s+){0,2}experience\b/i;

// --- the check ---

const families = [
  {
    claims: /^(lead|leads|led|leading|spearheaded|drove|headed|championed)$/i,
    support: [
      "lead",
      "leads",
      "led",
      "leading",
      "spearheaded",
      "spearheading",
      "drove",
      "headed",
      "championed",
    ],
  },
  {
    claims: /^(architected|architecting)$/i,
    support: ["architected", "architecting", "designed the architecture"],
  },
  {
    claims: /^(managed|manage|manages|managing|manager)$/i,
    support: ["managed", "manager", "management of"],
  },
];

const policy = { all: "all", years: "years", none: "none" } as const;
type Policy = keyof typeof policy;

const timeOf = (date: Date, zone: string) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return {
    label: `${part("weekday")} ${part("day")} ${part("month")}, ${part("hour")}:${part("minute")}`,
    date: `${Number(part("day"))} ${part("month").toLowerCase().slice(0, 3)}`,
    time: `${part("hour")}:${part("minute")}`,
  };
};
const monthName =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";

export function checkHonesty(sheet: Draft, sources: HonestySources): PrepSheet {
  const now = sources.now ?? new Date();
  const known = rolesOf(sources.experience, now);
  const rows = rowsOf(sources.skills);
  const vocabulary = vocabularyOf(sources.experience, rows);
  const everything = [
    withoutNotes(sources.experience),
    sources.skills,
    sources.notes,
  ].join("\n");
  const globalAmounts = new Set([
    ...known.flatMap((role) => [...role.amounts]),
    ...keys(amountsIn(sources.skills)),
    ...keys(amountsIn(sources.notes)),
  ]);
  const noteNumbers = plainNumbers(sources.notes);
  const statedYears = new Set(
    amountsIn(sources.notes)
      .filter(
        (amount) =>
          amount.unit === "year" &&
          experienceAfter.test(sources.notes.slice(amount.end)),
      )
      .flatMap((amount) => amount.values),
  );
  const warnings: string[] = [];
  const dropped: string[] = [];

  const roleOf = (asked: string) => {
    const wanted = [roleKey(asked), roleKey(bare(asked))];
    return known.find((role) =>
      [roleKey(role.name), roleKey(bare(role.name))].some(
        (key) => key && wanted.includes(key),
      ),
    );
  };
  const companyAt = (text: string) =>
    known.find((role) =>
      role.aliases.some((alias) =>
        new RegExp(`^${escape(alias)}(?![\\p{L}\\p{N}])`, "iu").test(
          text.trim(),
        ),
      ),
    );
  const namedIn = (text: string) => {
    const found: { role: Role; index: number }[] = [];
    for (const role of known)
      for (const alias of role.aliases) {
        const hit = word(alias).exec(text);
        if (hit) found.push({ role, index: hit.index });
      }
    return found;
  };
  const listsRole = (row: Row, role: Role) =>
    /\ball roles\b/i.test(row.where) ||
    role.aliases.some((alias) => mentions(row.where, alias));

  // Why a stated amount is not supported, or null. `role` is the role it is about, if known.
  const unsupported = (
    amount: Amount,
    text: string,
    role: Role | null,
    quote?: string,
  ): string | null => {
    const after = text.slice(amount.end);
    if (amount.unit === "money")
      return amount.values.every((item) => noteNumbers.has(item))
        ? null
        : "money";
    if (amount.unit === "year") {
      if (/^\s*(?:ago|old)\b/i.test(after)) return null;
      const experienced = () =>
        amount.values.every((item) => statedYears.has(item))
          ? null
          : `does not match your years of experience in your rules${statedYears.size ? ` (${[...statedYears].join(", ")} years)` : ""}`;
      if (experienceAfter.test(after)) return experienced();
      const subject =
        /^\s*(of|with|in|using|at|for)\s+([^,.;:!?()]{1,40})/i.exec(after);
      const place = subject ? companyAt(subject[2]) : undefined;
      if (subject && !place && /^(of|with|in|using)$/i.test(subject[1])) {
        const tech = subject[2]
          .trim()
          .split(/\s+(?:and|or|at|in|for|with|but|plus)\s+/i)[0]
          .split(/\s+/)
          .slice(0, 3)
          .join(" ");
        return `tech:${amount.text} ${subject[1]} ${tech}`;
      }
      const target = place ?? role;
      if (!target) return experienced();
      if (target.months === null)
        return `does not match your dates at ${target.company}`;
      const allowed = [
        Math.floor(target.months / 12),
        Math.round(target.months / 12),
      ];
      return amount.values.every((item) => allowed.includes(item))
        ? null
        : `does not match your dates at ${target.company}${target.dates ? ` (${target.dates})` : ""}`;
    }
    if (amount.unit === "month") {
      const subject = /^\s*(?:at|with|for)\s+([^,.;:!?()]{1,40})/i.exec(after);
      const target = (subject && companyAt(subject[1])) || role;
      if (target?.months)
        return amount.values.every(
          (item) => Math.abs(item - target.months!) <= 1,
        )
          ? null
          : `does not match your dates at ${target.company}${target.dates ? ` (${target.dates})` : ""}`;
    }
    const pool = role
      ? new Set([...role.amounts, ...keys(amountsIn(quote ?? ""))])
      : globalAmounts;
    const raw = role
      ? `${role.raw}\n${quote ?? ""}`
      : `${known.map((entry) => entry.raw).join("\n")}\n${sources.skills}`;
    return amount.values.every(
      (item) =>
        pool.has(`${item}|${amount.unit}`) || counted(raw, item, amount.unit),
    )
      ? null
      : role
        ? `does not appear in your ${role.company} experience`
        : "does not appear in your experience files or application notes";
  };
  const say = (where: string, amount: Amount, reason: string) => {
    if (reason === "money")
      return `The amount "${amount.text}" in ${where} is not in your application notes.`;
    if (reason.startsWith("tech:"))
      return `${where} states "${reason.slice(5)}": years per technology are not in your files.`;
    return `The number "${amount.text}" in ${where} ${reason}.`;
  };

  // Rules from CLAUDE.md and stated numbers, for one piece of free text.
  const review = (
    text: string,
    where: string,
    numbers: Policy,
    time = false,
  ) => {
    if (!text) return;
    for (const sentence of sentences(text)) {
      const named = namedIn(sentence);
      if (numbers !== "none")
        for (const amount of amountsIn(sentence)) {
          if (numbers === "years" && amount.unit !== "year") continue;
          const nearest = named.sort(
            (a, b) =>
              Math.abs(a.index - amount.index) -
              Math.abs(b.index - amount.index),
          )[0];
          const reason = unsupported(amount, sentence, nearest?.role ?? null);
          if (reason) warnings.push(say(where, amount, reason));
        }
      if (/\bPython\b/.test(sentence)) {
        const elsewhere = [
          ...new Set(
            [...named]
              .sort((a, b) => a.index - b.index)
              .map((item) => item.role)
              .filter((role) => !/genentech/i.test(role.company))
              .map((role) => role.company),
          ),
        ];
        if (elsewhere.length)
          warnings.push(
            `${where} says you used Python at ${elsewhere.join(", ")}; your rules limit professional Python to Genentech.`,
          );
      }
      if (
        /OurNigeria/i.test(sentence) &&
        /\b(?:open[- ]source|side[- ]project)\b/i.test(sentence)
      )
        warnings.push(
          `${where} calls OurNigeria open source or a side project; your rules list it under Projects as Senior Engineer.`,
        );
    }
    const framework = /\b(Django|FastAPI|Flask)\b/i.exec(text);
    if (framework)
      warnings.push(
        `${where} mentions ${framework[1]}; your rules say not to claim Django, FastAPI or Flask.`,
      );
    if (
      /\bmodel training\b|\btrain(?:ed|ing)\s+(?:\w+\s+){0,2}(?:models?|LLMs?)\b/i.test(
        text,
      )
    )
      warnings.push(
        `${where} mentions model training; your rules say not to claim model training.`,
      );
    titles(text, where);
    if (time) times(text, where);
  };

  const titleWords =
    "Engineer|Developer|Architect|Programmer|Consultant|Lead|Manager|Designer";
  const titles = (text: string, where: string) => {
    const found: { index: number; message: string }[] = [];
    for (const role of known)
      for (const alias of role.aliases) {
        const before = new RegExp(
          `((?:[A-Z][\\w-]*\\s+){0,3}(?:${titleWords}))(?:\\s*\\([^)]*\\))?\\s+(?:at|with|for)\\s+${escape(alias)}(?![\\p{L}\\p{N}])`,
          "gu",
        );
        const after = new RegExp(
          `(?<![\\p{L}\\p{N}])${escape(alias)}(?:\\s*\\([^)]*\\))?,?\\s+((?:[A-Z][\\w-]*\\s+){0,3}(?:${titleWords}))(?![\\p{L}])`,
          "gu",
        );
        for (const match of [
          ...text.matchAll(before),
          ...text.matchAll(after),
        ]) {
          const title = match[1].trim();
          if (roleKey(bare(title)) === roleKey(bare(role.title))) continue;
          found.push({
            index: match.index,
            message: `${where} calls you "${title}" at ${role.company}; your title there is "${role.title}".`,
          });
        }
      }
    for (const item of found.sort((a, b) => a.index - b.index))
      warnings.push(item.message);
  };

  const times = (text: string, where: string) => {
    const meeting = sources.interview;
    if (!meeting?.startsAt) return;
    const zones = [meeting.timezone, meeting.interviewerTimezone, "UTC"].filter(
      (zone): zone is string => Boolean(zone),
    );
    const moments = [meeting.startsAt, meeting.endsAt].filter(
      (date): date is Date => Boolean(date),
    );
    const accepted = zones.flatMap((zone) =>
      moments.map((date) => timeOf(date, zone)),
    );
    const dates = new Set(accepted.map((item) => item.date));
    const clock = new Set(accepted.map((item) => item.time));
    const expected = `${timeOf(meeting.startsAt, meeting.timezone).label} (${meeting.timezone})`;
    for (const line of sentences(text)) {
      const stated = [
        ...line.matchAll(
          /\b(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m\.|p\.m\.|uhr)?(?![\d])/gi,
        ),
        ...line.matchAll(
          /(?<![\d:.])\b(\d{1,2})()\s*(am|pm|a\.m\.|p\.m\.)(?![\p{L}])/giu,
        ),
      ].filter((match) => match[0].includes(":") || match[3]);
      if (!stated.length) continue;
      const days = [
        ...[
          ...line.matchAll(
            new RegExp(
              `\\b(\\d{1,2})(?:st|nd|rd|th)?\\.?\\s+(${monthName})\\b`,
              "gi",
            ),
          ),
        ].map((match) => ({
          text: match[0],
          date: `${Number(match[1])} ${match[2].toLowerCase().slice(0, 3)}`,
        })),
        ...[
          ...line.matchAll(
            new RegExp(
              `\\b(${monthName})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,
              "gi",
            ),
          ),
        ].map((match) => ({
          text: match[0],
          date: `${Number(match[2])} ${match[1].toLowerCase().slice(0, 3)}`,
        })),
      ];
      for (const day of days)
        if (!dates.has(day.date))
          warnings.push(
            `${where} gives the date "${day.text}", but the interview starts ${expected}.`,
          );
      for (const match of stated) {
        let hour = Number(match[1]);
        const meridiem = (match[3] ?? "").toLowerCase().replace(/\./g, "");
        if (meridiem === "pm" && hour < 12) hour += 12;
        if (meridiem === "am" && hour === 12) hour = 0;
        const said = `${String(hour).padStart(2, "0")}:${match[2] || "00"}`;
        if (!clock.has(said))
          warnings.push(
            `${where} gives the time "${match[0].trim()}", but the interview starts ${expected}.`,
          );
      }
    }
  };

  // Evidence: the role must be a heading, the quote one line of that role (or a skills row
  // that names it), and every specific in the claim must come from the quote or the role.
  const keep = (items: PrepEvidence[], section: string) =>
    items.flatMap((item) => {
      const removed = (reason: string) => {
        dropped.push(`${section} "${item.claim}" was removed: ${reason}`);
        return [];
      };
      const role = roleOf(item.role ?? "");
      if (!role)
        return removed(
          `"${item.role}" is not a role title in cv/experience.md.`,
        );
      const words = (item.quote ?? "")
        .split(/\s+/)
        .filter((part) => /\p{L}/u.test(part)).length;
      const quote = squash(item.quote ?? "");
      // A line of experience needs a few words to show anything; a skills row is its own unit.
      const inLines = known.some((entry) =>
        entry.lines.some((line) => line.includes(quote)),
      );
      if (words < (inLines ? 3 : 2))
        return removed("its quote is too short to show anything.");
      if (!role.lines.some((line) => line.includes(quote))) {
        const elsewhere = known.find((entry) =>
          entry.lines.some((line) => line.includes(quote)),
        );
        if (elsewhere)
          return removed(
            `its quote comes from ${elsewhere.name}, not ${role.name}.`,
          );
        const fromRows = rows.filter((row) => row.text.includes(quote));
        if (!fromRows.length)
          return removed("its quote was not found in your experience files.");
        if (!fromRows.some((row) => listsRole(row, role)))
          return removed(
            `its quote is from the skills row "${fromRows[0].skill}", which does not list ${role.company}.`,
          );
      }
      const problem = claimProblem(item, role, section);
      if (problem) return removed(problem);
      return [{ ...item, role: role.name }];
    });

  const claimProblem = (
    item: PrepEvidence,
    role: Role,
    section: string,
  ): string | null => {
    const claim = item.claim ?? "";
    for (const other of known)
      if (
        other.company !== role.company &&
        other.aliases.some((alias) => mentions(claim, alias))
      )
        return `the claim names ${other.company}, but the quote is from ${role.company}.`;
    const techs = vocabulary
      .map((term) => ({
        term,
        hit: word(term, caseSensitive(term) ? "" : "i").exec(claim),
      }))
      .filter((entry) => entry.hit)
      .sort((a, b) => a.hit!.index - b.hit!.index);
    for (const { term } of techs) {
      const exact = caseSensitive(term);
      if (
        mentions(item.quote, term, exact) ||
        mentions(role.raw, term, exact) ||
        rows.some(
          (row) => mentions(row.skill, term, exact) && listsRole(row, role),
        )
      )
        continue;
      return `"${term}" in the claim is not in the quote or in your ${role.company} experience.`;
    }
    const seniority =
      /\b(lead|leads|led|leading|spearheaded|drove|headed|championed|managed|manage|manages|managing|manager|architected|architecting|principal|staff)\b/gi;
    for (const [said] of claim.matchAll(seniority)) {
      // The source may use a synonym; managing people stays strict.
      const family = families.find((entry) => entry.claims.test(said))
        ?.support ?? [said];
      if (
        !family.some(
          (form) => mentions(item.quote, form) || mentions(role.raw, form),
        )
      )
        return `"${said}" in the claim is not in the quote or in your ${role.company} experience.`;
    }
    for (const amount of amountsIn(claim)) {
      const reason = unsupported(amount, claim, role, item.quote);
      if (!reason) continue;
      if (reason === "money")
        return `the amount "${amount.text}" in the claim is not in your application notes.`;
      if (reason.startsWith("tech:"))
        return `the claim states "${reason.slice(5)}": years per technology are not in your files.`;
      return `the number "${amount.text}" in the claim ${reason}.`;
    }
    const stop = new Set([
      "I",
      "I'm",
      "I've",
      "I'd",
      "At",
      "In",
      "On",
      "The",
      "A",
      "An",
      "My",
      "Our",
      "We",
      "As",
      "For",
      "With",
      "By",
      "And",
      "Also",
      "This",
      "That",
      "It",
      "When",
      "While",
    ]);
    for (const hit of claim.matchAll(
      /(?<![\p{L}\p{N}])[A-Z][\p{L}\p{N}.+#-]*[\p{L}\p{N}+#]/gu,
    )) {
      const name = hit[0];
      if (hit.index === 0 || /[.!?]\s*$/.test(claim.slice(0, hit.index)))
        continue;
      if (stop.has(name) || mentions(everything, name)) continue;
      if (sources.company && mentions(sources.company, name)) continue;
      if (techs.some((entry) => mentions(entry.term, name))) continue;
      warnings.push(
        `${section} "${claim}" mentions "${name}", which is not in your experience files.`,
      );
    }
    review(claim, section, "none");
    return null;
  };

  const scripts: Array<[keyof Draft["scripts"], string]> = [
    ["whyCompany", '"Why this company"'],
    ["lookingFor", '"What are you looking for"'],
    ["aboutMe", '"Tell me about yourself"'],
  ];
  for (const [key, where] of scripts)
    review(sheet.scripts[key] ?? "", where, "all", true);
  for (const line of sheet.logistics) review(line, "Logistics", "years", true);
  review(sheet.company.summary, "Company summary", "none");
  for (const reason of sheet.company.reasons)
    review(reason, "Reasons this company fits", "years");
  const lists: Array<[keyof Draft["role"], string]> = [
    ["responsibilities", "Responsibilities"],
    ["challenges", "Challenges"],
    ["mustHave", "Must-have"],
    ["niceToHave", "Nice-to-have"],
  ];
  for (const [key, where] of lists)
    for (const line of sheet.role[key]) review(line, where, "none");
  const matches = keep(sheet.matches, "Matching evidence");
  const transferable = keep(sheet.transferable, "Transferable experience");
  const questions = sheet.questions.map((question) => {
    review(question.question, `the question "${question.question}"`, "years");
    for (const line of question.outline)
      review(line, `the answer outline for "${question.question}"`, "all");
    const evidence = keep(
      question.evidence,
      `An item in the evidence for "${question.question}"`,
    );
    return { ...question, evidence };
  });
  for (const gap of sheet.gaps) {
    review(gap.gap, "Gaps", "years");
    review(gap.framing, "Gaps", "all");
  }
  for (const line of sheet.askThem) review(line, "Questions to ask", "years");
  for (const line of sheet.checklist) review(line, "Checklist", "years");

  return withoutEmDashes({
    ...sheet,
    matches,
    transferable,
    questions,
    warnings: [...new Set(warnings)],
    dropped,
  });
}

const noDashes = (text: string) =>
  text
    .replace(/(\d)\s*[–—―]\s*(\d)/g, "$1-$2")
    .replace(/\s*(?:—|―|--)\s*/g, ", ")
    .replace(/\s+–\s+/g, ", ")
    .replace(/–/g, "-")
    .replace(/^,\s*/, "");
// Em dashes and other dash forms become commas or hyphens in every string (the rules forbid them).
export function withoutEmDashes<T>(value: T): T {
  if (typeof value === "string") return noDashes(value) as T;
  if (Array.isArray(value)) return value.map(withoutEmDashes) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, withoutEmDashes(item)]),
    ) as T;
  return value;
}
