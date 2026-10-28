import { createHash } from "node:crypto";
import { z } from "zod";
import { isRecruiter } from "./linkedin-email";

export const tracks = [
  "Frontend",
  "Full-stack",
  "Backend",
  "Applied AI",
  "Automation",
] as const;
export const statuses = [
  "queued",
  "prepared",
  "submitted",
  "response",
  "assessment",
  "interview",
  "offer",
  "on_hold",
  "rejected",
  "withdrawn",
  "skipped",
] as const;
export const settingsSchema = z.object({
  dailyGoal: z.number().int().min(1).max(500).default(100),
  dailyMinutes: z.number().int().min(15).max(960).default(240),
  countries: z
    .array(z.enum(["DE", "US"]))
    .min(1)
    .default(["DE", "US"]),
  usPreference: z
    .enum(["unknown", "remote", "relocation", "authorized"])
    .default("unknown"),
  germanLevel: z.string().max(30).default("Not specified"),
  salaryMinimum: z.string().max(100).default(""),
  workModel: z.enum(["any", "remote", "hybrid", "onsite"]).default("any"),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaults = settingsSchema.parse({});
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function safeUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.toString()
      : "";
  } catch {
    return "";
  }
}
export function canonicalKey(url: string, fallback: string) {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const key of [...u.searchParams.keys()])
      if (/^(utm_|source$|ref$|referrer$|lever-source$|gh_src$)/i.test(key))
        u.searchParams.delete(key);
    u.hostname = u.hostname.replace(
      /^boards\.greenhouse\.io$/,
      "job-boards.greenhouse.io",
    );
    u.pathname = u.pathname.replace(/\/apply\/?$/, "").replace(/\/$/, "");
    u.searchParams.sort();
    return hash(u.toString());
  } catch {
    return hash(fallback);
  }
}
export function localDay(value: Date | string = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function countryCodes(location: string): string[] {
  const result: string[] = [];
  if (
    /\b(germany|deutschland|berlin|hamburg|munich|münchen|cologne|köln|frankfurt|düsseldorf|dusseldorf|stuttgart|german[y]?)\b|^DE$/i.test(
      location,
    )
  )
    result.push("DE");
  if (
    /\b(united states|u\.?s\.?a\.?|new york|san francisco|austin|boston|seattle|california|chicago|los angeles|us remote|remote us)\b|^US$/i.test(
      location,
    )
  )
    result.push("US");
  for (const [code, names] of Object.entries({
    NZ: /\bnew zealand|auckland\b|^NZ$/i,
    CH: /\bswitzerland|zurich|zürich|geneva\b|^CH$/i,
    AT: /\baustria|vienna|wien\b|^AT$/i,
    SE: /\bsweden|stockholm\b|^SE$/i,
    GB: /\bunited kingdom|\blondon\b|^UK$|^GB$/i,
    CA: /\bcanada|toronto|vancouver\b|^CA$/i,
    AU: /\baustralia|sydney|melbourne\b|^AU$/i,
    FR: /\bfrance|paris|lyon|lille|bordeaux\b|^FR$/i,
    NL: /\bnetherlands|amsterdam\b|^NL$/i,
    IE: /\bireland|dublin\b|^IE$/i,
    ES: /\bspain|madrid|barcelona\b|^ES$/i,
    PL: /\bpoland|warsaw\b|^PL$/i,
    GR: /\bgreece|athens\b|^GR$/i,
    PT: /\bportugal|lisbon\b|^PT$/i,
    IN: /\bindia|bengaluru|bangalore\b|^IN$/i,
  }))
    if (names.test(location)) result.push(code);
  return result;
}
export const skillPatterns: Record<string, RegExp> = {
  React: /\breact(?:\.js)?\b/i,
  TypeScript: /\btypescript\b/i,
  "Next.js": /\bnext\.?js\b/i,
  "Node.js": /\bnode\.?js\b/i,
  NestJS: /\bnest\.?js\b/i,
  PostgreSQL: /\bpostgres(?:ql)?\b/i,
  RAG: /\brag\b|retrieval.augmented/i,
  Agents: /\bagents?\b|agentic/i,
  LangGraph: /\blanggraph\b/i,
  "CI/CD": /ci\/?cd|continuous integration/i,
  Stripe: /\bstripe\b/i,
  Playwright: /\bplaywright\b/i,
  Docker: /\bdocker\b/i,
  Python: /\bpython\b/i,
  Java: /\bjava\b/i,
  Go: /\bgolang\b|\bgo\s+(?:engineer|developer)\b/i,
};
export function matchJob(title: string, description: string) {
  const text = `${title}\n${description}`;
  const skills = Object.entries(skillPatterns)
    .filter(([, regex]) => regex.test(text))
    .map(([s]) => s);
  const track = /automation|agent(?:ic)?\s+(?:engineer|developer)/i.test(title)
    ? "Automation"
    : /\bai\b|\bllm\b|machine learning|rag engineer/i.test(title)
      ? "Applied AI"
      : /full.?stack|product engineer/i.test(title)
        ? "Full-stack"
        : /back.?end|node\.?js|nest\.?js/i.test(title)
          ? "Backend"
          : /front.?end|react|ui\s+engineer|web\s+developer/i.test(title)
            ? "Frontend"
            : "Full-stack";
  const relevantTitle =
    /engineer|entwickler|developer|full.?stack|frontend|backend|software/i.test(
      title,
    );
  const strong = skills.filter((s) => !["Python", "Java", "Go"].includes(s));
  const reasons = strong
    .slice(0, 5)
    .map((s) => `${s} appears in your verified experience`);
  if (skills.includes("Python"))
    reasons.push(
      "Python is verified only for Genentech's RAG pipeline; otherwise personal-project experience",
    );
  if (skills.some((s) => ["Java", "Go"].includes(s)))
    reasons.push("Java/Go experience is not verified");
  if (/staff|principal|lead|head of/i.test(title))
    reasons.push("Review leadership and seniority requirements");
  if (!strong.length) reasons.push("Limited overlap with your verified stack");
  let score = Math.max(
    10,
    Math.min(
      97,
      35 +
        strong.length * 7 +
        (relevantTitle ? 15 : -20) +
        (/senior/i.test(title) ? 8 : 0) -
        (/intern|junior/i.test(title) ? 20 : 0),
    ),
  );
  if (
    /\b(?:python|java|golang|ruby|rust|c\+\+)\b|\bgo\s+(?:engineer|developer)/i.test(
      title,
    )
  ) {
    score = Math.min(score, 55);
    reasons.push(
      "The primary language in this title is not verified professional experience",
    );
  }
  const otherBackend = backendLanguages(description);
  if (
    /back.?end|full.?stack|platform|product engineer|software engineer/i.test(
      title,
    ) &&
    otherBackend.length &&
    !nodeBackend.test(description)
  ) {
    score = Math.min(score, 55);
    reasons.push(`${unverifiedBackendReason}: ${otherBackend.join(", ")}`);
  }
  return { track, skills, score, reasons };
}
// Verified backend work is Node.js/NestJS in TypeScript; Python is scoped to Genentech and handled above.
const nodeBackend =
  /\bnode\.?js\b|\bnest\.?js\b|\bexpress(?:\.js)?\b|\btypescript\b.{0,40}\b(?:backend|back-end|server|api)/i;
export const unverifiedBackendReason =
  "Backend stack is not verified professional experience";
export function backendLanguages(description: string) {
  return Object.entries({
    Java: /\bjava\b(?!script)|\bspring\b/i,
    Kotlin: /\bkotlin\b/i,
    Go: /\bgolang\b|\bgo\s+(?:backend|services|microservices)\b|\bin go\b/i,
    PHP: /\bphp\b|\blaravel\b|\bsymfony\b/i,
    Ruby: /\bruby\b|\brails\b/i,
    ".NET": /\bc#|\.net\b/i,
    Scala: /\bscala\b/i,
    Elixir: /\belixir\b/i,
  })
    .filter(([, regex]) => regex.test(description))
    .map(([name]) => name);
}
export function eligibilityNote(location: string, description: string) {
  if (
    /no (?:visa )?sponsorship|unable to sponsor|without sponsorship/i.test(
      description,
    )
  )
    return "Employer indicates no sponsorship. Confirm your work authorization before applying.";
  if (/remote/i.test(location) && countryCodes(location).includes("US"))
    return "US remote may require US residency. Working from Germany is not confirmed.";
  if (
    /german.{0,20}(?:c1|c2|fluent|native)|(?:fluent|native).{0,20}german/i.test(
      description,
    )
  )
    return "German proficiency is required. Confirm language and work authorization.";
  return "Check permitted work location, work authorization, and language requirements.";
}
export type IncomingJob = {
  externalId: string;
  title: string;
  company: string;
  location: string;
  description: string;
  applyUrl: string;
  sourceUrl?: string;
  countries?: string[];
  remote?: boolean;
  salary?: string;
  publishedAt?: Date | null;
  firstSeenAt?: Date;
  historical?: boolean;
  // Only a summary (title, company, place), e.g. from a LinkedIn email. A fuller stored
  // description of the same job is kept.
  summaryOnly?: boolean;
  easyApply?: boolean;
};
// Notes that depend on who posted the job and where it is applied to, added after matchJob.
export function postingNotes(
  match: ReturnType<typeof matchJob>,
  job: {
    company: string;
    description: string;
    applyUrl: string;
    easyApply?: boolean;
  },
) {
  const reasons = [...match.reasons];
  let score = match.score;
  if (isRecruiter(job.company, job.description)) {
    score = Math.min(score, 30);
    reasons.push(recruiterReason);
  }
  if (/^https:\/\/(?:[a-z]+\.)?linkedin\.com\//.test(job.applyUrl))
    reasons.push(
      job.easyApply ||
        /Applied to on LinkedIn \(Easy Apply\)/.test(job.description)
        ? "Apply on LinkedIn (Easy Apply); Jobdesk does not apply on LinkedIn for you"
        : linkedinOnlyReason,
    );
  return { ...match, score, reasons };
}
export const recruiterReason =
  "Posted by a recruiter, agency or contractor marketplace for an unnamed client";
export const linkedinOnlyReason =
  "Employer job board not found yet: open the posting on LinkedIn to reach the employer's application";
