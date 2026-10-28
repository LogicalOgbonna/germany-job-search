import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalKey,
  countryCodes,
  localDay,
  matchJob,
  safeUrl,
} from "../src/lib/domain";
import { parseArchive } from "../src/lib/importer";
import { parseProfile, selectEvidence } from "../src/lib/profile";
import { readFile } from "node:fs/promises";

test("duplicate employer URLs ignore attribution without merging distinct requisitions", () => {
  assert.equal(
    canonicalKey(
      "https://boards.greenhouse.io/acme/jobs/123?gh_src=abc&utm_source=li",
      "",
    ),
    canonicalKey("https://job-boards.greenhouse.io/acme/jobs/123", ""),
  );
  assert.notEqual(
    canonicalKey("https://jobs.ashbyhq.com/acme/123", ""),
    canonicalKey("https://jobs.ashbyhq.com/acme/456", ""),
  );
  assert.equal(
    canonicalKey("https://jobs.ashbyhq.com/acme/123/apply", ""),
    canonicalKey("https://jobs.ashbyhq.com/acme/123", ""),
  );
});
test("country matching separates headquarters and uncertain remote scope by using supplied location only", () => {
  assert.deepEqual(countryCodes("Remote - United States"), ["US"]);
  assert.deepEqual(countryCodes("Berlin, Germany"), ["DE"]);
  assert.deepEqual(countryCodes("Athens, Greece"), ["GR"]);
  assert.deepEqual(countryCodes("Worldwide"), []);
  assert.deepEqual(countryCodes("Remote - India"), ["IN"]);
});
test("daily counts use Berlin midnight including DST changes", () => {
  assert.equal(localDay("2026-10-04T22:30:00Z"), "2026-10-05");
  assert.equal(localDay("2026-10-25T22:30:00Z"), "2026-10-25");
  assert.equal(localDay("2026-10-25T23:30:00Z"), "2026-10-26");
});
test("matching flags unverified production language experience", () => {
  const match = matchJob(
    "Senior AI Engineer",
    "Python, RAG, LangGraph, TypeScript",
  );
  assert.equal(match.track, "Applied AI");
  assert.ok(match.reasons.some((r) => r.includes("personal-project")));
});
test("backend roles on an unverified stack are capped, Node.js backends are not", () => {
  const java = matchJob(
    "Senior Product Engineer (Full Stack)",
    "Java 21 and Spring Boot, PostgreSQL, React and TypeScript on the frontend",
  );
  assert.ok(java.score <= 55);
  assert.ok(java.reasons.some((r) => r.includes("Java")));
  const node = matchJob(
    "Senior Backend Engineer",
    "TypeScript, Node.js, NestJS, PostgreSQL. Java experience is a plus.",
  );
  assert.equal(node.track, "Backend");
  assert.ok(node.score > 55);
  assert.ok(!node.reasons.some((r) => r.startsWith("Backend stack")));
  const go = matchJob(
    "Senior Fullstack Engineer",
    "React frontend and Go backend services",
  );
  assert.ok(go.score <= 55);
});
test("saved jobs preserve discovery date without claiming publication or submission", () => {
  const job = parseArchive(
    "# Senior Engineer\n## Direct Application Link\nhttps://jobs.ashbyhq.com/acme/123\n## Work Model & Location\nBerlin, Germany",
    "15-05-2026/acme/senior_engineer/job_description.md",
  );
  assert.equal(job.firstSeenAt.toISOString(), "2026-05-15T12:00:00.000Z");
  assert.equal(job.historical, true);
  assert.equal(job.applyUrl, "https://jobs.ashbyhq.com/acme/123");
});
test("document evidence is a subset of authoritative bullets and excludes maintenance notes", async () => {
  const source = await readFile("cv/experience.md", "utf8");
  const roles = parseProfile(source);
  const selected = selectEvidence(roles, "React TypeScript Stripe CI/CD");
  const wunder = selected.find((r) => r.company === "Wunderflats")!;
  assert.equal(wunder.title, "Senior Software Engineer");
  assert.ok(wunder.dates.includes("Sep 2026"));
  assert.ok(
    roles
      .find((r) => r.company === "Genentech (Roche)")!
      .dates.includes("Jan 2026"),
  );
  for (const role of selected)
    for (const bullet of role.bullets)
      assert.ok(source.includes(`- ${bullet.text}`));
  assert.ok(
    selected.every((r) =>
      r.bullets.every((b) => !b.text.includes("Profile maintenance note")),
    ),
  );
});
test("application links cannot execute scripts or contain credentials", () => {
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("https://user:pass@example.com"), "");
  assert.equal(safeUrl("https://example.com/jobs"), "https://example.com/jobs");
});
