import { isHiringSystem } from "./senders";
import type {
  CardState,
  Classification,
  Decision,
  MailCategory,
  MatchResult,
  RawMail,
} from "./types";

export const stageRank: Record<string, number> = {
  submitted: 1,
  response: 2,
  assessment: 3,
  interview: 4,
  offer: 5,
};
export const categoryStatus: Partial<Record<MailCategory, string>> = {
  rejection: "rejected",
  assessment: "assessment",
  interview: "interview",
  offer: "offer",
  recruiter_question: "response",
};
const freshMs = 14 * 86_400_000;
const review = (reason: string): Decision => ({ action: "review", reason });
const attach = (reason: string): Decision => ({ action: "attach", reason });
const ignore = (reason: string): Decision => ({ action: "ignore", reason });
const words: Record<MailCategory, string> = {
  confirmation: "receipt",
  rejection: "rejection",
  assessment: "assessment",
  interview: "interview invitation",
  offer: "offer",
  recruiter_question: "question from the recruiter",
  notice: "notice",
  unrelated: "unrelated email",
};
const inWords = (category: string) =>
  words[category as MailCategory] ?? category.replace(/_/g, " ");
const split = " vs ai:";
// On a split verdict `category` is the rules' reading and Claude's follows the marker.
const differs = ({ category, decidedBy }: Classification) =>
  `The rules and Claude read this email differently (${words[category]} vs ${inWords(decidedBy.slice(decidedBy.indexOf(split) + split.length).trim())})`;
const fromRules = (decidedBy: string) =>
  decidedBy !== "ai" && !decidedBy.includes(split);

type Input = {
  mail: RawMail;
  classification: Classification;
  match: MatchResult;
  card: CardState | null;
  now: Date;
};

// True when the decision would change or create a card on a verdict the two readers
// have not agreed on. A plain receipt from a hiring system that states the role is let
// through on the rules alone, so the history import can create those cards without Claude.
function held({ mail, classification }: Input, decision: Decision) {
  if (decision.action !== "update" && decision.action !== "create")
    return false;
  if (classification.agreed === true) return false;
  return !(
    decision.action === "create" &&
    classification.category === "confirmation" &&
    classification.confidence === "high" &&
    fromRules(classification.decidedBy) &&
    isHiringSystem(mail.fromAddress) &&
    !!classification.role?.trim()
  );
}

export function decide(input: Input): Decision {
  const decision = plan(input);
  if (!held(input, decision)) return decision;
  const { category, decidedBy } = input.classification;
  const article = /^[aeiou]/.test(words[category]) ? "an" : "a";
  if (decidedBy.includes(split)) return review(differs(input.classification));
  return review(
    decidedBy === "ai"
      ? `Only Claude read this as ${article} ${words[category]}; the rules could not confirm it`
      : `Only the rules read this as ${article} ${words[category]}; Claude has not confirmed it`,
  );
}

// True for a receipt only the rules have read that would change or create a card once
// Claude agrees. The pipeline asks Claude about just these.
export function needsSecondReader(input: Input): boolean {
  const { category, agreed, decidedBy } = input.classification;
  return (
    category === "confirmation" &&
    agreed === undefined &&
    fromRules(decidedBy) &&
    held(input, plan(input))
  );
}

// The decision an agreed verdict would get.
function plan(input: Input): Decision {
  const { mail, classification, match, card, now } = input;
  const { category, confidence, decidedBy } = classification;
  const name = category.replace("_", " ");
  if (mail.fromMe) return ignore("Sent by you");
  if (category === "unrelated" && confidence !== "low")
    return ignore("Not about an application");
  if (category === "notice" && confidence === "high")
    return ignore("Notice with no effect on an application");
  if (category === "notice" && confidence === "medium")
    return review("Looks like a notice, but it may hide a real outcome");
  if (confidence === "low")
    return review(
      decidedBy === "none"
        ? "Could not be classified (decided by none)"
        : decidedBy.includes(split)
          ? differs(classification)
          : `Low confidence ${name} verdict (decided by ${decidedBy})`,
    );
  if (match.kind === "ambiguous")
    return review(`Several applications could match: ${match.reason}`);
  if (match.kind === "unique" && match.corroborated === false)
    return review("The sender does not confirm the company");
  const target = categoryStatus[category];
  // Only stage mail carries a next step, and only while it is recent enough to act on.
  const carries =
    target !== undefined &&
    category !== "rejection" &&
    now.getTime() - mail.receivedAt.getTime() < freshMs;
  const step = {
    nextStep: carries ? classification.nextStep : null,
    nextStepDueAt: carries ? classification.deadline : null,
  };
  if (match.kind === "none") {
    const status = category === "confirmation" ? "submitted" : target;
    if (confidence !== "high" || !status)
      return review(
        `No matching application, and the ${name} verdict is not certain`,
      );
    if (!isHiringSystem(mail.fromAddress) && !classification.role?.trim())
      return review(
        "No matching application, and the mail states no role and is not from a hiring system",
      );
    return {
      action: "create",
      status,
      submittedAt: category === "confirmation" ? mail.receivedAt : null,
      ...step,
      reason: `No matching application, new card from this ${name} mail`,
    };
  }
  if (!card) return review("The matched application could not be read");
  if (card.status === "withdrawn" || card.status === "skipped")
    return review(`The card is ${card.status}, so mail does not change it`);
  if (card.status === "queued" || card.status === "prepared")
    return category === "confirmation" && confidence === "high"
      ? {
          action: "update",
          status: "submitted",
          submittedAt: mail.receivedAt,
          ...step,
          reason: "Confirmation of receipt, card marked as submitted",
        }
      : review("The card was never recorded as submitted");
  if (
    category !== "confirmation" &&
    card.submittedAt &&
    mail.receivedAt.getTime() < card.submittedAt.getTime()
  )
    return review("The email is older than the recorded submission");
  if (card.status === "rejected")
    return category === "rejection" || category === "confirmation"
      ? attach("Card is already rejected")
      : review("Positive mail after a rejection");
  const rank = stageRank[card.status];
  if (rank === undefined)
    return review(
      `The card has the status ${card.status}, which mail cannot change`,
    );
  if (category === "rejection")
    return confidence === "high"
      ? {
          action: "update",
          status: "rejected",
          submittedAt: card.submittedAt,
          ...step,
          reason: "Rejection from a confident verdict and a unique match",
        }
      : review("The rejection is not certain enough to close the card");
  if (category === "confirmation")
    return attach("Receipt for a card already submitted");
  if (!target || confidence !== "high")
    return review(
      `The ${name} verdict is not certain enough to change the card`,
    );
  if (stageRank[target] > rank)
    return {
      action: "update",
      status: target,
      submittedAt: card.submittedAt,
      ...step,
      reason: `Moved from ${card.status} to ${target} by this ${name} mail`,
    };
  if (step.nextStep?.trim())
    return stageRank[target] === rank
      ? {
          action: "update",
          status: card.status,
          submittedAt: card.submittedAt,
          ...step,
          reason: `Card stays at ${card.status}, next step replaced by this ${name} mail`,
        }
      : // Replacing the step here would wipe a dated step of the later stage.
        review(`An earlier-stage email asks for something: ${words[category]}`);
  return attach(`Card is already at ${card.status}, nothing to change`);
}
