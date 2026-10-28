import { classifyByRules, extractDetails } from "./rules";
import { isHiringSystem } from "./senders";
import type {
  AiClassifier,
  Classification,
  MailCategory,
  RawMail,
} from "./types";

// The categories that move a card along. One reader is never enough for these.
const stages = new Set<MailCategory>([
  "rejection",
  "assessment",
  "interview",
  "offer",
  "recruiter_question",
]);

// A failing or missing second reader is the same as one with no opinion.
async function ask(ai: AiClassifier | null | undefined, mail: RawMail) {
  try {
    return ai ? await ai(mail) : null;
  } catch {
    return null;
  }
}

// The rules' verdict after Claude has read the same mail on its own.
function settle(
  rule: Classification,
  second: Classification | null,
): Classification {
  if (!second) return { ...rule, agreed: false };
  if (second.category !== rule.category || second.confidence !== "high")
    return {
      ...rule,
      confidence: "medium",
      agreed: false,
      decidedBy: `${rule.decidedBy} vs ai:${second.category}`,
    };
  return {
    ...rule,
    confidence: "high",
    agreed: true,
    decidedBy: `${rule.decidedBy}+ai`,
    company: rule.company ?? second.company,
    role: rule.role ?? second.role,
    nextStep: rule.nextStep ?? second.nextStep,
    deadline: rule.deadline ?? second.deadline,
  };
}

// Rules first. A verdict that would move a card is put to `ai` as a second,
// independent reader; mail the rules cannot settle goes to `ai` alone and is
// then never agreed. Notices, unrelated mail and receipts are not sent to `ai`
// here. Never throws: an AI failure counts as no second opinion.
export async function classify(
  mail: RawMail,
  ai?: AiClassifier | null,
  options: { secondOpinion?: boolean } = {},
): Promise<Classification> {
  const rule = classifyByRules(mail);
  if (rule && !stages.has(rule.category)) return rule;
  if (rule)
    return settle(
      rule,
      options.secondOpinion === false ? null : await ask(ai, mail),
    );
  const { company, role } = extractDetails(mail, "unrelated");
  const second = await ask(ai, mail);
  if (!second)
    return {
      category: "unrelated",
      confidence: "low",
      decidedBy: "none",
      evidenceQuote: null,
      company,
      role,
      nextStep: null,
      deadline: null,
    };
  // Bulk mail from outside a hiring system is marketing until a person says otherwise.
  const capped =
    mail.bulk === true &&
    !isHiringSystem(mail.fromAddress) &&
    stages.has(second.category) &&
    second.confidence === "high";
  return {
    ...second,
    confidence: capped ? "medium" : second.confidence,
    agreed: false,
    company: second.company ?? company,
    role: second.role ?? role,
  };
}

// Second opinion on demand for a rules verdict that has not been checked yet
// (the pipeline calls this for a receipt that would create or change a card).
export async function confirm(
  mail: RawMail,
  verdict: Classification,
  ai: AiClassifier | null,
): Promise<Classification> {
  if (verdict.agreed !== undefined || !ai)
    return { ...verdict, agreed: verdict.agreed ?? false };
  return settle(verdict, await ask(ai, mail));
}
