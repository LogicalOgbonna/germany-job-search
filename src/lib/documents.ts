import { db } from "./db";
import { skillPatterns } from "./domain";
import {
  readProfile,
  selectEvidence,
  evidenceScore,
  type CandidateProfile,
} from "./profile";
import { coreCompetencies, professionalSummary } from "./cv-content";
import { documentFingerprint } from "./document-version";
const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/—/g, ",");
const template = (
  title: string,
  body: string,
  kind = "cv",
) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:A4;margin:12mm 12mm 14mm}*{box-sizing:border-box}body{font:10pt/1.22 'Times New Roman',Times,serif;color:#111;max-width:186mm;margin:24px auto;padding:0 12px}header{text-align:center;margin-bottom:12px}h1{font-size:23pt;line-height:1.1;margin:0 0 6px}header p{margin:0;font-size:9.3pt}header a{color:#0645ad}h2{font-size:10.5pt;text-transform:uppercase;border-bottom:.7pt solid #111;padding-bottom:3px;margin:12px 0 6px;break-after:avoid}h3{font-size:10pt;margin:0}p{margin:5px 0;orphans:3;widows:3}ul{padding-left:14px;margin:4px 0 0}li{margin:3px 0;text-align:left;break-inside:avoid;orphans:3;widows:3}.competencies{padding-left:14px}.competencies li{margin:3px 0}.role{margin-top:10px}.role-head{display:grid;grid-template-columns:1fr auto;gap:2px 12px}.role-head .right{text-align:right}.role-title,.role-dates{font-style:italic}.role-lead{break-inside:avoid}.role-context{margin:5px 0}.technologies{font-size:9pt;line-height:1.2;margin:4px 0;color:#333}.letter p{margin:12px 0;line-height:1.45}.letter header{margin-bottom:25px}.education{break-inside:avoid}.education h3{font-weight:normal}.summary{margin-top:0}a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}@media print{body{margin:0;padding:0;max-width:none}.role-head a{color:inherit}}
</style></head><body class="${kind}">${body}</body></html>`;
function contact(profile: CandidateProfile) {
  const c = profile.contact;
  return `<header><h1>${esc(c.name)}</h1><p><a href="mailto:${esc(c.email)}">${esc(c.email)}</a> | <a href="tel:${esc(c.phone)}">${esc(c.phone)}</a> | ${esc(c.location)} | <a href="${esc(c.linkedin)}">LinkedIn</a></p></header>`;
}
function roleDates(dates: string) {
  const parts = dates.split("|").map((s) => s.trim());
  const index = parts.findIndex((p) =>
    /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/.test(p),
  );
  return {
    period: parts[index] ?? dates,
    location: index >= 0 ? parts.slice(index + 1).join(" | ") : "",
    employment: index > 0 ? parts.slice(0, index).join(" | ") : "",
  };
}
function highlight(text: string, description: string) {
  const requested = Object.values(skillPatterns)
    .filter((pattern) => pattern.test(description))
    .map((p) => p.source);
  // Typography only: escape every segment, preserving the exact evidence text.
  const pattern = new RegExp(
    [...requested, "(?:approximately\\s+)?\\b\\d+(?:[-,.]\\d+)*(?:%|\\+)"].join(
      "|",
    ),
    "gi",
  );
  let html = "",
    last = 0;
  for (const match of text.matchAll(pattern)) {
    html +=
      esc(text.slice(last, match.index)) + `<strong>${esc(match[0])}</strong>`;
    last = match.index! + match[0].length;
  }
  return html + esc(text.slice(last));
}
export function renderDocuments(
  job: {
    title: string;
    company: string;
    description: string;
    skills: string[];
  },
  profile: CandidateProfile,
) {
  const description = `${job.title}\n${job.description}`;
  const roles = selectEvidence(profile.roles, description);
  const renderRole = (role: (typeof roles)[number]) => {
    const dates = roleDates(role.dates);
    const bullets = role.bullets.map(
      (b) =>
        `<li data-evidence-id="${b.id}">${highlight(b.text, description)}</li>`,
    );
    return `<section class="role"><div class="role-lead"><div class="role-head"><h3>${esc(role.company)}</h3><span class="right">${role.project ? '<a href="https://ournigeria.ng">ournigeria.ng</a>' : esc([dates.location, dates.employment].filter(Boolean).join(" · "))}</span><strong class="role-title">${esc(role.title)}</strong><span class="right role-dates">${esc(dates.period)}</span></div>${role.context ? `<p class="role-context">${esc(role.context)}</p>` : ""}${role.technologies ? `<p class="technologies"><strong>${role.company === "Wunderflats" ? "Confirmed technologies" : "Technologies"}:</strong> ${esc(role.technologies)}</p>` : ""}<ul>${bullets[0] ?? ""}</ul></div>${bullets.length > 1 ? `<ul>${bullets.slice(1).join("")}</ul>` : ""}</section>`;
  };
  const competencies = coreCompetencies(profile.verifiedSkills, description);
  const e = profile.education;
  const cvHtml = template(
    `${job.company} CV`,
    `${contact(profile)}<h2>Summary</h2><p class="summary">${esc(professionalSummary(profile, job.title, job.description))}</p><h2>Core competencies</h2><ul class="competencies">${competencies.map((g) => `<li><strong>${esc(g.label)}:</strong> ${g.skills.map((s) => esc(s.display)).join(", ")}.</li>`).join("")}</ul><h2>Work experience</h2>${roles
      .filter((r) => !r.project)
      .map(renderRole)
      .join("")}<h2>Projects</h2>${roles
      .filter((r) => r.project)
      .map(renderRole)
      .join(
        "",
      )}<section class="education"><h2>Education</h2><div class="role-head"><h3>${esc(e.institution)}</h3><span class="right">${esc(e.location)}</span><span>${esc(e.qualification)}</span><span class="right">Graduation Date: ${esc(e.graduation)}</span></div></section>`,
  );
  const candidates = roles
    .flatMap((role) => role.bullets.map((b) => ({ ...b, role })))
    .sort(
      (a, b) =>
        evidenceScore(b.text, description) - evidenceScore(a.text, description),
    );
  const used = new Set<string>();
  const wanted = candidates
    .filter((b) => {
      if (used.has(b.role.company)) return false;
      used.add(b.role.company);
      return true;
    })
    .slice(0, 3);
  const letterHtml = template(
    `${job.company} cover letter`,
    `${contact(profile)}<p>Dear ${esc(job.company)} hiring team,</p><p>I am applying for the ${esc(job.title)} position. ${esc(professionalSummary(profile, job.title, job.description))}</p>${wanted.map((b) => `<p><strong>${esc(b.role.title)}, ${esc(b.role.company)} (${esc(roleDates(b.role.dates).period)}):</strong> ${esc(b.text)}</p>`).join("")}<p>I would welcome a conversation about the role and how my experience could contribute to your team.</p><p>Kind regards,<br>${esc(profile.contact.name)}</p>`,
    "letter",
  );
  return {
    cvHtml,
    letterHtml,
    evidenceIds: roles.flatMap((r) => r.bullets.map((b) => b.id)),
  };
}
export async function generateDocuments(jobId: string) {
  const profile = await readProfile();
  // Keep the submission guard and document creation in one transaction so a
  // concurrent submission cannot receive a new, unreviewed document snapshot.
  return db.$transaction(
    async (tx) => {
      const job = await tx.job.findUniqueOrThrow({ where: { id: jobId } });
      const application = await tx.application.findUnique({ where: { jobId } });
      if (application?.submittedAt)
        throw new Error(
          "This application has already been submitted. Its documents are preserved.",
        );
      const fingerprint = documentFingerprint(profile.hash, job.contentHash);
      return tx.document.upsert({
        where: { jobId_fingerprint: { jobId, fingerprint } },
        create: {
          jobId,
          fingerprint,
          profileHash: profile.hash,
          jobHash: job.contentHash,
          ...renderDocuments(job, profile),
        },
        update: {},
      });
    },
    { isolationLevel: "Serializable" },
  );
}
