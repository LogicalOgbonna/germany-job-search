import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { saveContact } from "../../src/lib/referrals/store";
test("rediscovery is idempotent and preserves edited drafts, suppression and follow-ups", async () => {
  const key = randomUUID();
  const job = await db.job.create({
    data: {
      canonicalKey: key,
      title: "Payments Engineer",
      company: "Synthetic Referral Company",
      location: "Berlin",
      countries: ["DE"],
      description: "Stripe CI/CD",
      applyUrl: "https://example.com/jobs/1",
      track: "Backend",
      skills: ["Stripe"],
      score: 80,
      reasons: [],
      contentHash: key,
    },
  });
  try {
    const input = {
      name: "Test Engineer",
      title: "Software Engineer",
      email: "engineer@example.com",
      linkedin: "",
      sourceUrl: "https://example.com/team",
      sourceKind: "Test fixture",
      sourceNote: "Synthetic, never contact",
      emailStatus: "Not verified",
    };
    const first = await saveContact(job.id, input);
    assert.equal(first.status, "saved");
    assert.equal(first.contactedAt, null);
    assert.equal(first.employmentReviewed, false);
    const drafts = {
      ...(first.drafts as Record<string, string>),
      email: "My edited draft",
    };
    await db.referral.update({
      where: { id: first.id },
      data: {
        drafts,
        notes: "Keep my conversation notes",
        status: "do_not_contact",
        followUpAt: new Date("2026-12-01T12:00:00Z"),
      },
    });
    const again = await saveContact(job.id, {
      ...input,
      name: "Changed in source",
    });
    assert.equal(again.id, first.id);
    assert.equal(again.status, "do_not_contact");
    assert.equal(again.notes, "Keep my conversation notes");
    assert.deepEqual(again.drafts, drafts);
    assert.equal(again.name, "Test Engineer");
    assert.ok(again.followUpAt);
    assert.equal(await db.referral.count({ where: { jobId: job.id } }), 1);
    assert.equal(await db.application.count({ where: { jobId: job.id } }), 0);
  } finally {
    await db.job.delete({ where: { id: job.id } });
    await db.$disconnect();
  }
});
