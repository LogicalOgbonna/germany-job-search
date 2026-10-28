import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { hash, skillPatterns } from "./domain";
export type EvidenceRole = {
  company: string;
  title: string;
  dates: string;
  technologies: string;
  context: string;
  project: boolean;
  bullets: { id: string; text: string }[];
};
export type VerifiedSkill = {
  name: string;
  whereUsed: string;
  category: string;
};
export type Education = {
  institution: string;
  location: string;
  qualification: string;
  graduation: string;
};
const contactSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  phone: z.string(),
  location: z.string(),
  linkedin: z.url().refine((url) => url.startsWith("https://linkedin.com/")),
});
export function parseProfile(content: string): EvidenceRole[] {
  return content
    .split(/^## /m)
    .slice(1)
    .filter((section) => !section.startsWith("Education"))
    .map((section) => {
      const lines = section.split("\n");
      const [company, ...title] = lines[0].split(" — ");
      const dates = lines.findIndex((l) => /^\*\*[^*]+\*\*$/.test(l));
      const firstBullet = lines.findIndex((l) => l.startsWith("- "));
      return {
        company,
        title: title.join(" — "),
        dates: (lines[dates] ?? "").replace(/\*\*/g, ""),
        technologies: (
          lines.find((l) => /^\*\*(Key|Confirmed) technologies:/.test(l)) ?? ""
        ).replace(/^\*\*.*?\*\*\s*/, ""),
        context:
          firstBullet > dates
            ? lines
                .slice(dates + 1, firstBullet)
                .filter(
                  (l) =>
                    l.trim() &&
                    l.trim() !== "---" &&
                    !l.startsWith("Profile maintenance note"),
                )
                .join(" ")
                .trim()
            : "",
        project: company === "OurNigeria",
        bullets: lines
          .filter((l) => l.startsWith("- "))
          .map((l) => ({
            id: hash(`${company}:${l}`).slice(0, 16),
            text: l.slice(2),
          })),
      };
    });
}
export function parseSkills(content: string): VerifiedSkill[] {
  return content
    .split(/^## /m)
    .slice(1)
    .flatMap((section) => {
      const [category, ...lines] = section.split("\n");
      return lines
        .filter((l) => l.startsWith("|"))
        .flatMap((line) => {
          const [name, whereUsed] = line
            .split("|")
            .slice(1, -1)
            .map((s) => s.trim());
          return !name ||
            !whereUsed ||
            /^(Skill|Sector)$/.test(name) ||
            /^[-:]+$/.test(name)
            ? []
            : [{ name, whereUsed, category }];
        });
    });
}
export function parseEducation(content: string): Education {
  const section = content.split(/^## Education\s*$/m)[1];
  if (!section)
    throw new Error("Education is missing from the verified profile.");
  const lines = section
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const [institution, location = ""] = lines[0]
    .replaceAll("**", "")
    .split(" — ");
  return {
    institution,
    location,
    qualification: lines[1],
    graduation: (lines.find((l) => l.startsWith("Graduation Date:")) ?? "")
      .replace("Graduation Date:", "")
      .trim(),
  };
}
export async function readProfile() {
  const [content, skills, contactText] = await Promise.all([
    readFile(path.join(process.cwd(), "cv", "experience.md"), "utf8"),
    readFile(path.join(process.cwd(), "cv", "base_experience.md"), "utf8"),
    readFile(path.join(process.cwd(), "cv", "contact.json"), "utf8"),
  ]);
  return {
    roles: parseProfile(content),
    hash: hash(content + skills + contactText),
    skills,
    verifiedSkills: parseSkills(skills),
    education: parseEducation(content),
    contact: contactSchema.parse(JSON.parse(contactText)),
  };
}
export type CandidateProfile = Awaited<ReturnType<typeof readProfile>>;
export function evidenceScore(text: string, description: string) {
  return Object.values(skillPatterns).filter(
    (pattern) => pattern.test(description) && pattern.test(text),
  ).length;
}
export function selectEvidence(roles: EvidenceRole[], description: string) {
  // Tailoring changes emphasis, not the amount of verified career history retained.
  return roles.map((role) => ({
    ...role,
    bullets: [...role.bullets].sort(
      (a, b) =>
        evidenceScore(b.text, description) - evidenceScore(a.text, description),
    ),
  }));
}
