export const interviewStages = [
  "talent",
  "technical",
  "assessment",
  "final",
  "other",
] as const;
export type InterviewStage = (typeof interviewStages)[number];
export type Interviewer = {
  name: string;
  role?: string;
  email?: string;
  linkedin?: string;
};

// What the email parser can read from one interview confirmation. Null fields were not stated.
export type ParsedInterview = {
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string | null; // IANA name, e.g. "Europe/Berlin"
  meetingUrl: string | null; // Google Meet, Zoom, Teams link
  eventUrl: string | null; // the hiring system's event page
  rescheduleUrl: string | null;
  interviewers: Interviewer[];
  title: string | null; // e.g. "Video interview"
  provider: string; // "recruitee", "calendly", "google-calendar", "greenhouse", "ashby", "lever", "goodtime", "ics", "unknown"
  cancelled: boolean; // the mail cancels the event
  // For a reschedule that states both times ("moved from X to Y"): the old start. startsAt is the new one.
  previousStartsAt?: Date | null;
};

// The generated sheet, stored in Interview.prep. Every list may be empty.
export type PrepSource = { url: string; title: string };
export type PrepFact = { text: string; sources: PrepSource[] };
export type PrepEvidence = {
  claim: string; // how to say it for this role
  quote: string; // verbatim line from cv/experience.md or cv/base_experience.md
  role: string; // "Genentech (Roche), Frontend Engineer", etc. Exact titles.
};
export type PrepQuestion = {
  question: string;
  outline: string[]; // bullet points
  evidence: PrepEvidence[];
};
export type PrepSheet = {
  version: 1;
  stage: InterviewStage;
  generatedAt: string; // ISO
  model: string;
  logistics: string[];
  company: {
    summary: string;
    facts: PrepFact[];
    reasons: string[]; // genuine, specific reasons this company fits
  };
  role: {
    responsibilities: string[];
    challenges: string[];
    mustHave: string[];
    niceToHave: string[];
  };
  matches: PrepEvidence[];
  transferable: PrepEvidence[];
  gaps: { gap: string; framing: string }[];
  scripts: { whyCompany: string; lookingFor: string; aboutMe: string };
  questions: PrepQuestion[];
  askThem: string[];
  checklist: string[];
  // Filled by the honesty check, not by the model.
  warnings: string[]; // e.g. 'The number "5 years" in "Tell me about yourself" does not appear in your experience files.'
  dropped: string[]; // items removed because their quote was not found
};

// One practice answer, stored in PracticeSession.turns.
export type PracticeTurn = {
  question: string;
  followUp: boolean; // true when the interviewer asked a follow-up to the previous answer
  transcript: string;
  seconds: number;
  words: number;
  fillerWords: Record<string, number>;
  feedback: {
    structure: string;
    specificity: string;
    evidence: string;
    length: string;
    unsupported: { claim: string; checked: string }[]; // claims the experience files do not support
    rating: 1 | 2 | 3 | 4 | 5;
  } | null;
};
export type PracticeSummary = {
  wentWell: string[];
  improve: string[]; // exactly three
  ratings: { question: string; rating: number }[];
};
