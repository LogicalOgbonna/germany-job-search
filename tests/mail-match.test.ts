import test from "node:test";
import assert from "node:assert/strict";
import { employerFromAddress, isHiringSystem } from "../src/lib/mail/senders";
import {
  companyEvidence,
  matchMail,
  normalizeCompany,
} from "../src/lib/mail/match";
import type {
  BoardApplication,
  Classification,
  RawMail,
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
const verdict = (over: Partial<Classification> = {}): Classification => ({
  category: "confirmation",
  confidence: "high",
  decidedBy: "test",
  evidenceQuote: null,
  company: null,
  role: null,
  nextStep: null,
  deadline: null,
  ...over,
});
const app = (over: Partial<BoardApplication> = {}): BoardApplication => ({
  id: "a1",
  company: "Peec AI",
  title: "Senior Frontend Engineer",
  status: "submitted",
  origin: "jobdesk",
  submittedAt: new Date("2026-10-12T10:00:00Z"),
  threadIds: [],
  ...over,
});
const komma = [
  app({
    id: "product",
    company: "1KOMMA5°",
    title: "(Senior) Product Engineer (m/f/d)",
  }),
  app({
    id: "fullstack",
    company: "1KOMMA5°",
    title: "Senior Full-Stack Software Engineer (m/f/d)",
  }),
];

test("employer is read from hiring-system addresses that carry one", () => {
  const cases: [string, string | null][] = [
    ["xolife-jobs@m.personio.de", "xolife"],
    ["cello-jobs@m.personio.com", "cello"],
    ["wire-1-jobs@m.personio.de", "wire"],
    ["zdf-sparks-jobs@m.personio.de", "zdf-sparks"],
    ["no-reply@aignostics.teamtailor-mail.com", "aignostics"],
    ["e+abc@epilot.recruitee.com", "epilot"],
    ["zalando@myworkday.com", "zalando"],
    ["accenture@otp.workday.com", "accenture"],
    ["christina.griese@encentive.msg.join.com", "encentive"],
    ["notifications@optibus.comeet-notifications.com", "optibus"],
    ["correspondenceottobock@productsdc12pm.successfactors.eu", "ottobock"],
    ["no-reply@ashbyhq.com", null],
    ["no-reply@msg.join.com", null],
    ["no-reply@successfactors.eu", null],
    ["conversations@message.teamtailor.com", null],
    ["noreply@recruiteemail.com", null],
    ["notifications@app.bamboohr.com", null],
    ["no-reply@us.greenhouse-mail.io", null],
    ["no-reply@myworkday.com", null],
    ["jobs@envelio.de", null],
    ["not an address", null],
  ];
  for (const [address, employer] of cases)
    assert.equal(employerFromAddress(address), employer, address);
});
test("hiring systems are recognised and employers' own domains are not", () => {
  for (const address of [
    "no-reply@us.greenhouse-mail.io",
    "no-reply@eu.greenhouse.io",
    "no-reply@hire.lever.co",
    "mail@hire.eu.lever.co",
    "noreply@candidates.workablemail.com",
    "jobs-noreply@linkedin.com",
    "inmail-hit-reply@linkedin.com",
    "notification@smartrecruiters.com",
    "no-reply@ashbyhq.com",
    "xolife-jobs@m.personio.de",
    "no-reply@msg.join.com",
    "david.oster@riiicocom.msg.join.com",
    "zalando@myworkday.com",
    "no-reply@aignostics.teamtailor-mail.com",
    "conversations@message.teamtailor.com",
    "e+abc@epilot.recruitee.com",
    "noreply@recruiteemail.com",
    "correspondenceottobock@productsdc12pm.successfactors.eu",
    "notifications@app.bamboohr.com",
    "notifications@app.softgarden.io",
    "team@hi.wellfound.com",
    "m.pehar@instaffo.com",
    "no-reply@hibob.com",
    "no-reply@gem.com",
    "no-reply@pinpoint.email",
    "no-reply@ats.rippling.com",
    "notifications@optibus.comeet-notifications.com",
    "No-Reply@Hire.Lever.co",
  ])
    assert.equal(isHiringSystem(address), true, address);
  for (const address of [
    "jobs@envelio.de",
    "someone@gmail.com",
    "messages-noreply@linkedin.com",
    "jobalerts-noreply@linkedin.com",
    "jobs-listings@linkedin.com",
    "jobs@notashbyhq.com",
    "no-reply@ashbyhq.com.attacker.example",
    "people@rippling.com",
    "",
  ])
    assert.equal(isHiringSystem(address), false, address);
});
test("company names are compared without case, accents, legal form or punctuation", () => {
  assert.equal(normalizeCompany("Peec AI"), "peecai");
  assert.equal(normalizeCompany("1KOMMA5°"), "1komma5");
  assert.equal(normalizeCompany("Emidat GmbH"), "emidat");
  assert.equal(normalizeCompany("Trading 212"), normalizeCompany("Trading212"));
  assert.equal(normalizeCompany("eRecht24 GmbH & Co. KG"), "erecht24");
  assert.equal(normalizeCompany("Riese & Müller"), "riesemuller");
  assert.equal(normalizeCompany("Storio Group"), "storio");
  assert.equal(normalizeCompany("Group"), "group");
  assert.equal(normalizeCompany(" °! "), "");
});
test("company evidence comes from the sender and the subject", () => {
  assert.ok(
    companyEvidence(mail({ fromAddress: "jobs@envelio.de" }), verdict())
      .map(normalizeCompany)
      .includes("envelio"),
  );
  const ashby = companyEvidence(
    mail({ subject: "Thanks for applying to Peec AI!" }),
    verdict(),
  );
  assert.ok(ashby.includes("Peec AI"));
  assert.ok(!ashby.map(normalizeCompany).includes("ashbyhq"));
  const gmail = companyEvidence(
    mail({
      fromAddress: "someone@gmail.com",
      fromName: "Some One",
      subject: "Your application at Raisin",
    }),
    verdict(),
  );
  assert.deepEqual(gmail, ["Raisin"]);
});
test("company evidence is ordered best first and never repeats a company", () => {
  assert.deepEqual(
    companyEvidence(
      mail({
        fromAddress: "xolife-jobs@m.personio.de",
        fromName: "XO Life Recruiting",
        subject: "Your application at XO Life GmbH",
      }),
      verdict({ company: "XO Life" }),
    ),
    ["XO Life"],
  );
  assert.deepEqual(
    companyEvidence(
      mail({
        fromAddress: "1komma5grad-jobs@m.personio.de",
        fromName: "1KOMMA5° Recruiting",
        subject: "Feedback on your application | Product Engineer | 1KOMMA5°",
      }),
      verdict({ company: "Finanzcheck" }),
    ),
    ["Finanzcheck", "1komma5grad", "1KOMMA5°"],
  );
  assert.deepEqual(
    companyEvidence(
      mail({
        fromAddress: "kim.lapitan@helloconnect.org",
        fromName: "Kim Lapitan",
        subject: "Invitation: Your Virtual Interview with HelloFresh",
      }),
      verdict(),
    ),
    ["helloconnect", "HelloFresh"],
  );
  assert.deepEqual(
    companyEvidence(
      mail({
        fromAddress: "careers@raisin.com",
        fromName: "Raisin Careers",
        subject: "Thank you for applying to Raisin",
      }),
      verdict(),
    ),
    ["Raisin"],
  );
});
test("sender display names give a company only when they name one", () => {
  const names = (fromName: string, fromAddress: string) =>
    companyEvidence(mail({ fromName, fromAddress }), verdict());
  assert.deepEqual(names("Peec AI Hiring Team", "no-reply@ashbyhq.com"), [
    "Peec AI",
  ]);
  assert.deepEqual(names("Pascal from Langdock", "pascal@langdock.com"), [
    "Langdock",
  ]);
  assert.deepEqual(names("Samuel Nyarko", "samuel.nyarko@raisin.com"), [
    "raisin",
  ]);
  assert.deepEqual(names("Amar Besic", "abesic@quantum-systems.com"), [
    "quantum-systems",
  ]);
  assert.deepEqual(names("LinkedIn", "jobs-noreply@linkedin.com"), []);
  assert.deepEqual(
    names("Jane Doe via LinkedIn", "inmail-hit-reply@linkedin.com"),
    [],
  );
  assert.deepEqual(
    names("Google Calendar", "calendar-notification@google.com"),
    [],
  );
});
test("subject phrases name the company, not the role", () => {
  const names = (subject: string) =>
    companyEvidence(mail({ subject }), verdict());
  const cases: [string, string[]][] = [
    [
      "Arinze, your application was sent to Redcare Pharmacy",
      ["Redcare Pharmacy"],
    ],
    [
      "Your application to Senior Frontend Developer (m/w/d) at Purple",
      ["Purple"],
    ],
    ["Your application was viewed by Redcare Pharmacy", ["Redcare Pharmacy"]],
    [
      "Deine Bewerbung bei Lucid Labs als Full-Stack Engineer (m/w/d)",
      ["Lucid Labs"],
    ],
    ["Follow-up on your application @lemlist", ["lemlist"]],
    ["Thank you for your application to join Zalando!", ["Zalando"]],
    ["Thanks for your interest in Orum, Ogbonna", ["Orum"]],
    ["LIQID | Invitation to second interview", ["LIQID"]],
    ["Kit: We're moving forward with other candidates", ["Kit"]],
    ["8returns Application Update", ["8returns"]],
    ["Regarding your Helsing application", ["Helsing"]],
    [
      "Feedback on your application | Senior Full-Stack Software Engineer (m/f/d) | 1KOMMA5°",
      ["1KOMMA5°"],
    ],
    ["Invitation: Interview with Raisin @ Tue Apr 21, 2026", ["Raisin"]],
    [
      "We received your application for a position at Text Cortex AI UG (haftungsbeschränkt)",
      ["Text Cortex AI UG"],
    ],
    ["Your application was viewed by Decadis", ["Decadis"]],
    [
      "Thank you for your application to Octopus Energy Group",
      ["Octopus Energy Group"],
    ],
    ["We received your application for a position at JOIN", ["JOIN"]],
    ["Your job application with doinstruct Software GmbH", ["doinstruct"]],
    [
      "Wir haben deine Bewerbung für die Position bei encentive erhalten",
      ["encentive"],
    ],
    ["Thank you for applying to Cresta's Engineering Team!", ["Cresta"]],
    ["Raisin Talent Acquisition Interview Availability", ["Raisin"]],
    ["TeamViewer has received your application!", ["TeamViewer"]],
    ["Lead Full Stack Engineer (Node.js, React/Vue) - CoverGo", ["CoverGo"]],
    ["Thank you for your application! (AMBOSS)", ["AMBOSS"]],
    ["Application to CoW DAO successfully submitted (Wellfound)", ["CoW DAO"]],
    ["Your application to React Typescript Developer at Purple", ["Purple"]],
    ["Looking forward to hearing from you", []],
    [
      "Arinze, your application was sent to Morson Edge (Technology)",
      ["Morson Edge"],
    ],
    ["Updates about your application to Topsort - Integrations", ["Topsort"]],
    ["Update on your application", []],
    ["Arinze, don't forget to complete your application", []],
    ["Your application as Senior Full Stack Developer (m/f/d)", []],
  ];
  for (const [subject, expected] of cases)
    assert.deepEqual(names(subject), expected, subject);
});
test("mail I sent offers no sender evidence", () => {
  assert.deepEqual(
    companyEvidence(
      mail({
        fromMe: true,
        fromAddress: "arinze@example.org",
        fromName: "Arinze Ogbonna",
        subject: "Re: Interview w/ HelloFresh",
      }),
      verdict(),
    ),
    ["HelloFresh"],
  );
});
test("a linked thread beats a company match", () => {
  const result = matchMail(
    mail({ threadId: "t9", subject: "Thanks for applying to Peec AI!" }),
    verdict(),
    [app({ id: "first" }), app({ id: "second", threadIds: ["t9"] })],
  );
  assert.deepEqual(result, {
    kind: "unique",
    applicationId: "second",
    reason: "thread",
    corroborated: true,
  });
});
const acmeThread = () => [
  app({ id: "acme", company: "Acme GmbH", threadIds: ["shared"] }),
  app({ id: "globex", company: "Globex" }),
];
const inThread = (over: Partial<RawMail>) =>
  mail({ threadId: "shared", subject: "Update on your application", ...over });
test("a thread match does not hold when the sender names another company", () => {
  const review = {
    kind: "ambiguous",
    candidateIds: ["acme"],
    reason: "thread, but the mail names another company",
  };
  for (const over of [
    { fromName: "Globex Hiring Team" },
    { subject: "Thanks for applying to Globex" },
    { fromAddress: "jobs@globex.com" },
    { fromAddress: "globex-jobs@m.personio.de" },
    { fromAddress: "talent@agency.example", fromName: "Globex Recruiting" },
  ])
    assert.deepEqual(
      matchMail(inThread(over), verdict(), acmeThread()),
      review,
      JSON.stringify(over),
    );
});
test("a thread match holds for the employer, a carrier and a short reply", () => {
  const unique = {
    kind: "unique",
    applicationId: "acme",
    reason: "thread",
    corroborated: true,
  };
  for (const over of [
    {},
    { fromName: "Acme Hiring Team" },
    { subject: "Update on your application to Acme" },
    { fromAddress: "jobs@acme.com", subject: "Re: Next steps" },
    { fromAddress: "someone@gmail.com", fromName: "Tom", subject: "Re: Hi" },
    { fromAddress: "me@example.org", fromMe: true, subject: "Re: Next steps" },
    {
      fromAddress: "calendar-notification@google.com",
      subject: "Invitation: Interview",
    },
    // The sender is an agency or a parent company, but the subject names the card's company.
    { fromAddress: "tom@hays.de", subject: "Re: Your application at Acme" },
    // Only the classified company (which may come from the body or a model) differs.
    { fromAddress: "someone@gmail.com", subject: "Re: Hi", company: "Globex" },
  ]) {
    const { company = null, ...rest } = over as Partial<RawMail> & {
      company?: string;
    };
    assert.deepEqual(
      matchMail(inThread(rest), verdict({ company }), acmeThread()),
      unique,
      JSON.stringify(over),
    );
  }
});
test("a thread linked to several applications is ambiguous", () => {
  const result = matchMail(mail({ threadId: "t9" }), verdict(), [
    app({ id: "a", threadIds: ["t9"] }),
    app({ id: "b", threadIds: ["t9"] }),
    app({ id: "c" }),
  ]);
  assert.equal(result.kind, "ambiguous");
  assert.deepEqual(result.kind === "ambiguous" && result.candidateIds, [
    "a",
    "b",
  ]);
});
test("one application at the company is a unique match", () => {
  const result = matchMail(
    mail({ subject: "Thanks for applying to Peec AI!" }),
    verdict(),
    [app({ id: "peec" }), app({ id: "kit", company: "Kit" })],
  );
  assert.deepEqual(result, {
    kind: "unique",
    applicationId: "peec",
    reason: "company",
    corroborated: true,
  });
});
test("the classified company and the sender address both identify the card", () => {
  const board = [
    app({ id: "komma", company: "1KOMMA5°" }),
    app({ id: "emidat", company: "Emidat" }),
    app({ id: "light", company: "Lightspeed" }),
  ];
  const id = (m: RawMail, c = verdict()) => {
    const result = matchMail(m, c, board);
    return result.kind === "unique" ? result.applicationId : result.kind;
  };
  assert.equal(
    id(mail({ fromAddress: "1komma5grad-jobs@m.personio.de" })),
    "komma",
  );
  assert.equal(id(mail(), verdict({ company: "Emidat GmbH" })), "emidat");
  assert.equal(id(mail({ fromAddress: "no-reply@lightspeedhq.com" })), "light");
});
test("the role in the subject picks one of several applications", () => {
  const result = matchMail(
    mail({
      fromAddress: "1komma5grad-jobs@m.personio.de",
      subject:
        "Feedback on your application | Senior Full-Stack Software Engineer (m/f/d) | 1KOMMA5°",
    }),
    verdict({ category: "rejection" }),
    komma,
  );
  assert.deepEqual(result, {
    kind: "unique",
    applicationId: "fullstack",
    reason: "company+role",
    corroborated: true,
  });
});
test("the classified role picks one of several applications", () => {
  const result = matchMail(
    mail({
      fromAddress: "1komma5grad-jobs@m.personio.de",
      subject: "Update on your application",
    }),
    verdict({ role: "Product Engineer" }),
    komma,
  );
  assert.equal(result.kind === "unique" && result.applicationId, "product");
});
test("several applications and no role in the mail is ambiguous", () => {
  const result = matchMail(
    mail({
      fromAddress: "1komma5grad-jobs@m.personio.de",
      subject: "Update on your application",
    }),
    verdict({ category: "rejection" }),
    komma,
  );
  assert.equal(result.kind, "ambiguous");
  assert.deepEqual(result.kind === "ambiguous" && result.candidateIds, [
    "product",
    "fullstack",
  ]);
});
test("a role that fits two applications is ambiguous", () => {
  const board = [
    app({ id: "a", company: "Zalando", title: "Senior Software Engineer" }),
    app({
      id: "b",
      company: "Zalando",
      title: "Software Engineer - Transactions",
    }),
  ];
  const result = matchMail(
    mail({ fromAddress: "zalando@myworkday.com" }),
    verdict({ role: "Software Engineer" }),
    board,
  );
  assert.equal(result.kind, "ambiguous");
});
test("the more specific of two titles in the subject wins", () => {
  const board = [
    app({ id: "plain", company: "Zalando", title: "Software Engineer" }),
    app({
      id: "senior",
      company: "Zalando",
      title: "Senior Software Engineer (all genders)",
    }),
  ];
  const result = matchMail(
    mail({
      fromAddress: "zalando@myworkday.com",
      subject: "Regarding your application for Senior Software Engineer",
    }),
    verdict(),
    board,
  );
  assert.equal(result.kind === "unique" && result.applicationId, "senior");
});
test("a title with another grade in front is a different role", () => {
  const board = [
    app({ id: "plain", company: "Zalando", title: "Software Engineer" }),
    app({ id: "backend", company: "Zalando", title: "Backend Engineer" }),
  ];
  const result = matchMail(
    mail({
      fromAddress: "zalando@myworkday.com",
      subject: "Regarding your application for Senior Software Engineer",
    }),
    verdict(),
    board,
  );
  assert.equal(result.kind, "ambiguous");
});
const smava = (title: string) => [
  app({ id: "smava", company: "Smava", title }),
];
const fromSmava = (subject: string, over: Partial<RawMail> = {}) =>
  mail({ fromAddress: "no-reply@smavatalent.de", subject, ...over });
test("the same role with different decoration still matches the only card", () => {
  const unique = {
    kind: "unique",
    applicationId: "smava",
    reason: "company",
    corroborated: true,
  };
  assert.deepEqual(
    matchMail(
      fromSmava(
        "Your application - Senior Frontend Engineer (f/m/d) - TypeScript & React",
      ),
      verdict(),
      smava("Senior Frontend Engineer"),
    ),
    unique,
  );
  assert.deepEqual(
    matchMail(
      fromSmava("Update on your application"),
      verdict({ role: "Frontend Software Engineer" }),
      smava("Software Engineer (Frontend)"),
    ),
    unique,
  );
  assert.deepEqual(
    matchMail(
      fromSmava("Your application as Senior Frontend Engineer (m/w/d)"),
      verdict({ role: "Senior Frontend Engineer" }),
      smava("Frontend Engineer"),
    ),
    unique,
  );
  assert.deepEqual(
    matchMail(
      fromSmava(
        "Deine Bewerbung als Senior Frontend Entwickler – React (m/w/d)",
      ),
      verdict(),
      smava("Senior Frontend Developer"),
    ),
    unique,
  );
  assert.deepEqual(
    matchMail(
      fromSmava("Your application as Full Stack AI Engineer (all) at Smava"),
      verdict(),
      smava("Full Stack Engineer"),
    ),
    unique,
  );
  assert.deepEqual(
    matchMail(
      fromSmava("Senior Software Engineer, Frontend - Thank you for applying"),
      verdict(),
      smava("Senior Frontend Engineer (m/f/d)"),
    ),
    unique,
  );
  assert.deepEqual(
    matchMail(
      fromSmava("Arinze, we received your application for Frontend Developer"),
      verdict(),
      smava("Senior Frontend Engineer"),
    ),
    unique,
  );
});
test("a mail about a different role is not matched to the only card", () => {
  const review = {
    kind: "ambiguous",
    candidateIds: ["smava"],
    reason: "company, but the mail names a different role",
  };
  assert.deepEqual(
    matchMail(
      fromSmava("Your application as Senior Backend Engineer (f/m/d)"),
      verdict({ category: "rejection" }),
      smava("Senior Frontend Engineer"),
    ),
    review,
  );
  assert.deepEqual(
    matchMail(
      fromSmava("Update on your application"),
      verdict({ category: "rejection", role: "Data Engineer" }),
      smava("Product Engineer"),
    ),
    review,
  );
  assert.deepEqual(
    matchMail(
      fromSmava("Your application for Engineering Manager at Smava"),
      verdict({ category: "rejection" }),
      smava("Frontend Engineer (m/f/d)"),
    ),
    review,
  );
  for (const subject of [
    "Your application for Staff Frontend Engineer at Smava",
    "Your application for Software Engineer, Platform at Smava",
    "Your application as Software Engineer TypeScript - Payments",
    "Deine Bewerbung als Softwareentwickler Backend (m/w/d)",
  ])
    assert.deepEqual(
      matchMail(
        fromSmava(subject),
        verdict({ category: "rejection" }),
        smava("Senior Frontend Engineer"),
      ),
      review,
      subject,
    );
  assert.deepEqual(
    matchMail(
      fromSmava("Update on your application"),
      verdict({ category: "rejection", role: "Staff Frontend Engineer" }),
      smava("Senior Frontend Engineer"),
    ),
    review,
  );
});
test("a mail that states no role matches the only card", () => {
  const board = smava("Senior Frontend Engineer");
  for (const subject of [
    "Update on your application",
    "Thank you for applying to Smava",
    "Invitation: Interview with the Hiring Manager",
    "Your interview with our Engineering Manager",
  ])
    assert.equal(
      matchMail(fromSmava(subject), verdict(), board).kind,
      "unique",
      subject,
    );
  assert.equal(
    matchMail(fromSmava("Next steps"), verdict({ role: "Bewerbung" }), board)
      .kind,
    "unique",
  );
  assert.equal(
    matchMail(
      fromSmava("Your application as Backend Engineer"),
      verdict(),
      smava("Role not stated"),
    ).kind,
    "unique",
  );
});
test("role words inside the company name are not the role", () => {
  const board = [
    app({ id: "minds", company: "Data Minds", title: "Frontend Engineer" }),
  ];
  for (const subject of [
    "Thanks for applying to Data Minds!",
    "Your application as Frontend Engineer at Data Minds",
  ])
    assert.equal(
      matchMail(mail({ subject }), verdict(), board).kind,
      "unique",
      subject,
    );
});
test("a thread match does not hold when the mail names a different role", () => {
  const board = smava("Senior Frontend Engineer");
  board[0].threadIds = ["t7"];
  const review = {
    kind: "ambiguous",
    candidateIds: ["smava"],
    reason: "thread, but the mail names a different role",
  };
  assert.deepEqual(
    matchMail(
      fromSmava("Your application as Senior Backend Engineer", {
        threadId: "t7",
      }),
      verdict(),
      board,
    ),
    review,
  );
  // The role is stated only in the body, so only the classification carries it.
  assert.deepEqual(
    matchMail(
      fromSmava("Re: Your application at Smava", { threadId: "t7" }),
      verdict({ category: "rejection", role: "Engineering Manager" }),
      board,
    ),
    review,
  );
  assert.deepEqual(
    matchMail(
      fromSmava("Re: Your application at Smava", { threadId: "t7" }),
      verdict({ role: "Frontend Engineer" }),
      board,
    ),
    {
      kind: "unique",
      applicationId: "smava",
      reason: "thread",
      corroborated: true,
    },
  );
});
test("a role stated only in the body decides for the only card at a company", () => {
  const board = smava("Senior Frontend Engineer");
  const about = (role: string) =>
    matchMail(
      fromSmava("Your application at Smava"),
      verdict({ category: "rejection", role }),
      board,
    );
  for (const role of ["Product Designer", "Data Engineer", "Office Manager"])
    assert.deepEqual(
      about(role),
      {
        kind: "ambiguous",
        candidateIds: ["smava"],
        reason: "company, but the mail names a different role",
      },
      role,
    );
  assert.equal(about("Backend-Entwickler (m/w/d)").kind, "ambiguous");
  assert.equal(about("Senior Frontend Entwickler (m/w/d)").kind, "unique");
});
test("a name that only starts like the card's company is not corroborated by a hiring system", () => {
  const flag = (m: RawMail, company: string, c = verdict()) => {
    const result = matchMail(m, c, [app({ id: "card", company })]);
    return result.kind === "unique" ? result.corroborated : result.kind;
  };
  assert.equal(
    flag(
      mail({
        fromName: "Plato Systems Hiring Team",
        subject: "Thank you for applying to Plato Systems",
      }),
      "Plato",
      verdict({ company: "Plato Systems" }),
    ),
    false,
  );
  assert.equal(
    flag(mail({ subject: "Thanks for applying to Grafana!" }), "Grafana Labs"),
    false,
  );
  assert.equal(
    flag(
      mail({
        fromAddress: "careers@other.example",
        fromName: "Plato Systems Careers",
      }),
      "Plato",
    ),
    false,
  );
  // Equal names, and names read from the sender's address, still count.
  assert.equal(
    flag(mail({ subject: "Thanks for applying to Plato!" }), "Plato GmbH"),
    true,
  );
  assert.equal(
    flag(mail({ fromAddress: "no-reply@smavatalent.de" }), "Smava"),
    true,
  );
  assert.equal(
    flag(mail({ fromAddress: "1komma5grad-jobs@m.personio.de" }), "1KOMMA5°"),
    true,
  );
  assert.equal(
    flag(mail({ fromAddress: "no-reply@grafana.com" }), "Grafana Labs"),
    true,
  );
});
test("a shorter or longer spelling of a board company goes to review, not to a second card", () => {
  const board = [
    app({ id: "eye", company: "Eye Security" }),
    app({ id: "kit", company: "Kit" }),
    app({ id: "xo", company: "XO Life" }),
  ];
  const result = (subject: string, receivedAt = "2026-10-13T09:00:00Z") =>
    matchMail(
      mail({ subject, receivedAt: new Date(receivedAt) }),
      verdict(),
      board,
    );
  assert.deepEqual(result("Thanks for applying to Eye"), {
    kind: "ambiguous",
    candidateIds: ["eye"],
    reason: "a similar company name is on the board",
  });
  assert.deepEqual(
    result("Thanks for applying to Kit Labs").kind === "ambiguous" &&
      result("Thanks for applying to Kit Labs"),
    {
      kind: "ambiguous",
      candidateIds: ["kit"],
      reason: "a similar company name is on the board",
    },
  );
  // Same first word but a different company, a first word under 3 characters, a name
  // inside another word, and mail from long before the card: all still no match.
  assert.equal(result("Thanks for applying to Eye Care").kind, "none");
  assert.equal(result("Thanks for applying to XO").kind, "none");
  assert.equal(result("Thanks for applying to Kitchen Stories").kind, "none");
  assert.equal(
    result("Thanks for applying to Eye", "2026-03-01T09:00:00Z").kind,
    "none",
  );
});
test("a match says whether the sender backs the company it names", () => {
  const acme = [app({ id: "acme", company: "Acme GmbH" })];
  const flag = (m: RawMail, c = verdict(), board = acme) => {
    const result = matchMail(m, c, board);
    return result.kind === "unique" ? result.corroborated : result.kind;
  };
  const linked = [app({ id: "acme", company: "Acme GmbH", threadIds: ["t5"] })];
  assert.equal(
    flag(
      mail({ threadId: "t5", fromAddress: "random@gmail.com" }),
      verdict(),
      linked,
    ),
    true,
  );
  assert.equal(
    flag(mail({ fromAddress: "jobs@envelio.de" }), verdict(), [
      app({ company: "envelio" }),
    ]),
    true,
  );
  assert.equal(
    flag(mail({ subject: "Thanks for applying to Peec AI!" }), verdict(), [
      app(),
    ]),
    true,
  );
  assert.equal(
    flag(
      mail({ fromAddress: "no-reply@us.greenhouse-mail.io" }),
      verdict({ company: "Acme" }),
    ),
    true,
  );
  assert.equal(
    flag(
      mail({
        fromAddress: "talent@otheragency.com",
        fromName: "Acme Careers",
        subject: "Update on your application",
      }),
    ),
    true,
  );
  assert.equal(
    flag(
      mail({
        fromAddress: "xolife-jobs@m.personio.de",
        subject: "Thank you for your application",
      }),
      verdict({ company: "XO Life" }),
      [app({ company: "XOLife" })],
    ),
    true,
  );
  assert.equal(
    flag(
      mail({
        fromAddress: "random@gmail.com",
        fromName: "Acme Careers",
        subject: "Your application at Acme",
      }),
    ),
    false,
  );
  assert.equal(
    flag(
      mail({ fromAddress: "recruiter@otheragency.com" }),
      verdict({ company: "Acme" }),
    ),
    false,
  );
  assert.equal(
    flag(
      mail({
        fromAddress: "calendar-notification@google.com",
        subject: "Invitation: Interview with Acme",
      }),
    ),
    false,
  );
  assert.equal(
    flag(
      mail({
        fromAddress: "me@example.org",
        fromMe: true,
        subject: "Re: Your application at Acme",
      }),
    ),
    false,
  );
});
test("the role pick reports corroboration too", () => {
  const result = matchMail(
    mail({
      fromAddress: "random@gmail.com",
      subject:
        "Feedback on your application | Senior Full-Stack Software Engineer (m/f/d) | 1KOMMA5°",
    }),
    verdict(),
    komma,
  );
  assert.deepEqual(result, {
    kind: "unique",
    applicationId: "fullstack",
    reason: "company+role",
    corroborated: false,
  });
});
test("mail from before an unsubmitted card existed cannot be about it", () => {
  const queued = (createdAt?: Date) => [
    app({ status: "queued", submittedAt: null, createdAt }),
  ];
  const peec = (receivedAt: string) =>
    mail({
      subject: "Thanks for applying to Peec AI!",
      receivedAt: new Date(receivedAt),
    });
  const created = new Date("2026-10-10T08:00:00Z");
  assert.equal(
    matchMail(peec("2026-02-03T09:00:00Z"), verdict(), queued(created)).kind,
    "none",
  );
  assert.equal(
    matchMail(peec("2026-10-11T09:00:00Z"), verdict(), queued(created)).kind,
    "unique",
  );
  assert.equal(
    matchMail(peec("2026-10-09T12:00:00Z"), verdict(), queued(created)).kind,
    "unique",
  );
  assert.equal(
    matchMail(peec("2026-02-03T09:00:00Z"), verdict(), queued()).kind,
    "unique",
  );
  // A submission date, when there is one, is what counts.
  assert.equal(
    matchMail(peec("2026-09-20T09:00:00Z"), verdict(), [
      app({
        submittedAt: new Date("2026-09-19T10:00:00Z"),
        createdAt: new Date("2026-10-10T08:00:00Z"),
      }),
    ]).kind,
    "unique",
  );
});
test("mail a few days older than the application goes to review, not to a second card", () => {
  const board = [app({ submittedAt: new Date("2026-10-05T10:00:00Z") })];
  const peec = (receivedAt: string) =>
    mail({
      subject: "Thanks for applying to Peec AI!",
      receivedAt: new Date(receivedAt),
    });
  assert.deepEqual(matchMail(peec("2026-10-03T08:00:00Z"), verdict(), board), {
    kind: "ambiguous",
    candidateIds: ["a1"],
    reason: "company, but the mail is older than the application",
  });
  assert.equal(
    matchMail(peec("2026-09-21T11:00:00Z"), verdict(), board).kind,
    "ambiguous",
  );
  assert.equal(
    matchMail(peec("2026-09-21T09:00:00Z"), verdict(), board).kind,
    "none",
  );
  assert.deepEqual(
    matchMail(peec("2026-10-03T08:00:00Z"), verdict(), [
      app({
        id: "queued",
        submittedAt: null,
        createdAt: new Date("2026-10-08T10:00:00Z"),
      }),
      app({ id: "spring", submittedAt: new Date("2027-03-01T10:00:00Z") }),
    ]),
    {
      kind: "ambiguous",
      candidateIds: ["queued"],
      reason: "company, but the mail is older than the application",
    },
  );
});
test("an application submitted after the mail cannot match it", () => {
  const result = matchMail(
    mail({
      subject: "Thanks for applying to Peec AI!",
      receivedAt: new Date("2026-03-01T09:00:00Z"),
    }),
    verdict(),
    [app({ submittedAt: new Date("2026-10-12T10:00:00Z") })],
  );
  assert.equal(result.kind, "none");
});
test("the date guard allows one day and keeps cards without a submission date", () => {
  const received = new Date("2026-10-12T09:00:00Z");
  const peec = mail({
    subject: "Thanks for applying to Peec AI!",
    receivedAt: received,
  });
  assert.equal(
    matchMail(peec, verdict(), [
      app({ submittedAt: new Date("2026-10-12T20:00:00Z") }),
    ]).kind,
    "unique",
  );
  assert.equal(
    matchMail(peec, verdict(), [app({ submittedAt: null })]).kind,
    "unique",
  );
  const result = matchMail(peec, verdict(), [
    app({ id: "old", submittedAt: new Date("2026-09-01T10:00:00Z") }),
    app({ id: "later", submittedAt: new Date("2026-10-20T10:00:00Z") }),
  ]);
  assert.equal(result.kind === "unique" && result.applicationId, "old");
});
test("no application at the company is no match", () => {
  assert.equal(
    matchMail(mail({ subject: "Thanks for applying to Peec AI!" }), verdict(), [
      app({ company: "Kit" }),
      app({ company: "Langdock" }),
    ]).kind,
    "none",
  );
  assert.equal(matchMail(mail(), verdict(), [app()]).kind, "none");
  assert.equal(matchMail(mail(), verdict(), []).kind, "none");
});
test("a company name inside a longer word or phrase is not a match", () => {
  const board = [
    app({ id: "develop", company: "develop" }),
    app({ id: "tms", company: "TMS Technology" }),
    app({ id: "super", company: "Superchat" }),
  ];
  const kind = (subject: string, c = verdict()) =>
    matchMail(mail({ subject }), c, board).kind;
  assert.equal(
    kind("Your application to Senior Frontend Developer (m/w/d) at Purple"),
    "none",
  );
  assert.equal(
    kind("Arinze, your application was sent to Morson Edge (Technology)"),
    "none",
  );
  assert.equal(kind("", verdict({ company: "Super" })), "none");
  assert.equal(kind("Job Opportunity: Application at develop."), "unique");
});
