import { matchJob } from "./domain";
import {
  evidenceScore,
  type CandidateProfile,
  type VerifiedSkill,
} from "./profile";

const competencyGroups = [
  {
    label: "Programming languages",
    categories: ["Programming Languages"],
    limit: 5,
  },
  {
    label: "Frontend & UI architecture",
    categories: [
      "Frontend Frameworks & Libraries",
      "Styling & UI Components",
      "Web Core Concepts & Architecture",
    ],
    limit: 10,
  },
  {
    label: "State management & data fetching",
    categories: ["State Management & Data Fetching"],
    limit: 7,
  },
  {
    label: "Backend, payments & data",
    categories: ["Backend & API", "Databases & ORM"],
    limit: 10,
  },
  {
    label: "AI, RAG & agents",
    categories: [
      "AI & Large Language Models",
      "Workflow Orchestration & Background Jobs",
    ],
    limit: 10,
  },
  {
    label: "Testing & code quality",
    categories: ["Testing & Automation", "Code Quality & Tooling"],
    limit: 8,
  },
  {
    label: "Cloud, delivery & build tooling",
    categories: ["Cloud, Infrastructure & DevOps", "Build Tools & Bundlers"],
    limit: 10,
  },
  {
    label: "Performance & observability",
    categories: ["Observability, Profiling & Monitoring"],
    limit: 8,
  },
  {
    label: "Leadership & delivery",
    categories: ["Methodologies & Leadership"],
    limit: 6,
  },
];
function qualifiedSkill(skill: VerifiedSkill) {
  // Preserve the scope restrictions in the inventory; keyword matches do not turn
  // personal-project skills or architecture knowledge into employment claims.
  const context = skill.whereUsed.toLowerCase();
  if (context.startsWith("personal project"))
    return `${skill.name} (personal projects)`;
  if (context === "early career") return `${skill.name} (early career)`;
  if (context.startsWith("general knowledge"))
    return `${skill.name} (general knowledge)`;
  if (context.startsWith("architecture knowledge"))
    return `${skill.name} (architecture knowledge)`;
  if (context.startsWith("applied via"))
    return `${skill.name} (${skill.whereUsed.toLowerCase()})`;
  return skill.name;
}
function keywordScore(skill: VerifiedSkill, description: string) {
  const normalized = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9+#]+/g, " ")
      .trim();
  const words = ` ${normalized(description)} `;
  return (
    evidenceScore(skill.name, description) +
    (skill.name
      .split(/\s*\/\s*/)
      .some((name) =>
        words.includes(` ${normalized(name.replace(/\s*\(.*\)/, ""))} `),
      )
      ? 3
      : 0)
  );
}
export function coreCompetencies(skills: VerifiedSkill[], description: string) {
  return competencyGroups
    .map((group) => {
      const eligible = skills.filter((s) =>
        group.categories.includes(s.category),
      );
      const ranked = eligible
        .map((skill, index) => ({
          skill,
          index,
          score: keywordScore(skill, description),
        }))
        .sort((a, b) => b.score - a.score || a.index - b.index);
      return {
        label: group.label,
        skills: ranked
          .slice(0, group.limit)
          .map((s) => ({ ...s.skill, display: qualifiedSkill(s.skill) })),
        score: ranked.reduce((n, s) => n + s.score, 0),
      };
    })
    .filter((g) => g.skills.length)
    .sort((a, b) => b.score - a.score);
}
export function professionalSummary(
  profile: CandidateProfile,
  title: string,
  description: string,
) {
  const roles = profile.roles;
  const has = (company: string) => roles.some((r) => r.company === company);
  const track = matchJob(title, description).track;
  // Each sentence is a synthesis of the accompanying role bullets, not new
  // company research or a claim to have the target employer's required stack.
  const opening =
    "Software engineer with professional experience since March 2018 across healthcare, banking, education, and civic technology.";
  const focuses: Record<string, string> = {
    Frontend:
      "Frontend work includes a Vue.js-to-React clinical-data product migration, reusable React and Radix UI design systems, performance optimization, and automated testing.",
    "Full-stack":
      "Experience spans React and Next.js interfaces, NodeJS REST APIs and database modelling, payment functionality with Stripe Connect, and full-stack RAG applications.",
    Backend:
      "Backend and data work includes NodeJS REST APIs, MongoDB data models, a NestJS API and document ingestion pipeline, and PostgreSQL with Prisma and pgvector.",
    "Applied AI":
      "AI work includes a full-stack Next.js RAG widget and a multi-agent budget-analysis platform with Mastra, LangGraph, hybrid retrieval, vector search, reranking, and LLM observability.",
    Automation:
      "Automation work includes CI/CD pipeline restructuring, automated deployment and Playwright testing, document ingestion, and multi-agent routing with Mastra and LangGraph.",
  };
  const sentences = [opening, focuses[track] ?? focuses["Full-stack"]];
  if (has("OurNigeria"))
    sentences.push(
      "As Senior Engineer on OurNigeria, built a six-application platform for analysing 700+ budget documents across 37 states.",
    );
  if (has("Genentech (Roche)") && has("Founders Lair"))
    sentences.push(
      "Mentored developers and interns, established testing and delivery practices, and worked across product, frontend, and backend teams.",
    );
  return sentences.join(" ");
}
