import test from "node:test";
import assert from "node:assert/strict";
import {
  categoryStatus,
  decide,
  needsSecondReader,
  stageRank,
} from "../src/lib/mail/decide";
import type {
  CardState,
  Classification,
  Decision,
  MatchResult,
  RawMail,
} from "../src/lib/mail/types";

const day = 86_400_000;
const now = new Date("2026-10-13T12:00:00Z");
const received = new Date("2026-10-12T09:00:00Z");
const applied = new Date("2026-08-01T08:00:00Z");
const deadline = new Date("2026-10-21T00:00:00Z");
const ago = (days: number) => ({
  receivedAt: new Date(now.getTime() - days * day),
});
const unique: MatchResult = {
  kind: "unique",
  applicationId: "app-1",
  reason: "company",
};
const unconfirmed: MatchResult = { ...unique, corroborated: false };
const none: MatchResult = { kind: "none", reason: "no application at Acme" };
const ambiguous: MatchResult = {
  kind: "ambiguous",
  candidateIds: ["app-1", "app-2"],
  reason: "2 applications at Acme, role not named",
};
const gmail = { fromAddress: "someone@gmail.com" };
const employer = { fromAddress: "jobs@acme.de" };
const stages = [
  "assessment",
  "interview",
  "offer",
  "recruiter_question",
] as const;
const mail = (over: Partial<RawMail> = {}): RawMail => ({
  gmailId: "m1",
  threadId: "t1",
  fromAddress: "no-reply@ashbyhq.com",
  fromName: "Acme Hiring",
  subject: "Your application to Acme",
  receivedAt: received,
  bodyText: "",
  fromMe: false,
  ...over,
});
const verdict = (
  category: Classification["category"],
  over: Partial<Classification> = {},
): Classification => ({
  category,
  confidence: "high",
  decidedBy: `${category}.rule`,
  evidenceQuote: null,
  company: "Acme",
  role: null,
  nextStep: null,
  deadline: null,
  agreed: true,
  ...over,
});
const card = (status: string, over: Partial<CardState> = {}): CardState => ({
  status,
  submittedAt: applied,
  nextStep: null,
  nextStepDueAt: null,
  ...over,
});
const run = (
  classification: Classification,
  match: MatchResult = unique,
  state: CardState | null = null,
  over: Partial<RawMail> = {},
) =>
  decide({
    mail: mail(over),
    classification,
    match,
    card: match.kind === "unique" ? state : null,
    now,
  });
const second = (over: Partial<Classification> = {}) =>
  verdict("interview", {
    nextStep: "Join the second interview",
    deadline,
    ...over,
  });
const booked = card("interview", {
  nextStep: "Pick a slot",
  nextStepDueAt: applied,
});

test("stage ranks and category targets follow the board order", () => {
  assert.deepEqual(stageRank, {
    submitted: 1,
    response: 2,
    assessment: 3,
    interview: 4,
    offer: 5,
  });
  assert.deepEqual(categoryStatus, {
    rejection: "rejected",
    assessment: "assessment",
    interview: "interview",
    offer: "offer",
    recruiter_question: "response",
  });
});

test("rule 1: mail the user sent is ignored whatever it was classified as", () => {
  const decision = run(verdict("interview"), unique, card("submitted"), {
    fromMe: true,
  });
  assert.equal(decision.action, "ignore");
});

test("rule 2: unrelated mail and certain notices are ignored", () => {
  assert.equal(run(verdict("unrelated"), none).action, "ignore");
  assert.equal(
    run(verdict("unrelated", { confidence: "medium" }), none).action,
    "ignore",
  );
  assert.equal(
    run(verdict("notice"), unique, card("submitted")).action,
    "ignore",
  );
  assert.equal(run(verdict("notice"), ambiguous).action, "ignore");
});

test("a medium notice goes to review", () => {
  for (const [match, state] of [
    [unique, card("submitted")],
    [none, null],
    [ambiguous, null],
  ] as const)
    assert.equal(
      run(verdict("notice", { confidence: "medium" }), match, state).action,
      "review",
      match.kind,
    );
});

test("rule 3: low confidence goes to review and names what decided", () => {
  const undecided = run(
    verdict("unrelated", { confidence: "low", decidedBy: "none" }),
    none,
  );
  assert.equal(undecided.action, "review");
  assert.match(undecided.reason, /none/);
  const guess = run(
    verdict("rejection", { confidence: "low", decidedBy: "ai" }),
    unique,
    card("submitted"),
  );
  assert.equal(guess.action, "review");
  assert.match(guess.reason, /\bai\b/);
  assert.equal(
    run(verdict("notice", { confidence: "low" }), none).action,
    "review",
  );
});

test("rule 4: an ambiguous match goes to review and says why", () => {
  for (const category of ["rejection", "confirmation", "interview"] as const) {
    const decision = run(verdict(category), ambiguous);
    assert.equal(decision.action, "review", category);
    assert.ok(decision.reason.includes(ambiguous.reason), category);
  }
});

test("rule 5: a match the sender does not confirm never acts on a card", () => {
  for (const category of ["rejection", "confirmation", ...stages] as const)
    for (const status of ["queued", "submitted", "interview", "rejected"]) {
      const decision = run(verdict(category), unconfirmed, card(status));
      assert.equal(decision.action, "review", `${category} on ${status}`);
      assert.equal(
        decision.reason,
        "The sender does not confirm the company",
        `${category} on ${status}`,
      );
    }
  for (const match of [unique, { ...unique, corroborated: true }] as const)
    assert.equal(
      run(verdict("rejection"), match, card("submitted")).action,
      "update",
    );
});

test("an uncorroborated unique rejection goes to review", () => {
  assert.equal(
    run(verdict("rejection"), unconfirmed, card("submitted")).action,
    "review",
  );
});

test("an uncorroborated unique confirmation goes to review", () => {
  assert.equal(
    run(verdict("confirmation"), unconfirmed, card("prepared")).action,
    "review",
  );
  assert.equal(
    run(verdict("confirmation"), unconfirmed, card("submitted")).action,
    "review",
  );
});

test("rule 6: no match creates a card with the state the mail implies", () => {
  const confirmed = run(verdict("confirmation"), none);
  assert.ok(confirmed.action === "create");
  assert.equal(confirmed.status, "submitted");
  assert.equal(confirmed.submittedAt, received);
  assert.equal(confirmed.nextStep, null);
  assert.equal(confirmed.nextStepDueAt, null);
  const rejected = run(verdict("rejection"), none);
  assert.ok(rejected.action === "create");
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.submittedAt, null);
  const invited = run(
    verdict("interview", { nextStep: "Pick a slot", deadline }),
    none,
  );
  assert.ok(invited.action === "create");
  assert.equal(invited.status, "interview");
  assert.equal(invited.submittedAt, null);
  assert.equal(invited.nextStep, "Pick a slot");
  assert.equal(invited.nextStepDueAt, deadline);
  const asked = run(verdict("recruiter_question"), none);
  assert.ok(asked.action === "create");
  assert.equal(asked.status, "response");
  for (const sender of [{}, employer])
    assert.equal(
      run(
        verdict("rejection", { confidence: "medium", role: "Engineer" }),
        none,
        null,
        sender,
      ).action,
      "review",
    );
});

test("no match, high confidence, a gmail sender and no role goes to review", () => {
  for (const category of ["confirmation", "rejection", "interview"] as const)
    assert.equal(
      run(verdict(category), none, null, gmail).action,
      "review",
      category,
    );
  assert.equal(
    run(verdict("rejection", { role: " " }), none, null, gmail).action,
    "review",
  );
});

test("no match, high confidence and a hiring-system sender creates a card without a role", () => {
  for (const fromAddress of [
    "no-reply@us.greenhouse-mail.io",
    "acme-jobs@m.personio.de",
    "jobs-noreply@linkedin.com",
  ]) {
    const decision = run(verdict("rejection"), none, null, { fromAddress });
    assert.ok(decision.action === "create", fromAddress);
    assert.equal(decision.status, "rejected");
  }
});

test("no match, high confidence and an employer sender creates a card when the role is stated", () => {
  const decision = run(
    verdict("confirmation", { role: "Senior Frontend Engineer" }),
    none,
    null,
    employer,
  );
  assert.ok(decision.action === "create");
  assert.equal(decision.status, "submitted");
  assert.equal(decision.submittedAt, received);
  assert.equal(
    run(verdict("confirmation"), none, null, employer).action,
    "review",
  );
});

test("rule 7: withdrawn and skipped cards are never changed by mail", () => {
  for (const status of ["withdrawn", "skipped"])
    for (const category of ["rejection", "confirmation", "interview"] as const)
      assert.equal(
        run(verdict(category), unique, card(status)).action,
        "review",
        `${category} on ${status}`,
      );
});

test("an on-hold card is never moved by mail; every email waits for review", () => {
  for (const category of [
    "rejection",
    "confirmation",
    "interview",
    "offer",
  ] as const)
    assert.equal(
      run(verdict(category), unique, card("on_hold")).action,
      "review",
      category,
    );
});

test("rule 8: only a certain confirmation changes a card never recorded as submitted", () => {
  for (const status of ["queued", "prepared"]) {
    const state = card(status, { submittedAt: null });
    const decision = run(verdict("confirmation"), unique, state);
    assert.ok(decision.action === "update", status);
    assert.equal(decision.status, "submitted");
    assert.equal(decision.submittedAt, received);
    const others = [
      verdict("confirmation", { confidence: "medium" }),
      verdict("rejection"),
      verdict("rejection", { confidence: "medium" }),
      ...stages.map((category) => verdict(category)),
    ];
    for (const classification of others) {
      const label = `${classification.confidence} ${classification.category} on ${status}`;
      const other = run(classification, unique, state);
      assert.equal(other.action, "review", label);
      assert.equal(
        other.reason,
        "The card was never recorded as submitted",
        label,
      );
    }
  }
});

test("a rejection on a queued card goes to review", () => {
  assert.equal(
    run(verdict("rejection"), unique, card("queued", { submittedAt: null }))
      .action,
    "review",
  );
});

test("a rejection on a prepared card goes to review", () => {
  assert.equal(
    run(verdict("rejection"), unique, card("prepared", { submittedAt: null }))
      .action,
    "review",
  );
});

test("an old interview mail on a queued card goes to review", () => {
  assert.equal(
    run(
      verdict("interview", { nextStep: "Pick a slot", deadline }),
      unique,
      card("queued", { submittedAt: null }),
      ago(30),
    ).action,
    "review",
  );
});

test("rule 9: a rejected card stays closed", () => {
  for (const confidence of ["high", "medium"] as const)
    for (const category of ["rejection", "confirmation"] as const)
      assert.equal(
        run(verdict(category, { confidence }), unique, card("rejected")).action,
        "attach",
        `${confidence} ${category}`,
      );
  for (const category of stages) {
    const decision = run(verdict(category), unique, card("rejected"));
    assert.equal(decision.action, "review", category);
    assert.match(decision.reason, /^Positive mail after a rejection/);
  }
});

test("rule 10: a rejection applies only with high confidence", () => {
  for (const status of [
    "submitted",
    "response",
    "assessment",
    "interview",
    "offer",
  ]) {
    const decision = run(verdict("rejection"), unique, card(status));
    assert.ok(decision.action === "update", status);
    assert.equal(decision.status, "rejected");
    assert.equal(
      run(verdict("rejection", { confidence: "medium" }), unique, card(status))
        .action,
      "review",
      `medium on ${status}`,
    );
  }
});

test("a high-confidence rejection on a submitted card rejects it and clears the next step", () => {
  const decision = run(
    verdict("rejection", { nextStep: "Reply to the recruiter", deadline }),
    unique,
    card("submitted", { nextStep: "Send references", nextStepDueAt: deadline }),
  );
  assert.ok(decision.action === "update");
  assert.equal(decision.status, "rejected");
  assert.equal(decision.submittedAt, applied);
  assert.equal(decision.nextStep, null);
  assert.equal(decision.nextStepDueAt, null);
});

test("rule 11: a confirmation on a submitted or later card only attaches", () => {
  for (const status of [
    "submitted",
    "response",
    "assessment",
    "interview",
    "offer",
  ])
    for (const confidence of ["high", "medium"] as const)
      assert.equal(
        run(verdict("confirmation", { confidence }), unique, card(status))
          .action,
        "attach",
        `${confidence} on ${status}`,
      );
});

test("rule 12: stage mail moves a card forward only", () => {
  const forward = [
    ["recruiter_question", "submitted", "response"],
    ["assessment", "submitted", "assessment"],
    ["assessment", "response", "assessment"],
    ["interview", "assessment", "interview"],
    ["offer", "interview", "offer"],
  ] as const;
  for (const [category, from, to] of forward) {
    const decision = run(verdict(category), unique, card(from));
    assert.ok(decision.action === "update", `${category} on ${from}`);
    assert.equal(decision.status, to);
  }
  for (const category of stages)
    assert.equal(
      run(
        verdict(category, { confidence: "medium" }),
        unique,
        card("submitted"),
      ).action,
      "review",
      category,
    );
  assert.equal(
    run(verdict("recruiter_question"), unique, card("offer")).action,
    "attach",
  );
});

const question = (over: Partial<Classification> = {}) =>
  verdict("recruiter_question", {
    nextStep: "Send your salary range",
    deadline,
    ...over,
  });

test("an assessment mail on an interview card never moves it back", () => {
  assert.equal(
    run(verdict("assessment"), unique, card("interview")).action,
    "attach",
  );
  const task = run(
    verdict("assessment", { nextStep: "Finish the task", deadline }),
    unique,
    booked,
  );
  assert.equal(task.action, "review");
  assert.equal(
    task.reason,
    "An earlier-stage email asks for something: assessment",
  );
});

test("a lower-rank question with a next step on an interview card goes to review", () => {
  for (const state of [booked, card("offer", { nextStep: "Sign" })])
    for (const agreed of [true, false, undefined]) {
      const decision = run(question({ agreed }), unique, state, ago(2));
      assert.equal(decision.action, "review", `${state.status} ${agreed}`);
      assert.equal(
        decision.reason,
        "An earlier-stage email asks for something: question from the recruiter",
      );
    }
});

test("a lower-rank question on old mail or without a next step attaches", () => {
  for (const state of [booked, card("offer")]) {
    assert.equal(run(question(), unique, state, ago(30)).action, "attach");
    assert.equal(run(question(), unique, state, ago(14)).action, "attach");
    for (const nextStep of [null, " "])
      assert.equal(
        run(question({ nextStep, agreed: undefined }), unique, state, ago(2))
          .action,
        "attach",
        state.status,
      );
  }
  assert.equal(
    run(question({ confidence: "medium" }), unique, booked, ago(2)).action,
    "review",
  );
});

test("an equal-rank refresh needs an agreed verdict", () => {
  const agreed = run(second({ agreed: true }), unique, booked, ago(2));
  assert.ok(agreed.action === "update");
  assert.equal(agreed.status, "interview");
  assert.equal(agreed.nextStep, "Join the second interview");
  for (const flag of [false, undefined])
    assert.equal(
      run(second({ agreed: flag }), unique, booked, ago(2)).action,
      "review",
    );
});

test("a second interview mail 2 days old refreshes the next step on an interview card", () => {
  const decision = run(second(), unique, booked, ago(2));
  assert.deepEqual(
    { ...decision, reason: "" },
    {
      action: "update",
      status: "interview",
      submittedAt: applied,
      nextStep: "Join the second interview",
      nextStepDueAt: deadline,
      reason: "",
    },
  );
  const undated = run(second({ deadline: null }), unique, booked, ago(2));
  assert.ok(undated.action === "update");
  assert.equal(undated.nextStepDueAt, null);
});

test("a second interview mail 30 days old attaches", () => {
  assert.equal(run(second(), unique, booked, ago(30)).action, "attach");
  assert.equal(run(second(), unique, booked, ago(14)).action, "attach");
});

test("a second interview mail without a next step attaches", () => {
  assert.equal(
    run(second({ nextStep: null }), unique, booked, ago(2)).action,
    "attach",
  );
  assert.equal(
    run(second({ nextStep: " " }), unique, booked, ago(2)).action,
    "attach",
  );
  assert.equal(
    run(second({ confidence: "medium" }), unique, booked, ago(2)).action,
    "review",
  );
});

test("rule 13: next step and deadline come from mail less than 14 days old", () => {
  const task = verdict("assessment", {
    nextStep: "Finish the take-home task",
    deadline,
  });
  const edge = (age: number) =>
    run(task, unique, card("submitted", { nextStep: "Old step" }), {
      receivedAt: new Date(now.getTime() - age),
    });
  const inside = edge(14 * day - 1);
  assert.ok(inside.action === "update");
  assert.equal(inside.nextStep, "Finish the take-home task");
  assert.equal(inside.nextStepDueAt, deadline);
  const outside = edge(14 * day);
  assert.ok(outside.action === "update");
  assert.equal(outside.status, "assessment");
  assert.equal(outside.nextStep, null);
  assert.equal(outside.nextStepDueAt, null);
  const created = run(
    verdict("offer", { nextStep: "Sign the contract", deadline }),
    none,
    null,
    ago(60),
  );
  assert.ok(created.action === "create");
  assert.equal(created.status, "offer");
  assert.equal(created.nextStep, null);
  assert.equal(created.nextStepDueAt, null);
});

test("rule 13: a confirmation or rejection never writes a next step", () => {
  const stray = { nextStep: "Wait for a reply", deadline };
  const decisions = [
    run(verdict("confirmation", stray), unique, card("prepared")),
    run(verdict("confirmation", stray), none),
    run(verdict("rejection", stray), none),
    run(verdict("rejection", stray), unique, card("interview")),
  ];
  for (const decision of decisions) {
    assert.ok(decision.action === "update" || decision.action === "create");
    assert.equal(decision.nextStep, null);
    assert.equal(decision.nextStepDueAt, null);
  }
});

test("an interview mail 30 days old moves the stage but sets no next step", () => {
  const decision = run(
    verdict("interview", { nextStep: "Pick a slot", deadline }),
    unique,
    card("submitted", { nextStep: "Old step", nextStepDueAt: applied }),
    ago(30),
  );
  assert.ok(decision.action === "update");
  assert.equal(decision.status, "interview");
  assert.equal(decision.nextStep, null);
  assert.equal(decision.nextStepDueAt, null);
});

test("rule 14: an update keeps the card's submission date", () => {
  const moved = run(verdict("interview"), unique, card("submitted"));
  assert.ok(moved.action === "update");
  assert.equal(moved.submittedAt, applied);
  const undated = run(
    verdict("offer"),
    unique,
    card("interview", { submittedAt: null }),
  );
  assert.ok(undated.action === "update");
  assert.equal(undated.submittedAt, null);
  const closed = run(verdict("rejection"), unique, card("offer"));
  assert.ok(closed.action === "update");
  assert.equal(closed.submittedAt, applied);
});

test("a unique match without a card state goes to review", () => {
  for (const category of ["rejection", "confirmation", "interview"] as const)
    assert.equal(run(verdict(category), unique, null).action, "review");
});

test("mail on a card with an unknown status goes to review", () => {
  for (const category of ["rejection", "confirmation", "interview"] as const)
    assert.equal(
      run(verdict(category), unique, card("archived")).action,
      "review",
      category,
    );
});

const alone = { agreed: undefined };
const receipt = (over: Partial<Classification> = {}) =>
  verdict("confirmation", {
    role: "Senior Frontend Engineer",
    ...alone,
    ...over,
  });

test("the agreement gate holds back every update and create", () => {
  for (const agreed of [false, undefined]) {
    const cases: Decision[] = [
      run(verdict("rejection", { agreed }), unique, card("submitted")),
      run(verdict("interview", { agreed }), unique, card("submitted")),
      run(verdict("offer", { agreed }), unique, card("interview")),
      run(verdict("confirmation", { agreed }), unique, card("prepared")),
      run(verdict("confirmation", { agreed }), unique, card("queued")),
      run(verdict("rejection", { agreed }), none),
      run(verdict("interview", { agreed, role: "Engineer" }), none),
      run(verdict("confirmation", { agreed }), none),
    ];
    for (const [index, decision] of cases.entries())
      assert.equal(decision.action, "review", `case ${index} agreed=${agreed}`);
  }
  const submitted = run(verdict("confirmation"), unique, card("prepared"));
  assert.ok(submitted.action === "update");
  assert.equal(submitted.status, "submitted");
});

test("the gate says which reader stands alone", () => {
  const on = (over: Partial<Classification>, category = "rejection" as const) =>
    run(verdict(category, { ...alone, ...over }), unique, card("submitted"))
      .reason;
  assert.equal(
    on({ decidedBy: "regret" }),
    "Only the rules read this as a rejection; Claude has not confirmed it",
  );
  assert.equal(
    on({ decidedBy: "ai" }),
    "Only Claude read this as a rejection; the rules could not confirm it",
  );
  assert.equal(
    on({ decidedBy: "regret vs ai:interview", agreed: false }),
    "The rules and Claude read this email differently (rejection vs interview invitation)",
  );
  assert.equal(
    on({ decidedBy: "regret vs ai:recruiter_question", confidence: "low" }),
    "The rules and Claude read this email differently (rejection vs question from the recruiter)",
  );
  const words = [
    ["assessment", "an assessment"],
    ["interview", "an interview invitation"],
    ["offer", "an offer"],
    ["recruiter_question", "a question from the recruiter"],
  ] as const;
  for (const [category, phrase] of words)
    assert.equal(
      run(
        verdict(category, { ...alone, decidedBy: "ai" }),
        unique,
        card("submitted"),
      ).reason,
      `Only Claude read this as ${phrase}; the rules could not confirm it`,
    );
  assert.equal(
    run(verdict("confirmation", alone), unique, card("prepared")).reason,
    "Only the rules read this as a receipt; Claude has not confirmed it",
  );
});

test("attach and ignore decisions need no agreement", () => {
  for (const agreed of [false, undefined]) {
    const attached: Decision[] = [
      run(verdict("confirmation", { agreed }), unique, card("submitted")),
      run(verdict("confirmation", { agreed }), unique, card("interview")),
      run(verdict("assessment", { agreed }), unique, card("interview")),
      run(verdict("interview", { agreed }), unique, card("interview")),
      run(verdict("rejection", { agreed }), unique, card("rejected")),
      run(verdict("confirmation", { agreed }), unique, card("rejected")),
    ];
    for (const [index, decision] of attached.entries())
      assert.equal(decision.action, "attach", `case ${index} agreed=${agreed}`);
    assert.equal(run(verdict("notice", { agreed }), none).action, "ignore");
    assert.equal(run(verdict("unrelated", { agreed }), none).action, "ignore");
    assert.equal(
      run(verdict("interview", { agreed }), none, null, { fromMe: true })
        .action,
      "ignore",
    );
  }
});

test("a rule receipt from a hiring system that states the role creates a card without agreement", () => {
  const decision = run(receipt({ decidedBy: "received" }), none);
  assert.ok(decision.action === "create");
  assert.equal(decision.status, "submitted");
  assert.equal(decision.submittedAt, received);
  const held = [
    run(receipt({ role: null }), none),
    run(receipt({ role: " " }), none),
    run(receipt(), none, null, employer),
    run(receipt({ decidedBy: "ai" }), none),
    run(receipt({ decidedBy: "received vs ai:notice", agreed: false }), none),
    run(receipt({ confidence: "medium" }), none),
    run(verdict("rejection", { ...alone, role: "Engineer" }), none),
    run(receipt(), unique, card("prepared")),
  ];
  for (const [index, decision] of held.entries())
    assert.equal(decision.action, "review", `case ${index}`);
});

test("needsSecondReader picks the receipts that only wait for Claude", () => {
  const needs = (
    classification: Classification,
    match: MatchResult = none,
    state: CardState | null = null,
    over: Partial<RawMail> = {},
  ) =>
    needsSecondReader({
      mail: mail(over),
      classification,
      match,
      card: state,
      now,
    });
  assert.equal(needs(receipt({ role: null })), true);
  assert.equal(needs(receipt(), none, null, employer), true);
  assert.equal(needs(receipt(), unique, card("prepared")), true);
  assert.equal(needs(receipt(), unique, card("queued")), true);
  assert.equal(needs(receipt()), false);
  assert.equal(needs(receipt(), unique, card("submitted")), false);
  assert.equal(needs(receipt(), unique, card("rejected")), false);
  for (const agreed of [true, false]) {
    assert.equal(needs(receipt({ agreed, role: null })), false);
    assert.equal(needs(receipt({ agreed }), unique, card("prepared")), false);
  }
  for (const category of ["rejection", ...stages] as const) {
    assert.equal(needs(verdict(category, alone)), false, category);
    assert.equal(
      needs(verdict(category, alone), unique, card("submitted")),
      false,
      category,
    );
  }
  assert.equal(needs(receipt({ confidence: "medium", role: null })), false);
  assert.equal(needs(receipt({ role: null }), none, null, gmail), false);
  assert.equal(needs(receipt(), unconfirmed, card("prepared")), false);
  assert.equal(needs(receipt(), ambiguous), false);
  assert.equal(needs(receipt(), unique, card("withdrawn")), false);
  assert.equal(needs(receipt({ decidedBy: "ai", role: null })), false);
});

test("a rejection 20 hours before the recorded submission goes to review", () => {
  const early = { receivedAt: new Date(applied.getTime() - 20 * 3_600_000) };
  const decision = run(verdict("rejection"), unique, card("submitted"), early);
  assert.equal(decision.action, "review");
  assert.equal(
    decision.reason,
    "The email is older than the recorded submission",
  );
});

test("outcome mail older than the submission never acts, a receipt still attaches", () => {
  const early = { receivedAt: new Date(applied.getTime() - 1) };
  for (const category of ["rejection", ...stages] as const)
    for (const status of ["submitted", "interview", "rejected"]) {
      const decision = run(verdict(category), unique, card(status), early);
      assert.equal(decision.action, "review", `${category} on ${status}`);
    }
  assert.equal(
    run(verdict("confirmation"), unique, card("submitted"), early).action,
    "attach",
  );
  assert.equal(
    run(verdict("rejection"), unique, card("submitted"), {
      receivedAt: applied,
    }).action,
    "update",
  );
  assert.equal(
    run(
      verdict("rejection"),
      unique,
      card("submitted", { submittedAt: null }),
      early,
    ).action,
    "update",
  );
});

test("every review reason reads as a sentence", () => {
  const decisions = [
    run(verdict("notice", { confidence: "medium" }), none),
    run(verdict("unrelated", { confidence: "low", decidedBy: "none" }), none),
    run(verdict("interview", { confidence: "low", decidedBy: "ai" }), none),
    run(verdict("rejection"), ambiguous),
    run(verdict("rejection"), unconfirmed, card("submitted")),
    run(verdict("recruiter_question"), none, null, gmail),
    run(verdict("offer", { confidence: "medium" }), none),
    run(verdict("rejection"), unique, card("withdrawn")),
    run(verdict("rejection"), unique, card("queued")),
    run(verdict("recruiter_question"), unique, card("rejected")),
    run(verdict("rejection", { confidence: "medium" }), unique, card("offer")),
    run(
      verdict("recruiter_question", { confidence: "medium" }),
      unique,
      card("submitted"),
    ),
    run(verdict("interview"), unique, null),
    run(verdict("interview"), unique, card("archived")),
    run(verdict("rejection", alone), unique, card("submitted")),
    run(
      verdict("offer", { ...alone, decidedBy: "ai" }),
      unique,
      card("interview"),
    ),
    run(
      verdict("interview", {
        decidedBy: "invite-you vs ai:recruiter_question",
        agreed: false,
      }),
      unique,
      card("submitted"),
    ),
    run(question(), unique, booked),
    run(verdict("rejection"), unique, card("submitted"), {
      receivedAt: new Date(applied.getTime() - 1),
    }),
  ];
  for (const decision of decisions) {
    assert.equal(decision.action, "review");
    assert.match(decision.reason, /^[A-Z][^_]*[^.\s]$/, decision.reason);
    assert.doesNotMatch(decision.reason, /—/, decision.reason);
  }
});

test("decide does not change its inputs", () => {
  const state = card("submitted");
  const classification = verdict("interview", {
    nextStep: "Pick a slot",
    deadline,
  });
  const before = JSON.stringify([state, classification]);
  run(classification, unique, state);
  assert.equal(JSON.stringify([state, classification]), before);
});
