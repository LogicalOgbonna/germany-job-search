import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { NextRequest } from "next/server";
import { companyKey } from "../../src/lib/linkedin/connections";
import { saveContact } from "../../src/lib/referrals/store";
import * as referralsRoute from "../../src/app/api/jobs/[id]/referrals/route";
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
test("LinkedIn connections at the company show on the Referrals tab and save with direct-message drafts", async () => {
  const key = randomUUID();
  const company = `Synthetic Connection Company ${key.slice(0, 8)}`;
  const profileUrl = `https://www.linkedin.com/in/test-li-${key.slice(0, 8)}`;
  const job = await db.job.create({
    data: {
      canonicalKey: key,
      title: "Platform Engineer",
      company,
      location: "Berlin",
      countries: ["DE"],
      description: "Kubernetes CI/CD",
      applyUrl: "https://example.com/jobs/2",
      track: "Backend",
      skills: [],
      score: 80,
      reasons: [],
      contentHash: key,
    },
  });
  const connection = await db.linkedinConnection.create({
    data: {
      profileUrl,
      name: "Grace Testwell",
      company,
      companyKey: companyKey(company),
      position: "Staff Engineer",
      connectedOn: new Date("2024-03-05T00:00:00Z"),
    },
  });
  const origin = "http://localhost:3000";
  const ctx = { params: Promise.resolve({ id: job.id }) };
  const get = async () =>
    (await (
      await referralsRoute.GET(
        new NextRequest(`${origin}/api/jobs/${job.id}/referrals`),
        ctx,
      )
    ).json()) as {
      connections: { id: string; profileUrl: string; saved: boolean }[];
    };
  const post = (body: unknown, headers: Record<string, string> = { origin }) =>
    referralsRoute.POST(
      new NextRequest(`${origin}/api/jobs/${job.id}/referrals`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
      ctx,
    );
  try {
    const before = await get();
    assert.equal(before.connections.length, 1);
    assert.equal(before.connections[0].id, connection.id);
    assert.equal(before.connections[0].profileUrl, profileUrl);
    assert.equal(before.connections[0].saved, false);

    assert.equal(
      (
        await post(
          { action: "add-connection", connectionId: connection.id },
          {},
        )
      ).status,
      400,
      "mutations must come from the dashboard",
    );
    assert.equal(
      (await post({ action: "add-connection", connectionId: "missing" }))
        .status,
      404,
    );
    assert.equal(await db.referral.count({ where: { jobId: job.id } }), 0);

    const added = await post({
      action: "add-connection",
      connectionId: connection.id,
    });
    assert.equal(added.status, 201);
    const referral = await db.referral.findMany({ where: { jobId: job.id } });
    assert.equal(referral.length, 1);
    assert.equal(referral[0].linkedin, profileUrl);
    assert.equal(referral[0].sourceKind, "LinkedIn connection");
    assert.equal(referral[0].title, "Staff Engineer");
    assert.equal(referral[0].email, "");
    assert.equal(referral[0].emailStatus, "No email found");
    assert.match(referral[0].sourceNote, /1st-degree.*since 2024-03-05/);
    assert.match(referral[0].sourceNote, new RegExp(company));
    const drafts = referral[0].drafts as Record<string, string>;
    assert.match(drafts.connection, /^Hi Grace,/);
    assert.doesNotMatch(drafts.connection, /Open to connecting/);
    assert.ok(drafts.connection.includes(company));

    assert.equal(
      (await post({ action: "add-connection", connectionId: connection.id }))
        .status,
      201,
    );
    assert.equal(await db.referral.count({ where: { jobId: job.id } }), 1);
    assert.equal((await get()).connections[0].saved, true);
  } finally {
    await db.job.delete({ where: { id: job.id } });
    await db.linkedinConnection.delete({ where: { id: connection.id } });
    await db.$disconnect();
  }
});
