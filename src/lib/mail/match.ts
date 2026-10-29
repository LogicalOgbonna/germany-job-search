import { employerFromAddress, isHiringSystem } from "./senders";
import type {
  BoardApplication,
  Classification,
  MatchResult,
  RawMail,
} from "./types";

const words = (list: string) => new Set(list.split(" "));
const legalForms = words(
  "gmbh mbh ag se inc ltd ug co kg kgaa group gruppe llc limited corp plc bv haftungsbeschrankt",
);
const mailboxes = words(
  "gmail.com googlemail.com outlook.com outlook.de hotmail.com hotmail.de live.com live.de msn.com yahoo.com yahoo.de icloud.com me.com mac.com aol.com gmx.de gmx.net gmx.com web.de t-online.de freenet.de posteo.de mailbox.org proton.me protonmail.com pm.me",
);
// Platforms and tools that write about other companies' hiring: their domain is never the employer.
const carriers = [
  "linkedin.com",
  "google.com",
  "calendly.com",
  "cal.com",
  "zoom.us",
  "doodle.com",
  "oncehub.com",
  "indeed.com",
  "indeedemail.com",
  "stepstone.de",
  "xing.com",
  "glassdoor.com",
  "testgorilla.com",
  "trustcruit.com",
  "filtered.ai",
  "codility.com",
  "hackerrank.com",
  "hackerrankforwork.com",
  "codesignal.com",
  "coderbyte.com",
];
// Sender display names and bracketed notes that name the carrier, not the employer.
const carrierNames = words(
  "ashby greenhouse lever personio recruitee teamtailor smartrecruiters workable join workday successfactors bamboohr softgarden linkedin linkedinjobs linkedinjobalerts wellfound instaffo google googlecalendar calendly zoom indeed xing stepstone glassdoor",
);
const teamWords =
  /(?<![\p{L}\d])(the|hiring|recruiting|recruitment|recruiter|talent|acquisition|people|culture|careers?|karriere|jobs?|hr|team|no-?reply|notifications?|bewerbung(en)?)(?![\p{L}\d])/giu;
// Words after which a company name starts.
const prepositions = words("at to with from by bei w/");
// Words that end a company name. After the soft ones the name may be lower case
// ("bei encentive erhalten"); after the hard ones it must look like a name.
const softStops = words(
  "erhalten übermittelt ubermittelt successfully is was has have",
);
const hardStops = words(
  "at to with from by bei w/ for für fur as als on your you we wir und",
);
const leadIns = words("the a an our join joining die der das den dem");
const months =
  /^(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?[.,]?(\s|$)|^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)[.,]?(\s|$)/i;
// Words that are never part of a company name in a subject line: roles and mail vocabulary.
const generic = words(
  "engineer engineering developer entwickler entwicklerin architect designer manager specialist programmer consultant intern werkstudent position role stelle job jobs frontend front-end backend back-end fullstack full-stack software senior junior staff principal lead founding head director trainer tester recruiter react typescript javascript node nodejs node.js vue vue.js angular python java php ruby aws sql nestjs next.js find get know hear discuss apply become application applications bewerbung interview interviews career careers team talent recruiting recruitment hiring schedule other candidate candidates first second next final complete portal programme programmes program process community pool me us you it them this that mir uns dir ihnen the a an our die der das den dem",
);
// Further words that rule out a whole subject segment or bracketed note as a company name.
const phrase = words(
  "your our we wir thank thanks danke vielen dank deine deiner dein ihre ihrer ihr update updates feedback confirmation confirming confirmed received reminder invitation invite einladung hello hi welcome steps step wichtig regarding notification request video virtual remote hybrid submitted 1st 2nd let's talk automatic privacy gdpr follow-up following eingang rückmeldung eingangsbestätigung absage zusage rejection assessment login cv resume platform zoom action required appointment booked relocation minutes full-time part-time or europe africa emea germany deutschland berlin hamburg munich münchen cologne köln frankfurt eu uk usa for to of is on in and und the a an as at with from by bei",
);
const grades = ["senior", "junior", "staff", "principal", "lead", "sr", "jr"];
const upper = /^[\p{Lu}\d&]/u;
const day = 86_400_000;
const nearMiss = 14 * day;

function companyTokens(name: string): string[] {
  const tokens = name
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  while (tokens.length > 1 && legalForms.has(tokens[tokens.length - 1]))
    tokens.pop();
  return tokens;
}

// Lower case, accents removed, legal suffixes (gmbh, ag, se, inc, ltd, ug, co, kg, group) and
// punctuation dropped: "Peec AI" -> "peecai", "1KOMMA5°" -> "1komma5", "Emidat GmbH" -> "emidat".
export function normalizeCompany(name: string): string {
  return companyTokens(name).join("");
}

// Equal, or the shorter name (5 characters or more) opens the longer one: on a word boundary
// for names read from text ("Grafana" and "Grafana Labs"), anywhere for names read from an
// address, where words run together ("1komma5grad", "lightspeedhq"). A name found in the
// middle of another ("develop" in "Senior Developer") is not a match.
function sameCompany(a: string[], b: string[], fromAddress: boolean): boolean {
  const x = a.join("");
  const y = b.join("");
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, b] : [y, a];
  if (short.length < 5) return false;
  if (fromAddress) return long.join("").startsWith(short);
  let run = "";
  return long.some((token) => (run += token) === short);
}

// "Eye" and "Eye Security", "Peec" and "Peec AI": the same first word (3 characters or more)
// and one name opening the other, but too short for sameCompany to call it a match.
function similarCompany(a: string[], b: string[]): boolean {
  const x = a.join("");
  const y = b.join("");
  return (
    a[0] === b[0] &&
    a[0].length >= 3 &&
    x !== y &&
    (x.startsWith(y) || y.startsWith(x))
  );
}

// Where a name was read. `fromAddress`: the sender's address, where words run together.
// `sender`: address or display name, so the sender itself says it. `subject`: the subject
// line, which anyone can write but a hiring system writes for the employer.
type Evidence = {
  name: string;
  tokens: string[];
  fromAddress: boolean;
  sender: boolean;
  subject: boolean;
};
type Source = "classification" | "address" | "display" | "subject";

function splitAddress(address: string): [string, string] {
  const at = address.lastIndexOf("@");
  return at > 0
    ? [address.slice(0, at).toLowerCase(), address.slice(at + 1).toLowerCase()]
    : ["", ""];
}
const under = (domain: string, bases: Iterable<string>) =>
  [...bases].some((base) => domain === base || domain.endsWith(`.${base}`));

// "envelio" from jobs@envelio.de, "jakala" from x@hr.jakala.com, "cwjobs" from x@cwjobs.co.uk.
function domainName(domain: string): string {
  const labels = domain.split(".");
  const twoPart =
    labels.length > 2 &&
    labels[labels.length - 1].length === 2 &&
    /^(co|com|org|net|ac)$/.test(labels[labels.length - 2]);
  return labels[labels.length - (twoPart ? 3 : 2)] ?? "";
}

const bare = (word: string) =>
  word.toLowerCase().replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, "");
const tidy = (name: string) =>
  name
    .replace(/\s+/g, " ")
    .replace(
      /^[\s"'“”‘’<>(),;:.!?|/\\@–—-]+|[\s"'“”‘’<>(),;:.!?|/\\@–—-]+$/g,
      "",
    );
const isGeneric = (word: string) =>
  generic.has(word) || word.split(/[-/]/).some((piece) => generic.has(piece));
// A short run of words none of which is role or mail vocabulary.
const nameLike = (text: string, maxWords: number) => {
  const parts = text.split(/[\s/]+/).filter(Boolean);
  return (
    parts.length > 0 &&
    parts.length <= maxWords &&
    !/^\d+%?$/.test(parts[0]) &&
    parts.every((part) => {
      const word = bare(part);
      return word && !isGeneric(word) && !phrase.has(word);
    })
  );
};

function senderName(mail: RawMail, known: string[]): string | null {
  const [local, domain] = splitAddress(mail.fromAddress);
  if (!domain || mailboxes.has(domain)) return null;
  let name = mail.fromName.trim();
  if (!name || name.includes("@")) return null;
  const via = name.match(/^(.+?)\s+via\s+\S.*$/i);
  if (via) {
    if (under(domain, ["linkedin.com"])) return null;
    name = via[1];
  }
  name =
    name.match(/^.+?\s+(?:from|at|von|bei|@)\s+(.+)$/i)?.[1] ??
    name.match(/^.+\(([^()]+)\)$/)?.[1] ??
    name;
  name = tidy(
    name.replace(teamWords, " ").replace(/\s[&|+]\s*$|^\s*[&|+]\s/g, " "),
  );
  const tokens = companyTokens(name);
  if (!tokens.length || carrierNames.has(tokens.join(""))) return null;
  if (known.some((other) => sameCompany(tokens, companyTokens(other), true)))
    return name;
  // "Samuel Nyarko" <samuel.nyarko@...>, "Amar Besic" <abesic@...>: a person, not the employer.
  const localParts = local.split(/[^a-z0-9]+/).filter(Boolean);
  const person = tokens.some(
    (token) =>
      token.length >= 3 &&
      (localParts.includes(token) ||
        (tokens.length > 1 && localParts.join("").endsWith(token))),
  );
  return person ? null : name;
}

// Company names that follow "at", "to", "with", "from", "by", "bei", "@" or "interest in".
function afterPrepositions(segment: string): string[] {
  const parts = segment.split(/\s+/).filter(Boolean);
  const names: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const word = parts[i].toLowerCase();
    let start = -1;
    if (prepositions.has(word) || word === "@") start = i + 1;
    else if (word === "in" && /^interest(ed)?$/i.test(parts[i - 1] ?? ""))
      start = i + 1;
    else if (/^@[\p{L}\d]/u.test(word)) start = i;
    if (start < 0) continue;
    while (start < parts.length - 1 && leadIns.has(parts[start].toLowerCase()))
      start++;
    const picked: string[] = [];
    let soft = true;
    for (let j = start; j < parts.length; j++) {
      const raw = j === i ? parts[j].slice(1) : parts[j];
      const lower = raw.toLowerCase();
      if (softStops.has(lower)) break;
      const possessive = /['’]s[!?,;:.]*$/.test(raw);
      const text = raw
        .replace(/['’]s(?=[!?,;:.]*$)/, "")
        .replace(/[!?,;:.]+$/, "");
      if (isGeneric(bare(text))) {
        // "doinstruct Software GmbH" still ends the name softly, "discuss next steps" does not.
        soft &&= upper.test(text);
        break;
      }
      if (hardStops.has(lower) || lower.startsWith("@")) {
        soft = false;
        break;
      }
      if (text) picked.push(text);
      if (possessive || /,$/.test(raw)) soft = false;
      if (possessive || /[!?,;:.]$/.test(raw)) break;
    }
    const name = picked.join(" ");
    if (
      picked.length > 0 &&
      picked.length <= 5 &&
      (upper.test(name) || soft) &&
      !months.test(name)
    )
      names.push(name);
  }
  return names;
}

// The tokens of a usable company name, or null for leftovers such as "AI" or "GmbH".
function usable(name: string): string[] | null {
  const tokens = companyTokens(name);
  const key = tokens.join("");
  return key.length < 2 ||
    key === "ai" ||
    name.length > 60 ||
    tokens.every((token) => legalForms.has(token))
    ? null
    : tokens;
}

function subjectNames(subject: string): string[] {
  const names: string[] = [];
  const text = subject
    .replace(/^(?:\s*(?:re|aw|fwd?|wg)\s*:)+/i, "")
    .replace(/\([^()]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b(full|front|back)[ -](stack|end)\b/gi, "$1$2")
    .trim();
  const segments = text
    .split(/\||\/\/|:\s|\s[-–—/l]\s/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  for (const segment of segments) names.push(...afterPrepositions(segment));
  for (const segment of segments) {
    // "8returns Application Update", "Raisin Interview Confirmation"
    const before = segment
      .match(
        /^(.{2,40}?)\s+(?:application|interview|bewerbung)(?![\p{L}\d])/iu,
      )?.[1]
      .replace(teamWords, " ")
      .trim();
    if (before && upper.test(before) && nameLike(before, 4)) names.push(before);
    // "Regarding your Helsing application"
    const owned = segment.match(
      /(?<![\p{L}\d])(?:your|deine[rmn]?|ihre[rmn]?)\s+(.{2,40}?)\s+(?:application|bewerbung|interview)(?![\p{L}\d])/iu,
    )?.[1];
    if (owned && nameLike(owned, 3)) names.push(owned);
    // "TeamViewer has received your application!"
    const receiver = segment.match(
      /^(?:[\p{L}'’-]+,\s+)?(.{2,40}?)\s+(?:has\s+|have\s+)?received your application/iu,
    )?.[1];
    if (receiver && nameLike(receiver, 4)) names.push(receiver);
    // "Deine Bewerbung wurde erfolgreich an HRworks übermittelt"
    const sentTo = segment.match(
      /(?<![\p{L}\d])an\s+(.{2,40}?)\s+(?:übermittelt|gesendet|versendet)/iu,
    )?.[1];
    if (sentTo && nameLike(sentTo, 4)) names.push(sentTo);
  }
  // A subject that states the employer needs no guessing from its layout, and the guesses
  // below are the weakest evidence there is ("Morson Edge (Technology)").
  if (names.some((name) => usable(tidy(name)))) return names;
  // "LIQID | Your application", "We received your application | plancraft": the employer
  // opens or closes a subject that is split by separators.
  if (segments.length > 1)
    for (const segment of new Set([segments[0], segments[segments.length - 1]]))
      if (
        nameLike(segment, 4) &&
        (upper.test(segment) || segment.split(/\s+/).length <= 2)
      )
        names.push(segment);
  // "Thank you for your application! (AMBOSS)"
  const note = subject.match(/\(([^()]+)\)[\s!.?]*$/)?.[1] ?? "";
  if (!note.split(/[\s/,]+/).some((word) => isGeneric(bare(word))))
    for (const part of note.split("/"))
      if (nameLike(part.trim(), 4) && !carrierNames.has(normalizeCompany(part)))
        names.push(part.trim());
  return names;
}

function evidence(mail: RawMail, classification: Classification): Evidence[] {
  const found: Evidence[] = [];
  const add = (value: string | null, source: Source) => {
    const name = tidy(value ?? "");
    const tokens = usable(name);
    if (!tokens) return;
    const key = tokens.join("");
    const fromAddress = source === "address";
    const sender = fromAddress || source === "display";
    const subject = source === "subject";
    const earlier = found.find((item) => item.tokens.join("") === key);
    if (earlier) {
      earlier.fromAddress ||= fromAddress;
      earlier.sender ||= sender;
      earlier.subject ||= subject;
    } else found.push({ name, tokens, fromAddress, sender, subject });
  };
  add(classification.company, "classification");
  if (!mail.fromMe) {
    const [, domain] = splitAddress(mail.fromAddress);
    const employer = employerFromAddress(mail.fromAddress);
    const own =
      domain &&
      !isHiringSystem(mail.fromAddress) &&
      !mailboxes.has(domain) &&
      !under(domain, carriers)
        ? domainName(domain)
        : "";
    add(employer, "address");
    add(senderName(mail, [employer ?? "", own].filter(Boolean)), "display");
    add(own, "address");
  }
  for (const name of subjectNames(mail.subject)) add(name, "subject");
  return found;
}

// Every company name the mail offers, best first: classification.company, employerFromAddress,
// sender display name, the sender's own domain when it is not a hiring system or a public
// mailbox provider, and "at X" / "to X" / "bei X" / "@ X" phrases in the subject.
export function companyEvidence(
  mail: RawMail,
  classification: Classification,
): string[] {
  return evidence(mail, classification).map((item) => item.name);
}

// Lower case, "(m/f/d)"-style markers and punctuation removed, padded so that
// `includes` only matches whole words.
function roleText(text: string): string {
  const clean = text
    .toLowerCase()
    .replace(/\(\s*(?:all genders|all|gn|d|divers)\s*\)/g, " ")
    .replace(
      /\(?(?<![\p{L}\d])[mfwdx]\s*\/\s*[mfwdx](?:\s*\/\s*[mfwdx])?(?![\p{L}\d])\)?/gu,
      " ",
    )
    .replace(/[^\p{L}\d+#]+/gu, " ")
    .replace(/\b(full|front|back) (stack|end)\b/g, "$1$2")
    .trim();
  return clean.length > 2 ? ` ${clean} ` : "";
}

function byRole(
  mail: RawMail,
  classification: Classification,
  candidates: BoardApplication[],
): BoardApplication[] {
  const subject = roleText(mail.subject);
  const role = roleText(classification.role ?? "");
  // The mail names this title and not another grade of it: "Senior Software Engineer"
  // is not about the "Software Engineer" card.
  const named = (title: string) =>
    [subject, role].some(
      (text) =>
        text.includes(title) &&
        !grades.some((grade) => text.includes(` ${grade}${title}`)),
    );
  const fits = candidates
    .map((application) => ({ application, title: roleText(application.title) }))
    .filter(
      ({ title }) =>
        title !== "" && (named(title) || (role !== "" && title.includes(role))),
    );
  // "Software Engineer" also fits a mail about "Senior Software Engineer": when the mail
  // names the longer title, the shorter one is not what it is about.
  return fits
    .filter(
      (fit) =>
        !fits.some(
          (other) =>
            other.title !== fit.title &&
            other.title.includes(fit.title) &&
            named(other.title),
        ),
    )
    .map((fit) => fit.application);
}

// "Interview with the Hiring Manager" names the interviewer, not the role applied for.
const interviewer =
  /(?<![\p{L}\d])(?:(?:with|mit)\s+(?:(?:the|our|your|a|an|unserem|unserer|dem|der)\s+)?(?:[\p{L}-]+\s+){0,2}|hiring\s+)manager(?:in)?(?![\p{L}\d])/giu;
// Where a role ends inside a subject: "Your application as <role> at <company> | ...".
const roleBreaks =
  /\||\/\/|:\s|\s\/\s|\s@|(?<![\p{L}\d])(?:as|als|for|für|to|at|bei|with|mit|zur|zum|position|role|stelle)(?![\p{L}\d])/iu;
const jobNouns = words(
  "engineer architect manager designer scientist analyst consultant tester researcher",
);
const roleAliases: Record<string, string> = {
  dev: "engineer",
  swe: "engineer",
  sr: "senior",
  jr: "junior",
  nodejs: "node",
  architekt: "architect",
  architektin: "architect",
  managerin: "manager",
  designerin: "designer",
  analystin: "analyst",
  berater: "consultant",
  beraterin: "consultant",
};
// Mail vocabulary that says nothing about which role a title is.
const roleNoise = words(
  "your our we wir you the a an of for to and und or in on at as als with mit by bei from is was has have been are this that it application applications bewerbung interview interviews invitation einladung update updates feedback confirmation confirming thank thanks danke vielen dank deine deiner dein ihre ihrer ihr received erhalten eingang eingangsbestätigung rückmeldung position role stelle job regarding reminder next steps step submitted successfully receipt re new status results hello hi dear opportunity process virtual video call round about zu zur zum die der das für wurde haben hat",
);

// The significant words of a role title, with Developer, Entwickler and Engineer read as one
// word: "Senior Frontendentwickler (m/w/d)" -> senior, frontend, engineer.
function roleWords(text: string): Set<string> {
  const found = new Set<string>();
  for (const raw of roleText(text).trim().split(" ")) {
    const word = roleAliases[raw] ?? raw;
    const builder = word.match(
      /^(.*?)(?:engineer|developer|entwickler|ingenieur|programmer|programmierer)(?:in|s)?$/,
    );
    for (const part of builder ? [builder[1], "engineer"] : [word])
      if (part.length > 1 && !roleNoise.has(part)) found.add(part);
  }
  return found;
}
const within = (a: Set<string>, b: Set<string>) =>
  [...a].every((word) => b.has(word));

// True when the mail states a role and it is not the card's. Two titles are the same role
// only when the significant words of one are all in the other: "Frontend Engineer" and
// "Senior Frontend Engineer (f/m/d) - React" are, "Staff Frontend Engineer" and "Senior
// Frontend Engineer" are not. A mail that states no role is never a conflict.
function namesAnotherRole(
  mail: RawMail,
  classification: Classification,
  application: BoardApplication,
  companies: string[],
): boolean {
  const title = roleWords(application.title);
  if (!title.size || /^role not stated$/i.test(application.title.trim()))
    return false;
  // Company names can carry role words ("Data Minds") and must not count as the role.
  let subject = mail.subject.replace(interviewer, " ");
  for (const company of companies)
    if (company.trim().length > 1)
      subject = subject.replace(
        new RegExp(
          `(?<![\\p{L}\\d])${company.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\d])`,
          "giu",
        ),
        " ",
      );
  // The subject states a role where a stretch of it names a kind of job.
  const stated = [
    roleWords(classification.role ?? ""),
    ...subject
      .split(roleBreaks)
      .map(roleWords)
      .filter((found) => [...found].some((word) => jobNouns.has(word))),
  ].filter((found) => found.size);
  return (
    stated.length > 0 &&
    !within(title, roleWords(subject)) &&
    !stated.some((found) => within(found, title) || within(title, found))
  );
}

export function matchMail(
  mail: RawMail,
  classification: Classification,
  applications: BoardApplication[],
): MatchResult {
  const ids = (list: BoardApplication[]) => list.map((item) => item.id);
  const found = evidence(mail, classification);
  const names = (item: BoardApplication) => [
    item.company,
    ...found.map((name) => name.name),
  ];
  const hiringSystem = !mail.fromMe && isHiringSystem(mail.fromAddress);
  const linked = mail.threadId
    ? applications.filter((item) => item.threadIds.includes(mail.threadId))
    : [];
  if (linked.length > 1)
    return {
      kind: "ambiguous",
      candidateIds: ids(linked),
      reason: `thread is linked to ${linked.length} applications`,
    };
  if (linked.length === 1) {
    // Gmail threads by subject, so another employer's "Update on your application" can land
    // in a linked thread. What the sender says about itself (and, for a hiring system, what
    // its subject says) must not point somewhere else, unless the subject names this company.
    const tokens = companyTokens(linked[0].company);
    const here = (name: Evidence) =>
      sameCompany(tokens, name.tokens, name.fromAddress);
    const says = found.filter(
      (name) => name.sender || (hiringSystem && name.subject),
    );
    if (
      says.length &&
      !found.some((name) => (name.sender || name.subject) && here(name))
    )
      return {
        kind: "ambiguous",
        candidateIds: [linked[0].id],
        reason: "thread, but the mail names another company",
      };
    if (namesAnotherRole(mail, classification, linked[0], names(linked[0])))
      return {
        kind: "ambiguous",
        candidateIds: [linked[0].id],
        reason: "thread, but the mail names a different role",
      };
    return {
      kind: "unique",
      applicationId: linked[0].id,
      reason: "thread",
      corroborated: true,
    };
  }
  if (!found.length)
    return { kind: "none", reason: "no company named in the mail" };
  // How long before the card was submitted (or, when it never was, added) the mail arrived.
  // A card with neither date cannot be ruled out.
  const early = (item: BoardApplication) => {
    const since = item.submittedAt ?? item.createdAt;
    return since ? since.getTime() - mail.receivedAt.getTime() : 0;
  };
  const atCompany = applications.filter((item) => {
    const tokens = companyTokens(item.company);
    return found.some((name) =>
      sameCompany(tokens, name.tokens, name.fromAddress),
    );
  });
  if (!atCompany.length) {
    // A second card for "Eye" next to "Eye Security" would be a duplicate; a person decides.
    const similar = applications.filter((item) => {
      const tokens = companyTokens(item.company);
      return (
        tokens.length > 0 &&
        early(item) <= nearMiss &&
        found.some((name) => similarCompany(tokens, name.tokens))
      );
    });
    if (similar.length)
      return {
        kind: "ambiguous",
        candidateIds: ids(similar),
        reason: "a similar company name is on the board",
      };
    return { kind: "none", reason: `no application at ${found[0].name}` };
  }
  const candidates = atCompany.filter((item) => early(item) <= day);
  const company = [...new Set(atCompany.map((item) => item.company))].join(
    ", ",
  );
  if (!candidates.length) {
    // A few days early is more likely a submission recorded late than another application;
    // a second card would be a duplicate, so a person decides.
    const near = atCompany.filter((item) => early(item) <= nearMiss);
    if (near.length)
      return {
        kind: "ambiguous",
        candidateIds: ids(near),
        reason: "company, but the mail is older than the application",
      };
    return {
      kind: "none",
      reason: `applications at ${company} were submitted after this mail`,
    };
  }
  // The sender vouches for the company when its own address names it (there a longer form
  // such as "smavatalent" is normal), or when the name is exactly the card's and comes from
  // the display name or from a hiring system, which writes on the employer's behalf. A name
  // that merely starts like the card's ("Plato Systems" for "Plato") proves nothing.
  const corroborated = (item: BoardApplication) => {
    const tokens = companyTokens(item.company);
    const key = tokens.join("");
    return found.some(
      (name) =>
        sameCompany(tokens, name.tokens, name.fromAddress) &&
        (name.fromAddress ||
          (name.tokens.join("") === key && (name.sender || hiringSystem))),
    );
  };
  if (candidates.length === 1) {
    // A rejection for another role at the same company must not close this card.
    if (
      namesAnotherRole(
        mail,
        classification,
        candidates[0],
        names(candidates[0]),
      )
    )
      return {
        kind: "ambiguous",
        candidateIds: [candidates[0].id],
        reason: "company, but the mail names a different role",
      };
    return {
      kind: "unique",
      applicationId: candidates[0].id,
      reason: "company",
      corroborated: corroborated(candidates[0]),
    };
  }
  const winners = byRole(mail, classification, candidates);
  if (winners.length === 1)
    return {
      kind: "unique",
      applicationId: winners[0].id,
      reason: "company+role",
      corroborated: corroborated(winners[0]),
    };
  return {
    kind: "ambiguous",
    candidateIds: ids(candidates),
    reason: `${candidates.length} applications at ${company}, ${winners.length ? "role fits several" : "role not named"}`,
  };
}
