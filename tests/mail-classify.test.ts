import test from "node:test";
import assert from "node:assert/strict";
import { classify, confirm } from "../src/lib/mail/classify";
import {
  classifyByRules,
  extractDetails,
  freshBody,
  rules,
} from "../src/lib/mail/rules";
import {
  mailCategories,
  type Classification,
  type RawMail,
} from "../src/lib/mail/types";

const mail = (over: Partial<RawMail> = {}): RawMail => ({
  gmailId: "m1",
  threadId: "t1",
  fromAddress: "no-reply@ashbyhq.com",
  fromName: "",
  subject: "",
  receivedAt: new Date("2026-10-13T09:00:00Z"),
  bodyText: "",
  fromMe: false,
  ...over,
});
const verdict = (over: Partial<RawMail>) => {
  const result = classifyByRules(mail(over));
  assert.ok(result, `no rule decided: ${over.subject ?? over.bodyText}`);
  return result;
};
const day = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;
const pending = mail({
  subject: "Update on your application",
  bodyText: "Thank you for your patience, we will get back to you next week.",
});

test("notices win over the application wording they contain", () => {
  for (const over of [
    {
      subject: "Privacy and Compliance Notification from flaconi",
      bodyText: "This notice concerns your application data at flaconi.",
    },
    { subject: "Can we keep you in our talent pool? (TeamViewer)" },
    { subject: "GDPR notification from SoSafe" },
    {
      subject: "We want to know what you think",
      bodyText: "Please take our candidate survey.",
    },
    { subject: "Security code for your application to ClickHouse" },
    { subject: "Trusted Shops SE - Update on your application data consent" },
    { subject: "Your interview experience at Raisin" },
    { subject: "Your information has been deleted (Aignostics)" },
    { subject: "Verify your candidate account" },
    { subject: "Löschung Ihrer Bewerberdaten" },
    { subject: "Dürfen wir dich in unseren Talentpool aufnehmen?" },
    { subject: "Jobalarm: 12 neue Stellen für Frontend Entwickler" },
    { subject: "Bitte bestätigen Sie Ihre E-Mail-Adresse" },
    {
      subject: "Your application was viewed by flaconi",
      fromAddress: "jobs-noreply@linkedin.com",
    },
  ])
    assert.equal(verdict(over).category, "notice", over.subject);
});

test("rejections in English and German are high precision", () => {
  for (const over of [
    { subject: "Kit: We're moving forward with other candidates" },
    {
      subject: "Your application at Kit",
      bodyText:
        "Hi Arinze. Unfortunately, we have decided not to move forward with your application. We wish you the best.",
    },
    {
      subject: "Deine Bewerbung",
      bodyText:
        "Hallo Arinze, leider müssen wir Ihnen mitteilen, dass wir uns für andere Kandidaten entschieden haben.",
    },
    {
      subject: "Ihre Bewerbung bei Beispiel GmbH",
      bodyText:
        "Leider können wir Ihre Bewerbung nicht weiter berücksichtigen.",
    },
    { subject: "Absage zu Ihrer Bewerbung als Frontend Entwickler" },
    {
      subject: "Thank you for applying to Acme",
      bodyText:
        "Thank you for applying. After careful review we will not be moving forward with your application at this time.",
    },
  ]) {
    const result = verdict(over);
    assert.equal(result.category, "rejection", over.subject);
    assert.equal(result.confidence, "high", over.subject);
  }
  const filled = verdict({
    subject: "Update on Your Application at CoW DAO - Position Filled",
  });
  assert.equal(filled.category, "rejection");
  assert.equal(
    verdict({
      subject: "Update on Your Application at CoW DAO – Position Filled",
    }).category,
    "rejection",
  );
});

test("a rule hit names the rule and quotes the sentence it matched", () => {
  const result = verdict({
    subject: "Your application at Kit",
    bodyText:
      "Hi Arinze. Unfortunately, we’ve decided not to move forward with your application. We wish you the best.",
  });
  assert.ok(rules.some((rule) => rule.id === result.decidedBy));
  assert.equal(
    result.evidenceQuote,
    "Unfortunately, we’ve decided not to move forward with your application.",
  );
  const bySubject = verdict({
    subject: "Kit: We're moving forward with other candidates",
  });
  assert.equal(
    bySubject.evidenceQuote,
    "Kit: We're moving forward with other candidates",
  );
  assert.equal(bySubject.nextStep, null);
  assert.equal(bySubject.deadline, null);
});

test("confirmations in English and German", () => {
  const peec = verdict({
    subject: "Thanks for applying to Peec AI!",
    bodyText: "We have received your application and will review it shortly.",
  });
  assert.equal(peec.category, "confirmation");
  assert.equal(peec.confidence, "high");
  assert.equal(peec.company, "Peec AI");
  const german = verdict({
    subject: "Deine Bewerbung als Senior Frontend Engineer",
    bodyText:
      "Hallo Arinze, vielen Dank für deine Bewerbung und dein Interesse. Wir haben deine Unterlagen erhalten und melden uns bald.",
  });
  assert.equal(german.category, "confirmation");
  assert.equal(german.confidence, "high");
  assert.equal(
    verdict({
      subject: "Arinze, your application was sent to Redcare Pharmacy",
      fromAddress: "jobs-noreply@linkedin.com",
    }).category,
    "confirmation",
  );
  for (const subject of [
    "Your application is in - Senior Frontend Engineer at Trading 212",
    "We received your application | plancraft",
    "Langdock | Thank you for you application!",
    "Senior Fullstack Engineer (m/f/d) - Eingangsbestätigung Deiner Bewerbung",
    "Vielen Dank für Ihre Bewerbung bei eRecht24 GmbH & Co. KG",
    "Wir haben deine Bewerbung für die Position bei Carus Digital GmbH erhalten",
    "Deine Bewerbung wurde erfolgreich an HRworks übermittelt",
    "Application to PhotoRoom successfully submitted",
  ])
    assert.equal(verdict({ subject }).category, "confirmation", subject);
});

test("a receipt subject does not hide bad news in the body", () => {
  assert.equal(
    classifyByRules(
      mail({
        subject: "Thank you for your application",
        bodyText:
          "Thank you for your application. Unfortunately the team went another way this time.",
      }),
    ),
    null,
  );
});

test("assessments carry the next step and the deadline", () => {
  assert.equal(
    verdict({
      subject:
        "Redcare Pharmacy - Next steps of your interview process is an online assessment",
    }).category,
    "assessment",
  );
  const takeHome = verdict({
    subject: "Next steps",
    bodyText:
      "Hi Arinze, thanks for your time. As a next step, please complete the take-home assignment by 21 October 2026. Good luck!",
  });
  assert.equal(takeHome.category, "assessment");
  assert.equal(day(takeHome.deadline), "2026-10-21");
  assert.match(takeHome.nextStep ?? "", /take-home assignment/);
  const german = verdict({
    subject: "Nächster Schritt",
    bodyText:
      "Hallo Arinze, bitte bearbeite die Testaufgabe bis zum 21.10.2026 und sende uns deine Lösung.",
  });
  assert.equal(german.category, "assessment");
  assert.equal(day(german.deadline), "2026-10-21");
});

test("interview invitations in English and German", () => {
  for (const over of [
    { subject: "Invitation: Interview with Raisin @ Tue Apr 21, 2026" },
    { subject: "LIQID | Invitation to second interview" },
    {
      subject: "Ihre Bewerbung",
      bodyText:
        "Guten Tag Herr Ogbonna, wir möchten Sie gerne zu einem Gespräch einladen.",
    },
    { subject: "Einladung zum Vorstellungsgespräch" },
    {
      subject:
        "Reminder for interview with Wunderflats for the Software Engineer (f/m/d) position",
    },
    {
      subject:
        "Confirming your virtual interview with HelloFresh! Frontend Engineer [GROWTH]",
    },
    {
      subject: "Your application at Acme",
      bodyText:
        "Hi Arinze, we would like to invite you to a first interview with our engineering lead.",
    },
  ])
    assert.equal(
      verdict(over).category,
      "interview",
      over.subject + (over.bodyText ?? ""),
    );
  const raisin = verdict({
    subject: "Invitation: Interview with Raisin @ Tue Apr 21, 2026",
  });
  assert.equal(raisin.company, "Raisin");
  assert.ok(raisin.nextStep);
  assert.equal(day(raisin.deadline), "2026-04-21");
});

test("a hiring process described in a receipt is not an invitation", () => {
  const result = verdict({
    subject: "Thanks for applying to Acme!",
    bodyText:
      "We received your application. If your profile is a match, we would like to invite you to an interview. Our process: a recruiter call, then a take-home assignment you will complete at home. If you do not hear from us within two weeks, we have decided not to move forward with your application.",
  });
  assert.equal(result.category, "confirmation");
  assert.equal(
    classifyByRules(mail({ subject: "Redcare Pharmacy - Interview feedback" })),
    null,
  );
  // The one harmless "unfortunately": too many applicants to answer each.
  assert.equal(
    verdict({
      subject: "Thank you for your application to Aircall!",
      bodyText:
        "We've received your application. Unfortunately, due to the high volume of applications, we are not able to respond to everyone individually.",
    }).category,
    "confirmation",
  );
});

test("subjects that only look decisive are graded down or left alone", () => {
  const linkedin = verdict({
    subject:
      "Your application to Senior Fullstack Engineer (m/f/d) at Redcare Pharmacy",
    fromAddress: "jobs-noreply@linkedin.com",
  });
  assert.equal(linkedin.category, "rejection");
  assert.equal(linkedin.confidence, "medium");
  const video = verdict({
    subject: "Video interview - Arinze Ogbonna and Redcare Pharmacy",
  });
  assert.equal(video.category, "interview");
  assert.equal(video.confidence, "medium");
  const question = verdict({
    subject: "Thanks for Applying to envelio! Quick Question for You",
  });
  assert.equal(question.category, "recruiter_question");
  assert.equal(question.confidence, "medium");
  const recorded = verdict({
    subject: "Complete Your SuperAnnotate AI Interview - 10 Minutes",
  });
  assert.equal(recorded.category, "assessment");
  assert.equal(recorded.confidence, "medium");
  for (const subject of [
    "Application Update - Thank you for applying with Arize AI!",
    "Your application at Lunatech, outcome technical test",
    "Re: Interview Follow Up",
    "Your interview with Acme has been cancelled",
    "Let's keep in touch, Arinze",
    "Your amber Application was successful.",
  ])
    assert.equal(classifyByRules(mail({ subject })), null, subject);
});

test("mail from an employer that is not about the application is left alone", () => {
  for (const [subject, bodyText] of [
    [
      "Join our coding contest",
      "Please take a look at the challenge of scaling Kafka. You have not selected a plan yet. We will not be moving forward with the migration.",
    ],
    [
      "When can you start?",
      "When can you start using ClickHouse Cloud? We are pleased to offer you a new annual contract.",
    ],
    [
      "Einladung zum Beratungsgespräch",
      "Wir möchten Sie zu einem Beratungsgespräch einladen.",
    ],
    ["Our plans", "We'd love to schedule a demo call with you."],
    ["Absage Ihres Termins", "Leider müssen wir Ihren Termin absagen."],
    [
      "Wir haben Ihre Unterlagen erhalten",
      "Wir haben Ihre Unterlagen erhalten und prüfen Ihren Antrag.",
    ],
  ])
    assert.equal(classifyByRules(mail({ subject, bodyText })), null, subject);
});

test("offers and recruiter questions", () => {
  const offer = verdict({
    subject: "Great news",
    bodyText:
      "Hi Arinze, we are pleased to offer you the position of Senior Frontend Engineer. Please sign the contract by 20.10.2026.",
  });
  assert.equal(offer.category, "offer");
  assert.equal(offer.confidence, "high");
  assert.equal(day(offer.deadline), "2026-10-20");
  assert.equal(
    verdict({
      subject: "Ihre Bewerbung",
      bodyText:
        "Wir freuen uns sehr, Ihnen ein Vertragsangebot unterbreiten zu können.",
    }).category,
    "offer",
  );
  assert.equal(
    classifyByRules(
      mail({
        subject: "Our autumn deals",
        bodyText: "We are pleased to offer you a 20% discount.",
      }),
    ),
    null,
  );
  const question = verdict({
    subject: "Your application at Acme",
    bodyText:
      "Hi Arinze, thanks for applying. What are your salary expectations? Please reply within 5 days.",
  });
  assert.equal(question.category, "recruiter_question");
  assert.equal(day(question.deadline), "2026-10-18");
  assert.equal(
    verdict({
      subject: "Ihre Bewerbung",
      bodyText: "Könnten Sie uns bitte Ihre Gehaltsvorstellung mitteilen?",
    }).category,
    "recruiter_question",
  );
});

test("mail the rules cannot settle stays undecided", async () => {
  assert.equal(classifyByRules(pending), null);
  for (const subject of [
    "Your application at Jedox",
    "Deepslate Application Update",
    "Feedback on your application | Senior Full-Stack Software Engineer (m/f/d) | 1KOMMA5°",
    "Thank you for your interest in Veeva",
    "Rückmeldung zu Deiner Bewerbung - Senior Fullstack Engineer (m/f/d)",
  ])
    assert.equal(classifyByRules(mail({ subject })), null, subject);
  const undecided = await classify(pending, null);
  assert.deepEqual(undecided, {
    category: "unrelated",
    confidence: "low",
    decidedBy: "none",
    evidenceQuote: null,
    company: null,
    role: null,
    nextStep: null,
    deadline: null,
  });
  const named = await classify(
    mail({ subject: "Update on your application at bunch" }),
  );
  assert.equal(named.decidedBy, "none");
  assert.equal(named.company, "bunch");
});

test("the AI fallback is used only when no rule decides, and never throws", async () => {
  const rejection: Classification = {
    category: "rejection",
    confidence: "high",
    decidedBy: "ai",
    evidenceQuote: "we will get back to you next week",
    company: null,
    role: "Frontend Engineer",
    nextStep: null,
    deadline: null,
  };
  let calls = 0;
  const fakeAi = async () => {
    calls += 1;
    return rejection;
  };
  assert.deepEqual(await classify(pending, fakeAi), {
    ...rejection,
    agreed: false,
  });
  const named = await classify(
    mail({ ...pending, subject: "Update on your application at bunch" }),
    fakeAi,
  );
  assert.deepEqual(named, { ...rejection, company: "bunch", agreed: false });
  assert.equal(calls, 2);
  const decided = await classify(
    mail({ subject: "Thanks for applying to Peec AI!" }),
    fakeAi,
  );
  assert.equal(decided.category, "confirmation");
  assert.equal(calls, 2);
  const failing = await classify(pending, async () => {
    throw new Error("503");
  });
  assert.equal(failing.decidedBy, "none");
  assert.equal(failing.confidence, "low");
  assert.equal((await classify(pending, async () => null)).decidedBy, "none");
});

test("mail the user sent is never classified", async () => {
  const sent = mail({
    subject: "Re: Interview w/ HelloFresh",
    bodyText: "We would like to invite you to an interview.",
    fromMe: true,
  });
  for (const result of [classifyByRules(sent), await classify(sent)]) {
    assert.equal(result?.category, "unrelated");
    assert.equal(result?.confidence, "high");
    assert.equal(result?.decidedBy, "from-me");
  }
});

test("company and role come out of the subject", () => {
  const details = (subject: string, over: Partial<RawMail> = {}) =>
    extractDetails(mail({ subject, ...over }), "confirmation");
  assert.equal(details("Thanks for applying to Peec AI!").company, "Peec AI");
  assert.deepEqual(
    details("Your application as Senior Frontend Engineer (m/f/d) at Jedox"),
    {
      company: "Jedox",
      role: "Senior Frontend Engineer",
      nextStep: null,
      deadline: null,
    },
  );
  for (const [subject, company, role] of [
    [
      "Thank you for applying for the Senior Software Engineer position at Atolls",
      "Atolls",
      "Senior Software Engineer",
    ],
    [
      "Your application to Senior Fullstack Engineer (m/f/d) at Redcare Pharmacy",
      "Redcare Pharmacy",
      "Senior Fullstack Engineer",
    ],
    [
      "Vielen Dank für deine Bewerbung bei MOBIKO als Senior Full Stack Developer (m/w/d)",
      "MOBIKO",
      "Senior Full Stack Developer",
    ],
    [
      "Deine Bewerbung als (Senior) Product Engineer (m/f/d) / Your application as (Senior) Product Engineer (m/f/d) |1KOMMA5°",
      "1KOMMA5°",
      "(Senior) Product Engineer",
    ],
    [
      "Ihre Bewerbung bei eRecht24 GmbH & Co. KG",
      "eRecht24 GmbH & Co. KG",
      null,
    ],
    [
      "Arinze, your application was sent to Redcare Pharmacy",
      "Redcare Pharmacy",
      null,
    ],
    ["Kit: We're moving forward with other candidates", "Kit", null],
    ["Deepslate Application Update", "Deepslate", null],
    ["OH-SO - Thank you for your application", "OH-SO", null],
    [
      "Your application is in - Senior Frontend Engineer at Trading 212",
      "Trading 212",
      "Senior Frontend Engineer",
    ],
    [
      "Your application for Product Engineer at AI Music Video Generator at neural frames",
      "neural frames",
      "Product Engineer",
    ],
    [
      "Feedback on your application | Senior Full-Stack Software Engineer (m/f/d) | 1KOMMA5°",
      "1KOMMA5°",
      "Senior Full-Stack Software Engineer",
    ],
    ["Thank you for applying to Cresta's Engineering Team!", "Cresta", null],
    [
      "Wir haben deine Bewerbung für die Position bei Carus Digital GmbH erhalten",
      "Carus Digital GmbH",
      null,
    ],
    // Wording and job titles are not company names.
    ["Let's Talk - Next steps", null, null],
    ["Your job application for React Developer", null, "React Developer"],
    ["Your application as Developer with Python", null, "Developer"],
    ["Update on your application", null, null],
    ["Thanks for Applying to envelio! Quick Question for You", "envelio", null],
  ] as const) {
    const found = details(subject);
    assert.equal(found.company, company, subject);
    assert.equal(found.role, role, subject);
  }
  const fromBody = details("Bewerbung erhalten", {
    bodyText:
      "Hallo Arinze, vielen Dank für deine Bewerbung als Frontend Engineer bei Beispiel GmbH. Wir melden uns.",
  });
  assert.equal(fromBody.company, "Beispiel GmbH");
  assert.equal(fromBody.role, "Frontend Engineer");
  // A company after a dash counts only when the sender confirms it.
  const subject = "Your application to Software Engineer (Frontend) - Revolut";
  assert.deepEqual(
    details(subject, { fromAddress: "recruitment-no-reply@revolut.com" }),
    {
      company: "Revolut",
      role: "Software Engineer (Frontend)",
      nextStep: null,
      deadline: null,
    },
  );
  assert.equal(details(subject).company, null);
  // The candidate's own name in the subject is not an employer.
  const lever = "Ogbonna - We have received your application!";
  assert.equal(
    details(lever, { bodyText: "Hi Ogbonna, thanks for applying." }).company,
    null,
  );
  assert.equal(
    details("Ogbonna, Thank you for your application to KPA!").company,
    "KPA",
  );
});

test("deadlines are parsed only from explicit dates", () => {
  const deadline = (bodyText: string, receivedAt?: Date) =>
    day(
      extractDetails(
        mail({ bodyText, ...(receivedAt ? { receivedAt } : {}) }),
        "assessment",
      ).deadline,
    );
  assert.equal(
    deadline("Please submit the coding challenge by 21 October."),
    "2026-10-21",
  );
  assert.equal(
    deadline("Please submit the coding challenge by October 21st, 2026."),
    "2026-10-21",
  );
  assert.equal(
    deadline("Bitte sende uns die Aufgabe bis spätestens 21. Oktober zurück."),
    "2026-10-21",
  );
  assert.equal(
    deadline("Bitte bearbeite den Test innerhalb von 5 Tagen."),
    "2026-10-18",
  );
  assert.equal(
    deadline("Please complete the test within one week."),
    "2026-10-20",
  );
  assert.equal(
    deadline(
      "Please return the assignment by 5 January.",
      new Date("2026-12-20T10:00:00Z"),
    ),
    "2027-01-05",
  );
  // A day that already passed this year, 03/04 that could be March or April,
  // a weekday without a date, and the employer's own promise are not deadlines.
  assert.equal(deadline("Please submit the challenge by 1 October."), null);
  assert.equal(deadline("Please submit the challenge by 03/04/2027."), null);
  assert.equal(deadline("Please submit the challenge by Friday."), null);
  assert.equal(
    deadline("We will review your test and reply by 21 October 2026."),
    null,
  );
  assert.equal(
    deadline("Complete the test. You will hear from us within 2 weeks."),
    null,
  );
  assert.equal(
    deadline("You have 7 days to finish the coding test."),
    "2026-10-20",
  );
  assert.equal(
    deadline("After the test: you have 30 days of holiday a year."),
    null,
  );
  assert.equal(
    deadline("Please send the task back within 3 business days."),
    "2026-10-16",
  );
  assert.equal(
    extractDetails(
      mail({ bodyText: "Please complete the assignment by 21 October 2026." }),
      "confirmation",
    ).deadline,
    null,
  );
});

test("rules are well formed and ordered by category priority", () => {
  const priority = [
    "notice",
    "unrelated",
    "rejection",
    "offer",
    "assessment",
    "interview",
    "recruiter_question",
    "confirmation",
  ];
  const order = rules.map((rule) => priority.indexOf(rule.category));
  assert.ok(order.every((rank) => rank >= 0));
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
  );
  assert.equal(new Set(rules.map((rule) => rule.id)).size, rules.length);
  for (const rule of rules) {
    assert.ok(rule.subject || rule.body || rule.from, rule.id);
    assert.ok(mailCategories.includes(rule.category), rule.id);
    assert.ok(rule.id.startsWith(`${rule.category}.`), rule.id);
  }
});

// Review round: a high-precision rule may only fire on a sentence that states
// the outcome for this application.
const category = (over: Partial<RawMail>) =>
  classifyByRules(mail(over))?.category ?? null;
const graded = (over: Partial<RawMail>) => {
  const result = classifyByRules(mail(over));
  return result ? `${result.category}/${result.confidence}` : null;
};

test("hard-wrapped plain text is read as running text", () => {
  // The "if" sits on the line above the phrase it governs.
  assert.equal(
    category({
      subject: "Thank you for applying to Acme",
      bodyText:
        "Hi Arinze,\n\nThanks for applying. Please note that if you have not heard from us within two weeks, we have\ndecided to move forward with other candidates.\n\nBest",
    }),
    "confirmation",
  );
  // The phrase itself is broken over two lines.
  const wrapped = verdict({
    subject: "Thank you for your application",
    bodyText:
      "Hi Arinze,\n\nThank you for applying. After review we've decided to move forward\r\nwith other candidates.\n\nBest",
  });
  assert.equal(wrapped.category, "rejection");
  assert.equal(wrapped.confidence, "high");
  assert.equal(
    wrapped.evidenceQuote,
    "After review we've decided to move forward with other candidates.",
  );
  assert.equal(
    category({
      subject: "Application received",
      bodyText:
        "We have received your application for the role.\nIf you are\nnot selected for the position, we will keep your CV on file.",
    }),
    "confirmation",
  );
  // A blank line and a list item still end a sentence.
  assert.equal(
    verdict({
      subject: "Your application",
      bodyText:
        "If you have questions, reply to this mail\n\nUnfortunately we will not be moving forward with your application.\n- If you want feedback, ask",
    }).category,
    "rejection",
  );
});

test("policy, footer, conditional and future sentences are not rejections", () => {
  const receipt = "We have received your application.";
  for (const [expected, subject, bodyText] of [
    [
      "confirmation",
      "Thank you for your application",
      `${receipt}\n\nWe will retain your data for six months after your application has been rejected, to comply with legal obligations.`,
    ],
    [
      "confirmation",
      "Thanks for applying to Acme",
      `${receipt}\n\nYour personal data will be deleted 6 months after your application is declined.`,
    ],
    [
      "assessment",
      "Next step",
      "Please complete the coding assessment within 5 days. Your application will be automatically rejected if the assessment is not completed in time.",
    ],
    [
      "interview",
      "Next step",
      "We would like to invite you to an interview. Please confirm by Friday; your application will be declined otherwise.",
    ],
    [
      "confirmation",
      "Application received",
      `${receipt} Candidates not selected for an interview will not be contacted.`,
    ],
    [
      "confirmation",
      "Application received - Acme",
      `${receipt} Please note that late applications are declined.`,
    ],
    [
      "confirmation",
      "Vielen Dank für Ihre Bewerbung",
      "Guten Tag Herr Ogbonna,\n\nwir haben Ihre Bewerbung erhalten.\n\nBitte beachten Sie: Bewerbungen von Personalvermittlern werden nicht berücksichtigt.",
    ],
    [
      "confirmation",
      "Ihre Bewerbung bei Acme",
      "Wir haben Ihre Bewerbung erhalten.\n\nBewerbungen per E-Mail können aus Datenschutzgründen nicht berücksichtigt werden.",
    ],
    [
      "confirmation",
      "Thank you for applying to Acme",
      "We will let you know whether we would like to invite you or have decided to proceed with other candidates.",
    ],
    [
      "confirmation",
      "Thank you for applying to Acme",
      "Due to the volume of applications we may move forward with other candidates without further notice.",
    ],
    [
      "confirmation",
      "Thank you for applying to Acme",
      "You'll hear from us either way, even when we go with another candidate.",
    ],
    [
      "confirmation",
      "Thank you for applying to Acme",
      "We will only contact candidates whose experience more closely matches our needs.",
    ],
    [
      "confirmation",
      "Eingangsbestätigung Ihrer Bewerbung",
      "Wir melden uns bei Ihnen. Bewerber, die innerhalb von vier Wochen keine positive Rückmeldung erhalten, bitten wir um Verständnis.",
    ],
    [
      "confirmation",
      "Eingangsbestätigung",
      "Die Entscheidung für oder gegen Ihre Bewerbung treffen wir innerhalb von zwei Wochen.",
    ],
    [
      "recruiter_question",
      "Thank you for applying to Acme",
      "We will not be moving forward with your application unless we receive your work permit by Friday.",
    ],
    [
      "confirmation",
      "Thank you for applying to Acme",
      "We reserve the right to proceed with other candidates. In such cases we usually move forward with other applicants.",
    ],
    [
      "confirmation",
      "Thank you for applying to Acme",
      "Please note we are unable to offer you a position without a valid work permit.",
    ],
    [
      "confirmation",
      "Vielen Dank für Ihre Bewerbung",
      "Bitte beachten Sie, dass wir Sie ohne Arbeitserlaubnis nicht berücksichtigen können.",
    ],
  ] as const)
    assert.equal(category({ subject, bodyText }), expected, bodyText);
  for (const [subject, bodyText] of [
    // "Leider" in a receipt is not understood, so nobody is told it arrived.
    [
      "Eingangsbestätigung Ihrer Bewerbung",
      "wir haben Ihre Bewerbung erhalten.\n\nUnvollständige Bewerbungen können wir leider nicht berücksichtigen.",
    ],
    // A cancelled or moved meeting is not a refusal.
    [
      "Absage: Kennenlerngespräch am 21. Oktober",
      "Hallo Arinze,\n\nleider muss ich unser Gespräch zu deiner Bewerbung am Dienstag verschieben, ich bin krank. Ich melde mich mit einem neuen Termin.",
    ],
    [
      "Absage des Termins am Dienstag",
      "Hallo Arinze, ich muss den Termin leider verschieben. Wir freuen uns weiter auf das Gespräch zu deiner Bewerbung.",
    ],
    [
      "Unser Termin morgen",
      "Hallo Arinze,\n\nich muss dir für morgen leider absagen, ich bin krank. Passt dir Donnerstag um 10 Uhr?",
    ],
    [
      "Ihr Termin",
      "leider muss ich Ihnen mitteilen, dass sich der Termin verschiebt",
    ],
    [
      "Re: Interview",
      "Hi Arinze, I cannot offer you an interview slot on Friday, would Monday at 10 work?",
    ],
    [
      "Your application",
      "We are currently not able to offer you a position in Berlin, but we would love to interview you for our Hamburg office.",
    ],
  ])
    assert.equal(category({ subject, bodyText }), null, bodyText);
});

test("sentences that state the outcome are still rejections", () => {
  for (const [confidence, subject, bodyText] of [
    [
      "high",
      "Your application",
      "After careful consideration we have decided to move forward with other candidates.",
    ],
    [
      "high",
      "Your application",
      "Unfortunately we won't be moving forward with your application, but we will keep your CV on file in case something fitting opens up.",
    ],
    [
      "high",
      "Your application",
      "We decided not to move forward with your application after reviewing your profile.",
    ],
    [
      "high",
      "Your application",
      "Unfortunately, your application has not been successful on this occasion.",
    ],
    [
      "high",
      "Ihre Bewerbung",
      "Nachdem wir Ihre Unterlagen geprüft haben, müssen wir Ihnen leider absagen.",
    ],
    [
      "high",
      "Ihre Bewerbung",
      "Leider können wir Sie im weiteren Verfahren nicht berücksichtigen.",
    ],
    ["high", "Update", "Sie kommen nicht in die nächste Runde."],
    [
      "high",
      "Your application",
      "We have decided to move forward with other candidates and will be in touch if a suitable role opens up.",
    ],
    [
      "high",
      "Your application",
      "We will not be moving forward with your application and thank you once again for your interest.",
    ],
    [
      "high",
      "Deine Bewerbung",
      "Hallo Arinze, leider müssen wir dir heute absagen, auch wenn uns dein Profil gefallen hat.",
    ],
    // Item 8: "entscheiden" as well as "entschieden".
    [
      "high",
      "Ihre Bewerbung",
      "Wir entscheiden uns für einen anderen Kandidaten.",
    ],
    [
      "high",
      "Absage nach dem Vorstellungsgespräch",
      "Hallo Herr Ogbonna,\n\nvielen Dank für das nette Gespräch. Wir haben uns für jemand anderen entschieden.",
    ],
    [
      "high",
      "Your interview with Acme",
      "Hi Arinze, thank you for taking the time to interview with us. We have decided to go in a different direction for this role.",
    ],
    [
      "medium",
      "Danke für das Kennenlerngespräch",
      "Hallo Arinze,\n\nschön, dich kennengelernt zu haben. Wir haben uns intern für einen anderen Weg entschieden.",
    ],
    ["medium", "Position filled: Senior Frontend Engineer", "Hi"],
  ] as const)
    assert.equal(
      graded({ subject, bodyText }),
      `rejection/${confidence}`,
      bodyText,
    );
});

test("an interview on offer is an interview, not a job offer", () => {
  for (const bodyText of [
    "We are pleased to offer you an interview for the position of Senior Frontend Engineer.",
    "We would like to offer you a first interview for the role.",
  ])
    assert.equal(
      graded({ subject: "Your application at Acme", bodyText }),
      "interview/high",
      bodyText,
    );
  assert.notEqual(
    category({
      subject: "Your application at Acme",
      bodyText:
        "We'd like to offer you a chance to discuss the role with our CTO.",
    }),
    "offer",
  );
  assert.equal(
    graded({
      subject: "Good news",
      bodyText:
        "We are delighted to offer you the Senior Frontend Engineer position.",
    }),
    "offer/high",
  );
});

test("a subject that mentions an interview does not outrank the body", () => {
  assert.equal(
    category({
      subject: "Thank you for your interview with Acme",
      bodyText: "It was great meeting you. We'll get back to you next week.",
    }),
    null,
  );
  for (const subject of [
    "Your interview with Acme",
    "Ihr Vorstellungsgespräch",
    "Invitation: Arinze / Anna - intro call @ Tue 14 Oct 2026 10am",
  ])
    assert.equal(graded({ subject }), "interview/medium", subject);
  assert.equal(
    category({
      subject: "Reminder for interview with Acme",
      bodyText: "Unfortunately the role has been put on hold.",
    }),
    null,
  );
  for (const subject of [
    "Schedule your interview with Acme",
    "Einladung zum Vorstellungsgespräch",
  ])
    assert.equal(graded({ subject }), "interview/high", subject);
});

test("product, research and event mail is unrelated", () => {
  for (const over of [
    {
      subject: "Invitation: Video call with the Grafana onboarding team",
      bodyText: "Join us for a product walkthrough.",
      fromAddress: "events@grafana.com",
    },
    {
      subject: "Invitation to a user interview",
      bodyText:
        "We'd love to invite you to a 30 minute interview about your experience with our product.",
      fromAddress: "research@grafana.com",
    },
    {
      subject: "You're invited: Grafana video call series",
      bodyText: "Join.",
      fromAddress: "events@grafana.com",
    },
  ])
    assert.equal(graded(over), "unrelated/high", over.subject);
  // Hiring mail is not thrown away for naming such a team, coming from a
  // hiring system, or reading a little like research.
  for (const over of [
    {
      subject: "Tuesday?",
      bodyText:
        "Hi Arinze, are you free on Tuesday for a chat about your experience with the platform team?",
    },
    {
      subject: "Workshop day",
      bodyText: "We'd like to invite you to an interview next week.",
      fromAddress: "no-reply@ashbyhq.com",
    },
    {
      subject: "Onboarding",
      bodyText: "Your role starts on 1 November, here is your onboarding plan.",
    },
  ])
    assert.notEqual(category(over), "unrelated", over.subject);
  assert.equal(
    graded({
      subject: "Your application at Acme",
      bodyText:
        "We would like to invite you to an interview with our Head of User Research for the Frontend Engineer position.",
    }),
    "interview/high",
  );
});

test("bulk mail from outside a hiring system never moves a card by itself", () => {
  const invite = {
    subject: "Invitation to interview",
    bodyText: "We would like to invite you to an interview next week.",
  };
  assert.equal(graded(invite), "interview/high");
  assert.equal(
    graded({ ...invite, bulk: true, fromAddress: "news@acme.com" }),
    "interview/medium",
  );
  assert.equal(
    graded({ ...invite, bulk: true, fromAddress: "no-reply@ashbyhq.com" }),
    "interview/high",
  );
  for (const over of [
    {
      subject: "Next step",
      bodyText: "Please complete the take-home assignment by Friday.",
    },
    {
      subject: "Good news",
      bodyText: "We are pleased to offer you the position of Engineer.",
    },
    { subject: "Hi", bodyText: "What are your salary expectations?" },
  ])
    assert.match(
      graded({ ...over, bulk: true, fromAddress: "news@acme.com" }) ?? "",
      /\/medium$/,
      over.bodyText,
    );
  assert.equal(
    graded({
      subject: "Thanks for applying to Acme",
      bulk: true,
      fromAddress: "news@acme.com",
    }),
    "confirmation/high",
  );
});

test("a notice word in a subject about the application does not hide the outcome", () => {
  assert.equal(
    graded({
      subject: "Ihre Bewerbung bei Acme - Aufnahme in unseren Talentpool",
      bodyText:
        "Leider haben wir uns für andere Kandidaten entschieden. Wir würden Sie gerne in unseren Talentpool aufnehmen.",
    }),
    "rejection/high",
  );
  assert.equal(
    graded({
      subject: "Your application at Acme - share your candidate experience",
      bodyText:
        "Unfortunately we will not be moving forward with your application.",
    }),
    "rejection/high",
  );
  for (const subject of [
    "Ihre Bewerbung bei Acme - Aufnahme in unseren Talentpool",
    "Your application at Acme - share your candidate experience",
    "Update on your application - log in to your candidate home",
  ])
    assert.equal(category({ subject }), null, subject);
  // Without the application in the subject the notice stands, unless the
  // body says the application failed.
  const pool = { subject: "Can we keep you in our talent pool?" };
  assert.equal(category(pool), "notice");
  assert.equal(
    graded({
      ...pool,
      bodyText:
        "Unfortunately we have decided not to move forward with your application. Can we keep your details?",
    }),
    "rejection/high",
  );
  // Notices that are about the application's data or access stay notices.
  for (const subject of [
    "Security code for your application to ClickHouse",
    "Trusted Shops SE - Update on your application data consent",
    "Your application was viewed by flaconi",
  ])
    assert.equal(graded({ subject }), "notice/high", subject);
});

test("requests have to be requests", () => {
  for (const over of [
    {
      subject: "Your application",
      bodyText:
        "Please do not worry about the take-home assignment yet, we will first have a call.",
    },
    { subject: "Free online assessment of your pension gap" },
    { subject: "Your application at Lunatech, outcome technical test" },
  ])
    assert.equal(category(over), null, over.subject + (over.bodyText ?? ""));
  assert.equal(
    category({
      subject: "Thanks for applying",
      bodyText:
        "We received your application. In the form you told us what are your salary expectations.",
    }),
    "confirmation",
  );
  assert.equal(
    graded({
      subject: "Hi",
      bodyText: "Great talking to you! When could you start?",
    }),
    "recruiter_question/high",
  );
  assert.equal(
    graded({
      subject:
        "Redcare Pharmacy - Next steps of your interview process is an online assessment",
    }),
    "assessment/high",
  );
});

test("other kinds of application are filed locally as unrelated", () => {
  for (const over of [
    {
      subject: "Ihre Bewerbung für die Wohnung Musterstraße 5",
      bodyText: "Leider haben wir uns für einen anderen Bewerber entschieden.",
    },
    {
      subject: "Thank you for your application to speak at JSConf",
      bodyText: "We received your talk proposal.",
    },
    {
      subject: "We have received your application",
      bodyText:
        "Thank you for applying for the N26 Metal account. We have received your application.",
    },
    {
      subject: "Your application has been submitted",
      bodyText:
        "Your application Jobdesk was submitted for OAuth verification.",
    },
    { subject: "Your visa application" },
    { subject: "Ihr Kreditantrag ist eingegangen" },
  ]) {
    const result = classifyByRules(mail(over));
    assert.equal(result?.category, "unrelated", over.subject);
    assert.equal(result?.confidence, "high", over.subject);
    assert.equal(result?.decidedBy, "other-application", over.subject);
  }
  // Job mail that mentions such things in passing is still job mail.
  assert.equal(
    graded({
      subject: "Your offer",
      bodyText:
        "We are pleased to offer you the position of Senior Frontend Engineer. We will support your visa application and help you find an apartment.",
    }),
    "offer/high",
  );
  assert.equal(
    graded({
      subject:
        "Thank you for applying for the Key Account Manager role at Acme",
    }),
    "confirmation/high",
  );
  assert.equal(
    graded({ subject: "Thanks for applying to Y Combinator" }),
    "confirmation/high",
  );
});

// Round 3: the rules are one of two readers. A card moves only when the rules
// and Claude agree, so classify() reports whether they did.
const said = (over: Partial<Classification>): Classification => ({
  category: "rejection",
  confidence: "high",
  decidedBy: "ai",
  evidenceQuote: "quote by the model",
  company: null,
  role: null,
  nextStep: null,
  deadline: null,
  ...over,
});
const counting = (answer: Classification | null | Error) => {
  const ai = Object.assign(
    async () => {
      ai.calls += 1;
      if (answer instanceof Error) throw answer;
      return answer;
    },
    { calls: 0 },
  );
  return ai;
};
const refusal = mail({
  subject: "Your application at Acme",
  bodyText:
    "Hi Arinze, unfortunately we will not be moving forward with your application.",
});
const invitation = mail({
  subject: "Your application at Acme",
  bodyText:
    "Hi Arinze, we would like to invite you to an interview. Please reply by 21 October 2026.",
});

test("a stage verdict is agreed only when Claude reaches the same category with high confidence", async () => {
  const rule = classifyByRules(invitation)!;
  assert.equal(rule.category, "interview");
  const agreeing = counting(
    said({
      category: "interview",
      company: "Acme GmbH",
      role: "Frontend Engineer",
      nextStep: "Reply to the model",
      deadline: new Date("2026-11-01"),
    }),
  );
  const agreed = await classify(invitation, agreeing);
  assert.equal(agreeing.calls, 1);
  assert.deepEqual(agreed, {
    ...rule,
    confidence: "high",
    agreed: true,
    decidedBy: `${rule.decidedBy}+ai`,
    // Field by field: the rules' value first, Claude's where the rules have none.
    company: rule.company,
    role: "Frontend Engineer",
    nextStep: rule.nextStep,
    deadline: rule.deadline,
  });
  assert.equal(agreed.company, "Acme");
  assert.equal(day(agreed.deadline), "2026-10-21");
  assert.equal(agreed.evidenceQuote, rule.evidenceQuote);

  // A medium rule that Claude confirms is as good as a high one.
  const linkedin = mail({
    subject: "Your application to Frontend Engineer at Acme",
    fromAddress: "jobs-noreply@linkedin.com",
  });
  assert.equal(classifyByRules(linkedin)?.confidence, "medium");
  const confirmed = await classify(linkedin, counting(said({})));
  assert.equal(confirmed.confidence, "high");
  assert.equal(confirmed.agreed, true);
  assert.equal(confirmed.decidedBy, "rejection.linkedin-update+ai");

  const other = await classify(
    refusal,
    counting(said({ category: "interview" })),
  );
  assert.equal(other.category, "rejection");
  assert.equal(other.confidence, "medium");
  assert.equal(other.agreed, false);
  assert.equal(other.decidedBy, "rejection.not-moving-forward vs ai:interview");

  const unsure = await classify(
    refusal,
    counting(said({ confidence: "medium" })),
  );
  assert.equal(unsure.confidence, "medium");
  assert.equal(unsure.agreed, false);
  assert.equal(
    unsure.decidedBy,
    "rejection.not-moving-forward vs ai:rejection",
  );
});

test("without a second opinion a stage verdict stands as the rule gave it, not agreed", async () => {
  const rule = classifyByRules(refusal)!;
  const unchecked = { ...rule, agreed: false };
  assert.deepEqual(await classify(refusal), unchecked);
  assert.deepEqual(await classify(refusal, null), unchecked);
  assert.deepEqual(await classify(refusal, counting(null)), unchecked);
  assert.deepEqual(
    await classify(refusal, counting(new Error("503"))),
    unchecked,
  );
  const skipped = counting(said({}));
  assert.deepEqual(
    await classify(refusal, skipped, { secondOpinion: false }),
    unchecked,
  );
  assert.equal(skipped.calls, 0);
  assert.equal((await classify(refusal, skipped, {})).agreed, true);
  assert.equal(skipped.calls, 1);
});

test("notices, unrelated mail and receipts never reach Claude in classify", async () => {
  const ai = counting(said({}));
  for (const over of [
    { subject: "GDPR notification from SoSafe" },
    { subject: "Can we keep you in our talent pool?" },
    {
      subject: "Invitation to a user interview",
      bodyText: "Join our study.",
      fromAddress: "research@grafana.com",
    },
    { subject: "Your visa application" },
    { subject: "Re: Interview", fromMe: true },
    { subject: "Thanks for applying to Peec AI!" },
  ]) {
    const input = mail(over);
    assert.deepEqual(await classify(input, ai), classifyByRules(input));
    assert.equal("agreed" in (await classify(input, ai)), false, over.subject);
  }
  assert.equal(ai.calls, 0);
});

test("Claude alone is never an agreed verdict, and bulk mail caps it", async () => {
  const alone = await classify(pending, counting(said({ category: "offer" })));
  assert.equal(alone.category, "offer");
  assert.equal(alone.confidence, "high");
  assert.equal(alone.agreed, false);
  assert.equal(alone.decidedBy, "ai");
  const newsletter = { ...pending, bulk: true, fromAddress: "news@acme.com" };
  for (const stage of [
    "rejection",
    "assessment",
    "interview",
    "offer",
    "recruiter_question",
  ] as const)
    assert.equal(
      (await classify(newsletter, counting(said({ category: stage }))))
        .confidence,
      "medium",
      stage,
    );
  assert.equal(
    (await classify(newsletter, counting(said({ category: "confirmation" }))))
      .confidence,
    "high",
  );
  assert.equal(
    (
      await classify(
        { ...newsletter, fromAddress: "no-reply@ashbyhq.com" },
        counting(said({})),
      )
    ).confidence,
    "high",
  );
  const undecided = await classify(pending, counting(null));
  assert.equal(undecided.decidedBy, "none");
  assert.equal(undecided.confidence, "low");
});

test("confirm asks for the second opinion a receipt did not get", async () => {
  const input = mail({
    subject: "Thanks for applying to Peec AI!",
    bodyText: "We have received your application.",
  });
  const receipt = await classify(input, counting(said({})));
  assert.equal(receipt.agreed, undefined);

  const yes = counting(
    said({ category: "confirmation", role: "Frontend Engineer" }),
  );
  assert.deepEqual(await confirm(input, receipt, yes), {
    ...receipt,
    confidence: "high",
    agreed: true,
    decidedBy: `${receipt.decidedBy}+ai`,
    role: "Frontend Engineer",
  });
  assert.equal(yes.calls, 1);

  const no = await confirm(input, receipt, counting(said({})));
  assert.equal(no.category, "confirmation");
  assert.equal(no.confidence, "medium");
  assert.equal(no.agreed, false);
  assert.equal(no.decidedBy, `${receipt.decidedBy} vs ai:rejection`);

  const unchecked = { ...receipt, agreed: false };
  assert.deepEqual(await confirm(input, receipt, null), unchecked);
  assert.deepEqual(await confirm(input, receipt, counting(null)), unchecked);
  assert.deepEqual(
    await confirm(input, receipt, counting(new Error("timeout"))),
    unchecked,
  );

  // A verdict that already had its second opinion is not asked about again.
  const again = counting(said({ category: "confirmation" }));
  const settled = { ...receipt, agreed: true };
  assert.deepEqual(await confirm(input, settled, again), settled);
  assert.deepEqual(await confirm(input, unchecked, again), unchecked);
  assert.equal(again.calls, 0);
});

test("the role is read from the body when the subject has none", () => {
  const role = (subject: string, bodyText: string) =>
    extractDetails(mail({ subject, bodyText }), "rejection").role;
  for (const [expected, subject, bodyText] of [
    [
      "Product Designer",
      "Your application at Acme",
      "Hi Arinze,\n\nThank you for your interest in the Product Designer opening. Unfortunately we will not be moving forward with your application.",
    ],
    [
      "Data Engineer",
      "Update from Acme",
      "Hi Arinze,\n\nThank you for taking the time to apply for the Data Engineer role. Unfortunately, we have decided to move forward with other candidates.",
    ],
    [
      "Backend-Entwickler",
      "Ihre Bewerbung bei Acme",
      "Guten Tag Herr Ogbonna,\n\nvielen Dank für Ihr Interesse an der Stelle Backend-Entwickler (m/w/d). Leider haben wir uns für andere Kandidaten entschieden.",
    ],
    [
      "Office Manager",
      "Thank you for applying to Globex",
      "Hi Arinze,\n\nwe are happy you want to join us as our new Office Manager. We will be in touch.",
    ],
    [
      "Senior Frontend Engineer",
      "Your application",
      "Thank you for your application for the role of Senior Frontend Engineer and your interest in Acme.",
    ],
    [
      "Senior Data Analyst",
      "Deine Bewerbung",
      "vielen Dank für deine Bewerbung auf die Position Senior Data Analyst (m/w/d) und dein Interesse.",
    ],
    [
      "Frontend Entwickler",
      "Ihre Bewerbung",
      "wir haben Ihre Bewerbung für die Stelle als Frontend Entwickler erhalten.",
    ],
    [
      "Staff Engineer",
      "Your application",
      "We reviewed your application for the position as Staff Engineer with great interest.",
    ],
    [
      "Software Engineer, Frontend",
      "Update on your application",
      "Unfortunately we will not be moving forward with your application for the Software Engineer, Frontend position.",
    ],
    // Not a job title, or no title at all: no role.
    [
      null,
      "Your application",
      "Thank you for your interest in the open position at Acme.",
    ],
    [
      null,
      "Your application",
      "As a company we value your time. The role is based in Berlin.",
    ],
    [
      null,
      "Ihre Bewerbung",
      "Als Unternehmen legen wir Wert auf die Stelle und das Team.",
    ],
  ] as const)
    assert.equal(role(subject, bodyText), expected, bodyText);
  // The subject still wins when it names the role.
  assert.equal(
    role(
      "Your application as Senior Frontend Engineer at Acme",
      "Thank you for your interest in the Product Designer opening.",
    ),
    "Senior Frontend Engineer",
  );
});

test("wrapped dates, quoted lines and long reply headers do not break sentences", () => {
  // B1: "31. Oktober" at the start of a wrapped line is a date, not item 31.
  assert.notEqual(
    category({
      subject: "Vielen Dank für Ihre Bewerbung",
      bodyText:
        "Guten Tag Herr Ogbonna,\n\nwir haben Ihre Bewerbung erhalten. Sollten Sie bis zum\n31. Oktober nichts von uns hören, konnten wir Sie leider nicht berücksichtigen.\n\nMit freundlichen Grüßen",
    }),
    "rejection",
  );
  assert.equal(
    freshBody(
      "Sollten Sie bis zum\n31. Oktober nichts hören.\n\nSchritte:\n1. Wir prüfen.\n2. Wir melden uns.",
    ),
    "Sollten Sie bis zum 31. Oktober nichts hören.\nSchritte:\n1. Wir prüfen.\n2. Wir melden uns.",
  );
  // A dash inside a wrapped sentence does not start a list.
  assert.notEqual(
    category({
      subject: "Thank you for applying to Acme",
      bodyText:
        "Thank you for applying. If four weeks pass without\nword from us, please assume that we\n- sadly - have decided to move forward with other candidates.",
    }),
    "rejection",
  );
  // B2: quoted history under a reply is dropped, wrapped or not.
  assert.equal(
    freshBody(
      "Hi Arinze,\n\nyes, we got it, see below.\n\n> Thank you for applying. If you have not heard from us within four\n> weeks, your application was unsuccessful.\n\nBest, Anna",
    ),
    "Hi Arinze,\nyes, we got it, see below.\nBest, Anna",
  );
  // B4: a mail that is nothing but a quotation is read as the quotation.
  const forwarded = verdict({
    subject: "Fwd: Your application at Acme",
    bodyText:
      "> Hi Arinze,\n>\n> Unfortunately we will not be moving\n> forward with your application.\n>\n> Best, Acme",
  });
  assert.equal(forwarded.category, "rejection");
  assert.equal(
    forwarded.evidenceQuote,
    "Unfortunately we will not be moving forward with your application.",
  );
  // B6: a long reply header, also when it is wrapped over two lines.
  for (const header of [
    "On Thu, Oct 8, 2026 at 3:15 PM Acme Talent Acquisition Team <talent-acquisition@careers.acme-corporation.com> wrote:",
    "On Thu, Oct 8, 2026 at 3:15 PM Acme Talent Acquisition Team\n<talent-acquisition@careers.acme-corporation.com> wrote:",
    "Am Do., 8. Okt. 2026 um 15:15 Uhr schrieb Acme Talent Acquisition Team\n<talent-acquisition@careers.acme-corporation.com>:",
  ]) {
    const body = `Hi Arinze,\n\ngood news, the team would like to meet you after all. Are you free on Thursday?\n\n${header}\n> Unfortunately we will not be moving forward with your application.`;
    assert.equal(
      freshBody(body),
      "Hi Arinze,\ngood news, the team would like to meet you after all. Are you free on Thursday?",
      header,
    );
    assert.notEqual(
      category({ subject: "Re: Your application", bodyText: body }),
      "rejection",
    );
  }
});

test("no phrase is matched across the end of a sentence", () => {
  assert.notEqual(
    category({
      subject: "Next steps with Acme",
      bodyText:
        "Hi Arinze,\n\nWe are happy to offer you a short screening. The role is based in Berlin, so we can also meet in person.",
    }),
    "offer",
  );
});

test("a receipt or a notice does not hide a decision in the body", () => {
  for (const [subject, bodyText] of [
    [
      "Thank you for applying to Acme",
      "We have reviewed your documents. Your profile does not match our requirements for this position. We wish you every success.",
    ],
    [
      "Thank you for applying to Globex",
      "We have chosen a candidate whose experience is closer to what we need. We wish you every success.",
    ],
    [
      "Vielen Dank für Ihre Bewerbung",
      "Wir haben Ihre Unterlagen geprüft. Sie sind diesmal nicht in die engere Auswahl gekommen.",
    ],
    [
      "Interview confirmation: Senior Frontend Engineer",
      "Hi Arinze,\n\nI am afraid we have to withdraw the invitation. The budget for this role was cut this morning.",
    ],
  ])
    assert.notEqual(category({ subject, bodyText }), "confirmation", bodyText);
  assert.equal(
    graded({
      subject: "Thank you for your application to Acme",
      bodyText:
        "Thank you for your interest in Acme. We will not be able to offer you a position at this time. We wish you all the best.",
    }),
    "rejection/high",
  );
  // The same words as a house rule leave the receipt a receipt.
  assert.equal(
    category({
      subject: "Thank you for applying to Acme",
      bodyText:
        "We have received your application. If your profile does not match, we will let you know.",
    }),
    "confirmation",
  );
  // G9: a privacy word in the subject is no notice when the body decides.
  assert.equal(
    graded({
      subject: "Your application at Acme: outcome and data retention",
      bodyText:
        "Hi Arinze,\n\nUnfortunately we will not be moving forward with your application. We will keep your data for six months.",
    }),
    "rejection/high",
  );
  assert.equal(
    category({
      subject: "Privacy and Compliance Notification from flaconi",
      bodyText: "This notice concerns your application data at flaconi.",
    }),
    "notice",
  );
});

test("a hiring step is not filed as product or event mail", () => {
  for (const [subject, bodyText] of [
    [
      "Feedback session for your coding challenge",
      "Hi Arinze,\n\nthanks for sending in the challenge. We'd like to invite you to a 45-minute feedback session with two of our engineers on Thursday.",
    ],
    [
      "Einladung zum Workshop-Tag bei Acme",
      "Hallo Arinze,\n\nwir möchten dich gerne zu unserem Workshop-Tag einladen, dem letzten Schritt in unserem Prozess. Passt dir der 22. Oktober?",
    ],
  ])
    assert.notEqual(
      category({ subject, bodyText, fromAddress: "jobs@acme.com" }),
      "unrelated",
      subject,
    );
});

test("statements about what would happen are not what happened", () => {
  const receipt = "We have received your application.\n\n";
  for (const [subject, bodyText] of [
    // Present tense is the house rule; "has been" or "was" is the outcome.
    [
      "Thank you for applying to Acme",
      `${receipt}In the event that your application is unsuccessful, we will retain your personal data for six months.`,
    ],
    [
      "Thank you for applying to Acme",
      `${receipt}Even if your application is not successful this time, we will keep you posted on future roles.`,
    ],
    [
      "Thank you for applying to Acme",
      `${receipt}We keep your documents for six months from the date your application was rejected or withdrawn.`,
    ],
    // A question is not a statement.
    [
      "Application received",
      `${receipt}FAQ\nYour application was unsuccessful? You can ask us for feedback at any time.`,
    ],
    // German puts the verb first to say "if".
    [
      "Vielen Dank für Ihre Bewerbung",
      "wir haben Ihre Bewerbung erhalten.\n\nDatenschutz: Entscheiden wir uns für einen anderen Bewerber, werden Ihre Daten nach sechs Monaten gelöscht.",
    ],
    [
      "Eingangsbestätigung Ihrer Bewerbung",
      "wir haben Ihre Bewerbung erhalten.\n\nWird Ihre Bewerbung nicht berücksichtigt, speichern wir Ihre Daten für sechs Monate.",
    ],
    [
      "Vielen Dank für Ihre Bewerbung",
      "wir haben Ihre Bewerbung erhalten. Auch wenn Sie nicht in die engere Auswahl kommen, melden wir uns bei Ihnen.",
    ],
    [
      "Eingangsbestätigung Ihrer Bewerbung",
      "wir haben Ihre Bewerbung erhalten.\n\nFür den Fall, dass wir Ihre Bewerbung nicht berücksichtigen können, speichern wir Ihre Daten für weitere sechs Monate.",
    ],
    // A description of the process asks for nothing yet.
    [
      "Thank you for applying to Acme",
      `${receipt}What to expect: First, our recruiter reviews your CV. Then we will ask you to complete a short take-home assignment. Finally there are two interviews.`,
    ],
    [
      "Thanks for applying to Acme",
      `${receipt}Great profiles move fast here: we would love to invite you to a first interview as soon as our team has reviewed your CV.`,
    ],
    // A copy of the form's answers asks nothing.
    [
      "Thanks for applying to Acme",
      `${receipt}Here is a copy of your answers:\nWhat are your salary expectations? 85000 EUR\nWhen could you start? 01.12.2026`,
    ],
    [
      "Thanks for applying to Acme",
      `${receipt}A missing cover letter will not take your application out of the running.`,
    ],
  ])
    assert.equal(category({ subject, bodyText }), "confirmation", bodyText);
  // An invitation and a refusal in one mail: neither is taken.
  assert.equal(
    category({
      subject: "Next step",
      bodyText:
        "We would like to invite you to an interview next week. We are progressing with other candidates at the same time, so a quick reply would help.",
    }),
    null,
  );
});
