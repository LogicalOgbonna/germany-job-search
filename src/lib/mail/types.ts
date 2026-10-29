export const mailCategories = [
  "confirmation",
  "rejection",
  "assessment",
  "interview",
  "offer",
  "recruiter_question",
  "notice",
  "unrelated",
] as const;
export type MailCategory = (typeof mailCategories)[number];
export type Confidence = "high" | "medium" | "low";

// One Gmail message, already reduced to what the pipeline needs.
export type RawMail = {
  gmailId: string;
  threadId: string;
  fromAddress: string; // lower case, no display name
  fromName: string; // display name, "" when absent
  subject: string;
  receivedAt: Date;
  bodyText: string; // plain text, at most 20,000 characters
  fromMe: boolean;
  // Bulk mail by its headers (List-Unsubscribe, List-Id, Precedence: bulk/list). Absent means unknown.
  bulk?: boolean;
  // Text of a text/calendar (ICS) part when the message has one. Not stored in the database.
  calendar?: string;
};

export type Classification = {
  category: MailCategory;
  confidence: Confidence;
  decidedBy: string; // rule id, "ai", or "none" when nothing could decide
  evidenceQuote: string | null; // sentence from the mail the verdict rests on
  company: string | null;
  role: string | null;
  nextStep: string | null; // one sentence, only for assessment/interview/recruiter_question/offer
  deadline: Date | null;
  // True only when the rules and the Claude reader, each on its own, reached this same category.
  // A card is changed or created automatically only on an agreed verdict (see decide.ts).
  agreed?: boolean;
};

// Returns null when the service is unavailable or the reply is unusable.
export type AiClassifier = (mail: RawMail) => Promise<Classification | null>;

export interface MailClient {
  // Gmail search query in, message references out (all pages).
  list(query: string): Promise<{ id: string; threadId: string }[]>;
  get(id: string): Promise<RawMail>;
}

// What the matcher knows about one application on the board.
export type BoardApplication = {
  id: string;
  company: string;
  title: string;
  status: string;
  origin: string; // "jobdesk" or "email"
  submittedAt: Date | null;
  // When the card was added to the board. Mail older than an unsubmitted card cannot be about it.
  createdAt?: Date;
  threadIds: string[]; // Gmail threads already linked to it
};

export type MatchResult =
  // `corroborated: false` means the company is named only in the mail's text, by a sender
  // that is neither a hiring system nor the employer. Such a match never changes a card on its own.
  | {
      kind: "unique";
      applicationId: string;
      reason: string;
      corroborated?: boolean;
    }
  | { kind: "ambiguous"; candidateIds: string[]; reason: string }
  | { kind: "none"; reason: string };

export type CardState = {
  status: string;
  submittedAt: Date | null;
  nextStep: string | null;
  nextStepDueAt: Date | null;
};

export type Decision =
  // Change the matched card. Fields not listed keep their value.
  | {
      action: "update";
      status: string;
      submittedAt: Date | null;
      nextStep: string | null;
      nextStepDueAt: Date | null;
      reason: string;
    }
  // Link the mail to the matched card's timeline without changing the card.
  | { action: "attach"; reason: string }
  // No card exists: create one from the email with this state.
  | {
      action: "create";
      status: string;
      submittedAt: Date | null;
      nextStep: string | null;
      nextStepDueAt: Date | null;
      reason: string;
    }
  | { action: "review"; reason: string }
  | { action: "ignore"; reason: string };

// "proposed" is a dry-run row whose decision has not been applied yet.
export type MailState =
  "applied" | "attached" | "needs_review" | "ignored" | "proposed";
