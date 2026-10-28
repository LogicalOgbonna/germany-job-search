import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/db";
import { upsertEvent, syncEventSource } from "../../src/lib/events/store";
import type { IncomingEvent } from "../../src/lib/events/domain";
test("event refresh deduplicates sources, preserves personal plans and never expires events on fetch failure", async () => {
  const key = `test-events-${randomUUID()}`;
  const sources = await Promise.all(
    ["a", "b"].map((x) =>
      db.eventSource.create({
        data: {
          key: `${key}-${x}`,
          name: "Test",
          kind: "invalid-test-only",
          url: "https://example.com",
          scope: "",
        },
      }),
    ),
  );
  const fixture: IncomingEvent = {
    externalId: "fixture",
    title: "React AI hackathon",
    url: `https://luma.com/${key}`,
    description: "An engineering event",
    city: "Berlin",
    country: "DE",
    kind: "hackathon",
    format: "in-person",
    startsAt: new Date("2026-12-10T15:00:00Z"),
    endsAt: new Date("2026-12-10T18:00:00Z"),
    allDay: false,
    topics: ["AI"],
    cost: "€20",
    free: false,
  };
  let eventId = "";
  try {
    const a = await upsertEvent(sources[0].id, fixture);
    eventId = a.event.id;
    await db.eventPlan.create({
      data: {
        eventId,
        status: "registered",
        notes: "Meet potential teammates",
        contactsMet: 3,
      },
    });
    const b = await upsertEvent(sources[1].id, {
      ...fixture,
      url: `https://lu.ma/${key}?utm_source=index`,
      allDay: true,
      startsAt: new Date("2026-12-10"),
      endsAt: new Date("2026-12-11"),
      cost: undefined,
    });
    assert.equal(b.event.id, eventId);
    assert.equal(b.added, false);
    assert.equal(b.event.allDay, false);
    assert.equal(b.event.cost, "€20");
    const moved = await upsertEvent(sources[0].id, {
      ...fixture,
      startsAt: new Date("2026-12-11T15:00:00Z"),
      endsAt: new Date("2026-12-11T18:00:00Z"),
    });
    assert.equal(moved.event.id, eventId);
    const plan = await db.eventPlan.findUniqueOrThrow({ where: { eventId } });
    assert.equal(plan.status, "registered");
    assert.equal(plan.notes, "Meet potential teammates");
    assert.equal(plan.contactsMet, 3);
    await assert.rejects(
      syncEventSource(sources[0].id),
      /Unsupported event source/,
    );
    const source = await db.eventSource.findUniqueOrThrow({
      where: { id: sources[0].id },
    });
    assert.ok(source.lastError);
    assert.equal(source.leaseUntil, null);
    assert.ok(source.nextRunAt > new Date());
    assert.equal(
      (await db.techEvent.findUniqueOrThrow({ where: { id: eventId } })).status,
      "listed",
    );
    await db.eventSource.update({
      where: { id: sources[1].id },
      data: { leaseUntil: new Date(Date.now() + 60000) },
    });
    assert.deepEqual(await syncEventSource(sources[1].id), { skipped: true });
  } finally {
    await db.eventPlan.deleteMany({ where: { eventId } });
    await db.eventListing.deleteMany({
      where: { sourceId: { in: sources.map((s) => s.id) } },
    });
    await db.eventSourceRun.deleteMany({
      where: { sourceId: { in: sources.map((s) => s.id) } },
    });
    await db.eventSource.deleteMany({
      where: { id: { in: sources.map((s) => s.id) } },
    });
    if (eventId) await db.techEvent.delete({ where: { id: eventId } });
    await db.$disconnect();
  }
});
