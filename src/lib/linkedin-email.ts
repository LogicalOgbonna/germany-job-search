// LinkedIn job alert and recommendation emails, read from the user's own mailbox.
// LinkedIn forbids scraping its site, so these emails are how LinkedIn jobs enter Jobdesk.

export type LinkedinEmailJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  search: string | null; // the alert's search, e.g. "frontend engineer in Germany"
  germany: boolean; // the alert searches Germany, so a bare city name is a German city
  easyApply: boolean; // "Apply with resume & profile": the posting is applied to on LinkedIn
};

const viewJob = /^View job:\s*\S*linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/i;
const separator = /^-{5,}$/;
const noise =
  /^(?:this company is actively hiring|apply with resume & profile|easy apply|(?:high|good|medium|low|strong) (?:skills?|experience) match|be an early applicant|actively recruiting|promoted|\d+ (?:connections?|alumni|alums?|school alum(?:ni|s)?|employees?)\b.*|see all jobs on linkedin.*|manage your job alerts.*|recommendations based on your activity\.?|expand your search|.*jobs$|your job alert for .*|https?:\/\/\S+)$/i;

export function parseLinkedinEmail(body: string): LinkedinEmailJob[] {
  const search = body.match(/^Your job alert for (.+)$/im)?.[1]?.trim() ?? null;
  const germany = /\b(germany|deutschland)\b/i.test(search ?? "");
  const jobs: LinkedinEmailJob[] = [];
  let block: string[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    const view = line.match(viewJob);
    if (view) {
      const easyApply = block.some((l) =>
        /^(?:apply with resume & profile|easy apply)$/i.test(l),
      );
      const kept = block.filter((l) => l && !noise.test(l));
      const [title, company, location = ""] =
        kept.length >= 3 ? kept.slice(-3) : [...kept.slice(-2), ""];
      if (title && company && !jobs.some((j) => j.id === view[1]))
        jobs.push({
          id: view[1],
          title,
          company,
          location,
          search,
          germany,
          easyApply,
        });
      block = [];
    } else if (separator.test(line)) block = [];
    else block.push(line);
  }
  return jobs;
}

// Staffing agencies, recruiters and contractor marketplaces post roles for unnamed clients.
const recruiterCompany =
  /\b(?:randstad|hays|gulp|adecco|manpower|kelly services|brunel|computer futures|rise technical|ic resources|sthree|progressive recruitment|harvey nash|michael page|robert half|amoria bond|jefferson frank|nigel frank|jobgether|instaffo|alignerr|crossover|turing|toptal|hiredbuddy|fde times|digital waffle|engradar|stott and may|headhunt\w*|recruit(?:ment|ing|ers?)\b(?! team)|staffing|personalvermittlung|personaldienstleist\w*|zeitarbeit|talente?\b|crosstalent)\b|search \|/i;
// Recruiter phrasing only: "unsere Kunden" / "our clients" also describe an employer's own customers.
const recruiterText =
  /on behalf of (?:our|a) clients?\b|\bour client(?:, | is | has )|im auftrag (?:unseres|eines) kunden|\bunser kunde\b|für einen unserer kunden|im rahmen (?:der|einer) arbeitnehmerüberlassung/i;
export function isRecruiter(company: string, description: string) {
  return recruiterCompany.test(company) || recruiterText.test(description);
}

// Titles of the same role on LinkedIn and on the employer's board differ in gender tags,
// dashes and spacing; everything else must match closely.
const titleWords = (title: string) =>
  title
    .toLowerCase()
    .replace(
      /\((?:[mwfdxa*]\s*\/\s*)+[mwfdxa*]\)|\((?:all|alle) (?:genders|identities|geschlechter)\)|\(gn\)|\(d\)/g,
      " ",
    )
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9+#.]+/)
    .filter((w) => w && !["m", "w", "f", "d", "x"].includes(w));
export function sameRole(a: string, b: string) {
  const x = new Set(titleWords(a));
  const y = new Set(titleWords(b));
  if (!x.size || !y.size) return false;
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / (x.size + y.size - shared) >= 0.8;
}

export const normalizeCompany = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(
      /\b(?:gmbh|ag|se|ug|kg|co|inc|ltd|llc|e\.?v\.?|group|haftungsbeschrankt)\b\.?/g,
      "",
    )
    .replace(/[^a-z0-9]+/g, "");
