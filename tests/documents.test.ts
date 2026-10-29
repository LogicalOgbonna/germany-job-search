import test from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readProfile, selectEvidence } from "../src/lib/profile";
import { coreCompetencies } from "../src/lib/cv-content";
import { renderDocuments } from "../src/lib/documents";
import { documentFingerprint } from "../src/lib/document-version";
import { hash } from "../src/lib/domain";

test("detailed CV retains the full verified history and reference sections", async () => {
  const profile = await readProfile();
  const job = {
    title: "Senior Full-Stack Engineer",
    company: "Example",
    description: "React TypeScript Node.js Stripe CI/CD",
    skills: ["React", "TypeScript"],
  };
  const doc = renderDocuments(job, profile);
  const $ = cheerio.load(doc.cvHtml);
  assert.deepEqual(
    $("h2")
      .map((_, e) => $(e).text())
      .get(),
    [
      "Summary",
      "Core competencies",
      "Work experience",
      "Projects",
      "Education",
    ],
  );
  assert.equal(
    $("[data-evidence-id]").length,
    profile.roles.reduce((n, r) => n + r.bullets.length, 0),
  );
  assert.equal(new Set(doc.evidenceIds).size, doc.evidenceIds.length);
  for (const role of profile.roles) {
    const el = $(".role").filter(
      (_, e) => $(e).find("h3").text() === role.company,
    );
    assert.equal(el.length, 1);
    assert.equal(el.find(".role-title").text(), role.title);
    assert.ok(el.text().includes(role.technologies));
    for (const b of role.bullets)
      assert.equal(
        el.find(`[data-evidence-id="${b.id}"]`).text(),
        b.text.replaceAll("—", ","),
      );
  }
  const text = $("body").text();
  assert.match(text, /708K\+ vector embeddings/);
  assert.match(text, /approximately 30%/);
  assert.match(text, /4.1 CGPA/);
  assert.match(text, /Jan 2026/);
  assert.match(text, /Sep 2026/);
  assert.ok(!text.includes("Profile maintenance note"));
  assert.ok(!text.includes("May 2023 - Present"));
  // Contact details come from cv/contact.json (kept out of git), not from the test.
  const contact = JSON.parse(
    await readFile(join(process.cwd(), "cv", "contact.json"), "utf8"),
  );
  assert.equal($('header a[href^="tel:"]').text(), contact.phone);
  assert.ok(text.includes(contact.location));
  assert.ok(!text.includes("Application:"));
  assert.ok(!doc.cvHtml.includes("—"));
});
test("tailoring reorders evidence and skills without dropping breadth or changing facts", async () => {
  const profile = await readProfile();
  const ai = selectEvidence(profile.roles, "RAG LangGraph Agents");
  const payments = selectEvidence(profile.roles, "Stripe");
  assert.match(
    ai.find((r) => r.company === "Genentech (Roche)")!.bullets[0].text,
    /RAG/,
  );
  assert.match(
    payments.find((r) => r.company === "Wunderflats")!.bullets[0].text,
    /Stripe/,
  );
  for (let i = 0; i < profile.roles.length; i++)
    assert.deepEqual(
      new Set(ai[i].bullets.map((b) => b.id)),
      new Set(profile.roles[i].bullets.map((b) => b.id)),
    );
  const competencies = coreCompetencies(
    profile.verifiedSkills,
    "Python Redis RAG LangGraph",
  );
  const flat = competencies.flatMap((c) => c.skills);
  assert.equal(flat.find((s) => s.name === "Python")!.display, "Python");
  assert.equal(
    flat.find((s) => s.name === "Redis")!.display,
    "Redis (general knowledge)",
  );
  for (const skill of flat)
    assert.ok(
      profile.verifiedSkills.some(
        (s) => s.name === skill.name && s.whereUsed === skill.whereUsed,
      ),
    );
  const w = payments.find((r) => r.company === "Wunderflats")!;
  assert.doesNotMatch(w.technologies, /React|GitHub|Node/);
});
test("HTML rendering escapes employer and source text; new templates cannot reuse sparse packs", async () => {
  const profile = await readProfile();
  const doc = renderDocuments(
    {
      title: "Engineer <script>alert(1)</script>",
      company: "Company <script>alert(1)</script>",
      description: "React",
      skills: [],
    },
    profile,
  );
  assert.ok(!doc.letterHtml.includes("<script>"));
  assert.ok(doc.letterHtml.includes("&lt;script&gt;"));
  assert.notEqual(
    documentFingerprint(profile.hash, "job"),
    hash(`${profile.hash}:job:evidence-template-v1`),
  );
});
