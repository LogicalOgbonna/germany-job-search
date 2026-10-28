import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "../../src/lib/db";
import {
  draftThankYou,
  generatePrep,
  nextQueuedPrep,
} from "../../src/lib/interviews/prep";
import type { ClaudeReply, ClaudeRequest } from "../../src/lib/claude";
import type { PrepEvidence, PrepSheet } from "../../src/lib/interviews/types";

// This runs against the local Jobdesk database, which holds real applications. Every row it
// writes belongs to a job whose company starts with `Ivtest-<tag>` or a mail whose gmailId
// starts with `ivtest-<tag>-`, and everything is removed in `finally`. Claude is a fake.
const experience = `# Complete Work History

## Wunderflats — Senior Software Engineer
**Apr 2026 - Sep 2026**

- Restructured a slow CI/CD pipeline into smaller parts and reduced unnecessary test runs, cutting pipeline wait time by approximately 30%.
- Introduced Google One Tap to simplify login and improve user retention.

Profile maintenance note (not application copy): Programming languages remain unconfirmed and the team had 12 engineers.

---

## Genentech (Roche) — Frontend Engineer
**Full-time | May 2023 - Jan 2026**

- Increased stakeholder confidence by writing end-to-end tests with Playwright in the CI/CD pipeline.
- Mentored a team of two junior developers (interns), fostering a culture of technical excellence.

**Key technologies:** React, TypeScript, Playwright

---

## Descasio — Senior Frontend Developer
**Full-time | May 2021 - Mar 2023**

- Reducing bundle size by 30-40% through rollup-plugin-visualizer, which led to a 35% faster load time.

---

## Founders Lair — Full Stack Engineer (Contract)

- Oversaw the professional development of two interns.

---

## Education

**University of Nigeria**
`;
const skills = `# Verified Skills Inventory

| Skill | Where Used |
|-------|-----------|
| React Query | Genentech |
| Stripe Connect | Wunderflats (payment functionality) |
`;
const rules = `## Critical Rules

- Career start: Mar 2018. Current valid claim: 8 years of experience.
- No em dashes in generated documents — use commas instead.`;
const evidence = (over: Partial<PrepEvidence> = {}): PrepEvidence => ({
  claim: "I write end-to-end tests that stakeholders trust.",
  quote:
    "Increased stakeholder confidence by writing end-to-end tests with Playwright in the CI/CD pipeline.",
  role: "Genentech (Roche), Frontend Engineer",
  ...over,
});

const reply = (over: Record<string, unknown> = {}) => ({
  logistics: ["Thu 22 Oct, 10:15"],
  company: {
    summary: "Acme sells tickets.",
    facts: [
      { text: "Founded in 2012.", sources: ["https://acme.example/about"] },
      { text: "Raised a Series C.", sources: ["https://made-up.example/news"] },
      { text: "Based in Berlin.", sources: [] },
    ],
    reasons: ["Mobility interests me."],
  },
  role: {
    responsibilities: ["Build the booking flow"],
    challenges: [],
    mustHave: ["React"],
    niceToHave: [],
  },
  matches: [evidence()],
  transferable: [],
  gaps: [],
  scripts: {
    whyCompany: "Tickets matter.",
    lookingFor: "A product team.",
    aboutMe: "I build frontends.",
  },
  questions: [
    { question: "Why Acme?", outline: ["Mobility"], evidence: [] },
    {
      question: "How do you test?",
      outline: ["Playwright"],
      evidence: [evidence()],
    },
  ],
  askThem: ["What is the team like?"],
  checklist: ["Test the camera"],
  ...over,
});
const found = [{ url: "https://acme.example/about", title: "About Acme" }];

const tag = randomUUID().replaceAll("-", "").slice(0, 10);

async function fixture(
  description: string,
  interview: Record<string, unknown> = {},
) {
  const company = `Ivtest-${tag}-${randomUUID().slice(0, 6)}`;
  const job = await db.job.create({
    data: {
      canonicalKey: `ivtest-${tag}-${randomUUID()}`,
      title: "Senior Frontend Engineer",
      company,
      location: "Berlin",
      countries: ["DE"],
      description,
      applyUrl: "https://example.com/job",
      track: "frontend",
      skills: [],
      score: 0,
      reasons: [],
      contentHash: "ivtest",
    },
  });
  const application = await db.application.create({
    data: {
      jobId: job.id,
      status: "submitted",
      notes: "Salary expectation 70.000 EUR.",
    },
  });
  await db.mailMessage.create({
    data: {
      gmailId: `ivtest-${tag}-${randomUUID()}`,
      threadId: "ivtest-thread",
      fromAddress: "talent@acme.example",
      fromName: "Acme Talent",
      subject: "Confirmation: Video interview",
      receivedAt: new Date("2026-10-15T09:00:00Z"),
      bodyText: "Looking forward to speaking with you.",
      category: "interview",
      confidence: "high",
      decidedBy: "test",
      applicationId: application.id,
      state: "attached",
    },
  });
  const row = await db.interview.create({
    data: {
      applicationId: application.id,
      stage: "technical",
      title: "Technical interview",
      startsAt: new Date("2026-10-22T08:15:00Z"),
      interviewers: [{ name: "Aulia Cahyani" }],
      ...interview,
    },
  });
  return {
    company,
    jobId: job.id,
    applicationId: application.id,
    interviewId: row.id,
  };
}
async function cleanup(ids: Array<{ jobId: string; applicationId: string }>) {
  for (const { jobId, applicationId } of ids) {
    await db.interview.deleteMany({ where: { applicationId } });
    await db.mailMessage.deleteMany({ where: { applicationId } });
    await db.applicationEvent.deleteMany({ where: { applicationId } });
    await db.application.deleteMany({ where: { id: applicationId } });
    await db.job.deleteMany({ where: { id: jobId } });
  }
}
async function cvRoot() {
  const root = await mkdtemp(join(tmpdir(), "ivtest-prep-"));
  await mkdir(join(root, "cv"));
  await writeFile(join(root, "cv", "experience.md"), experience);
  await writeFile(join(root, "cv", "base_experience.md"), skills);
  await writeFile(
    join(root, "CLAUDE.md"),
    `# CLAUDE.md\n\n## Commands\n\nnpm test\n\n${rules}\n\n## Later\n\nNot part of it.\n`,
  );
  return root;
}
const fakeAsk = (answer: ClaudeReply<unknown>) => {
  const seen: ClaudeRequest[] = [];
  const ask = (async (request: ClaudeRequest) => {
    seen.push(request);
    return answer;
  }) as typeof import("../../src/lib/claude").askClaude;
  return { seen, ask };
};

test("generatePrep saves a checked sheet and syncs its questions", async () => {
  const root = await cvRoot();
  const made = await fixture("A long description. ".repeat(60));
  try {
    const { seen, ask } = fakeAsk({
      ok: true,
      data: reply({
        matches: [
          evidence(),
          evidence({ quote: "Invented line about Kubernetes." }),
        ],
      }),
      text: "",
      sources: found,
    });
    const now = new Date("2026-10-19T12:00:00Z");
    await generatePrep(made.interviewId, { ask, now, root });
    const row = await db.interview.findUniqueOrThrow({
      where: { id: made.interviewId },
      include: { questions: { orderBy: { position: "asc" } } },
    });
    assert.equal(row.prepStatus, "ready");
    assert.equal(row.prepError, null);
    assert.equal(row.prepGeneratedAt?.toISOString(), now.toISOString());
    const saved = row.prep as unknown as PrepSheet;
    assert.equal(saved.stage, "technical");
    assert.equal(saved.matches.length, 1);
    assert.equal(saved.dropped.length, 3);
    assert.deepEqual(
      row.questions.map((item) => item.question),
      ["Why Acme?", "How do you test?"],
    );
    assert.equal(seen.length, 1);
    assert.deepEqual(seen[0].webSearch, { maxUses: 5 });
    assert.ok(seen[0].system.includes(rules));
    assert.ok(!seen[0].system.includes("Not part of it."));
    assert.ok(
      seen[0].messages[0].content.includes(
        "Looking forward to speaking with you.",
      ),
    );
    assert.ok(seen[0].messages[0].content.includes(made.company));
  } finally {
    await cleanup([made]);
    await rm(root, { recursive: true, force: true });
  }
});
test("a short description pulls in the job folder's job_description.md", async () => {
  const root = await cvRoot();
  const jobs = await mkdtemp(join(tmpdir(), "ivtest-jobs-"));
  const made = await fixture("Frontend role.");
  const previous = process.env.JOBS_ROOT;
  try {
    const folder = join(
      jobs,
      "12-10-2026",
      made.company,
      "Senior Frontend Engineer",
    );
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "intro_prep.md"), "# Prep");
    await writeFile(
      join(folder, "job_description.md"),
      "The full job description from the folder.",
    );
    process.env.JOBS_ROOT = jobs;
    const { seen, ask } = fakeAsk({
      ok: true,
      data: reply(),
      text: "",
      sources: found,
    });
    await generatePrep(made.interviewId, { ask, root });
    assert.ok(
      seen[0].messages[0].content.includes(
        "The full job description from the folder.",
      ),
    );
  } finally {
    if (previous === undefined) delete process.env.JOBS_ROOT;
    else process.env.JOBS_ROOT = previous;
    await cleanup([made]);
    await rm(root, { recursive: true, force: true });
    await rm(jobs, { recursive: true, force: true });
  }
});
test("a Claude failure keeps the old sheet and records a readable error", async () => {
  const root = await cvRoot();
  const old = {
    version: 1,
    stage: "technical",
    questions: [],
    note: "old sheet",
  };
  const made = await fixture("A long description. ".repeat(60), {
    prep: old,
    prepStatus: "queued",
  });
  try {
    const { ask } = fakeAsk({
      ok: false,
      error: "Claude API error 529: the API is overloaded",
    });
    await generatePrep(made.interviewId, { ask, root });
    const row = await db.interview.findUniqueOrThrow({
      where: { id: made.interviewId },
    });
    assert.equal(row.prepStatus, "failed");
    assert.match(row.prepError ?? "", /overloaded/);
    assert.deepEqual(row.prep, old);
  } finally {
    await cleanup([made]);
    await rm(root, { recursive: true, force: true });
  }
});
test("the thank-you draft is built from the debrief without web search", async () => {
  const root = await cvRoot();
  const made = await fixture("A long description. ".repeat(60), {
    debrief: "We talked about their migration to React Server Components.",
  });
  try {
    const { seen, ask } = fakeAsk({
      ok: true,
      data: "Hi Aulia — thank you for the chat about Server Components.",
      text: "",
      sources: [],
    });
    const draft = await draftThankYou(made.interviewId, { ask });
    assert.equal(
      draft,
      "Hi Aulia, thank you for the chat about Server Components.",
    );
    assert.equal(seen[0].webSearch, undefined);
    assert.equal(seen[0].schema, undefined);
    assert.equal(seen[0].effort, "medium");
    const prompt = seen[0].system + seen[0].messages[0].content;
    assert.ok(
      prompt.includes(
        "We talked about their migration to React Server Components.",
      ),
    );
    assert.ok(prompt.includes("Aulia Cahyani"));
    assert.ok(!prompt.includes("Increased stakeholder confidence"));
    assert.ok(!prompt.includes("<experience>"));
    assert.match(seen[0].system, /120 words/);
    const failing = fakeAsk({
      ok: false,
      error: "Claude API error 401: the API key was rejected",
    });
    await assert.rejects(
      draftThankYou(made.interviewId, { ask: failing.ask }),
      /401/,
    );
  } finally {
    await cleanup([made]);
    await rm(root, { recursive: true, force: true });
  }
});
test("nextQueuedPrep claims queued interviews one at a time, oldest first", async () => {
  const first = await fixture("x", { prepStatus: "queued" });
  const second = await fixture("x", { prepStatus: "queued" });
  const idle = await fixture("x", { prepStatus: "ready" });
  try {
    const only = [first.interviewId, second.interviewId, idle.interviewId];
    const claimed = await Promise.all([
      nextQueuedPrep(only),
      nextQueuedPrep(only),
    ]);
    assert.deepEqual(
      new Set(claimed),
      new Set([first.interviewId, second.interviewId]),
    );
    assert.equal(await nextQueuedPrep(only), null);
    const rows = await db.interview.findMany({ where: { id: { in: only } } });
    assert.deepEqual(rows.map((row) => row.prepStatus).sort(), [
      "ready",
      "running",
      "running",
    ]);
  } finally {
    await cleanup([first, second, idle]);
  }
});
test.after(async () => {
  await db.$disconnect();
});
