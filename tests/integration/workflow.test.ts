import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { upsertJob } from "../../src/lib/store";
import { readProfile } from "../../src/lib/profile";
import { hash } from "../../src/lib/domain";
import { generateDocuments } from "../../src/lib/documents";
import { changeApplication } from "../../src/lib/applications";
import { syncSource } from "../../src/lib/ingestion";

test("import, approve, submit, retry, correct, and connector-failure invariants", async () => {
  const key = `test-${randomUUID()}`;
  const source = await db.source.create({
    data: { key, name: "Test fixture", kind: "archive", enabled: true },
  });
  let jobId: string | undefined;
  try {
    const incoming = {
      externalId: "stable-id",
      title: "Senior Frontend Engineer",
      company: "Test fixture",
      location: "Berlin, Germany",
      description:
        "Build React and TypeScript applications; improve CI/CD and payments.",
      applyUrl: `https://example.com/${key}`,
      historical: true,
      firstSeenAt: new Date("2026-03-01"),
    };
    const first = await upsertJob(source, incoming);
    jobId = first.job.id;
    const second = await upsertJob(source, {
      ...incoming,
      applyUrl: `https://example.com/${key}/changed`,
    });
    assert.equal(second.job.id, jobId);
    assert.equal(second.added, false);
    assert.equal(first.job.checkedAt, null);
    assert.equal(first.job.publishedAt, null);
    assert.equal(await db.application.count({ where: { jobId } }), 0);
    await changeApplication(jobId, { status: "queued" });
    await assert.rejects(
      changeApplication(jobId, { status: "prepared" }),
      /approve/,
    );
    const profile = await readProfile();
    const legacy = await db.document.create({
      data: {
        jobId,
        fingerprint: hash(
          `${profile.hash}:${second.job.contentHash}:evidence-template-v1`,
        ),
        profileHash: profile.hash,
        jobHash: second.job.contentHash,
        cvHtml: "<p>Old sparse CV</p>",
        letterHtml: "<p>Old letter</p>",
        evidenceIds: [],
        approvedAt: new Date(),
      },
    });
    await assert.rejects(
      changeApplication(jobId, { status: "prepared" }),
      /approve/,
    );
    const doc = await generateDocuments(jobId);
    assert.notEqual(doc.id, legacy.id);
    assert.equal(doc.approvedAt, null);
    assert.equal(
      (await db.document.findUniqueOrThrow({ where: { id: legacy.id } }))
        .cvHtml,
      "<p>Old sparse CV</p>",
    );
    assert.equal(
      doc.evidenceIds.length,
      profile.roles.reduce((n, r) => n + r.bullets.length, 0),
    );
    await assert.rejects(
      changeApplication(jobId, { status: "prepared" }),
      /approve/,
    );

    assert.equal((await generateDocuments(jobId)).id, doc.id);
    assert.ok(doc.cvHtml.includes("Jan 2026"));
    assert.ok(!doc.cvHtml.includes("Profile maintenance note"));
    assert.ok(!doc.cvHtml.includes("—"));
    assert.ok(doc.evidenceIds.length > 0);
    await db.document.update({
      where: { id: doc.id },
      data: { approvedAt: new Date() },
    });
    await changeApplication(jobId, { status: "prepared" });
    await assert.rejects(
      changeApplication(jobId, { status: "submitted" }),
      /eligibility/,
    );
    await assert.rejects(
      changeApplication(jobId, {
        status: "submitted",
        eligibilityReviewed: true,
      }),
      /confirmed/,
    );
    await changeApplication(jobId, {
      status: "submitted",
      eligibilityReviewed: true,
      evidence: "Test receipt",
      submittedAt: "2026-04-01T12:00:00Z",
    });
    await changeApplication(jobId, {
      status: "submitted",
      eligibilityReviewed: true,
      evidence: "Test receipt",
    });
    const app = await db.application.findUniqueOrThrow({ where: { jobId } });
    assert.equal(app.submittedAt?.toISOString(), "2026-04-01T12:00:00.000Z");
    assert.equal(
      await db.applicationEvent.count({
        where: { applicationId: app.id, status: "submitted" },
      }),
      1,
    );
    await assert.rejects(generateDocuments(jobId), /preserved/);
    await changeApplication(jobId, { status: "interview" });
    await assert.rejects(
      changeApplication(jobId, { status: "queued" }),
      /correction/,
    );
    await changeApplication(jobId, { status: "queued", undoSubmission: true });
    assert.equal(
      (await db.application.findUniqueOrThrow({ where: { jobId } }))
        .submittedAt,
      null,
    );
    await assert.rejects(syncSource(source.id), /does not support/);
    assert.equal(
      (await db.job.findUniqueOrThrow({ where: { id: jobId } })).liveStatus,
      "unverified",
    );
    assert.equal(
      (await db.source.findUniqueOrThrow({ where: { id: source.id } }))
        .leaseUntil,
      null,
    );
  } finally {
    if (jobId) {
      const app = await db.application.findUnique({ where: { jobId } });
      if (app) {
        await db.applicationEvent.deleteMany({
          where: { applicationId: app.id },
        });
        await db.application.delete({ where: { id: app.id } });
      }
      await db.document.deleteMany({ where: { jobId } });
      await db.listing.deleteMany({ where: { jobId } });
      await db.job.delete({ where: { id: jobId } });
    }
    await db.sourceRun.deleteMany({ where: { sourceId: source.id } });
    await db.source.delete({ where: { id: source.id } });
    await db.$disconnect();
  }
});
