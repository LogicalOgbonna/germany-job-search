import "dotenv/config";
import puppeteer from "puppeteer";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const db = new PrismaClient();
const base =
  process.env.TEST_BASE_URL ??
  `http://localhost:${process.env.CONDUCTOR_PORT ?? 55010}`;
const key = `events-browser-${randomUUID()}`;
const browser = await puppeteer.launch({
  headless: true,
  ...(process.env.CHROME_EXECUTABLE_PATH
    ? { executablePath: process.env.CHROME_EXECUTABLE_PATH }
    : {}),
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const fixture = await db.techEvent.create({
  data: {
    canonicalKey: key,
    title: `Jobdesk Event Fixture ${key}`,
    url: "https://example.com/no-registration",
    description: "React and agents",
    kind: "hackathon",
    city: "Berlin",
    country: "DE",
    format: "in-person",
    startsAt: new Date(Date.now() + 7 * 86400000),
    endsAt: new Date(Date.now() + 8 * 86400000),
    allDay: false,
    topics: ["AI & agents"],
    score: 99,
    reasons: ["AI tooling and agent projects"],
    cost: "Price not published",
  },
});
const waitText = (text) =>
  page.waitForFunction(
    (text) => document.body.innerText.includes(text),
    { timeout: 20000 },
    text,
  );
const click = async (text) => {
  assert.ok(
    await page.evaluate((text) => {
      const el = [...document.querySelectorAll("button")].find(
        (e) => e.textContent.trim() === text,
      );
      el?.click();
      return !!el;
    }, text),
    `Button: ${text}`,
  );
};
try {
  await mkdir(".context", { recursive: true });
  await page.setViewport({ width: 1440, height: 1080 });
  await page.goto(`${base}/?view=events`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".event-card");
  await page.type('input[aria-label="Search events"]', key);
  await waitText(fixture.title);
  await page.waitForFunction(
    () => document.querySelectorAll(".event-card").length === 1,
  );
  await click("Shortlist");
  await waitText("Added to your event shortlist.");
  await click(fixture.title);
  await page.waitForSelector("dialog[open]");
  await page.select('select[name="status"]', "attended");
  await page.$eval('input[name="contactsMet"]', (el) => {
    el.value = "3";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.type(
    'textarea[name="notes"]',
    "Three meaningful conversations. Follow up about agent projects.",
  );
  await page.$eval('input[name="followUpAt"]', (el) => {
    el.value = "2026-10-05";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("Save event plan");
  await waitText("Saved. Your networking stats have been updated.");
  const plan = await db.eventPlan.findUniqueOrThrow({
    where: { eventId: fixture.id },
  });
  assert.equal(plan.status, "attended");
  assert.equal(plan.contactsMet, 3);
  assert.match(plan.notes, /Three meaningful/);
  const calendar = await fetch(`${base}/api/events/${fixture.id}/calendar`);
  assert.equal(calendar.status, 200);
  assert.match(await calendar.text(), /BEGIN:VCALENDAR/);
  const forbidden = await fetch(`${base}/api/events/${fixture.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "dismissed" }),
  });
  assert.equal(forbidden.status, 400);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  await click("My shortlist");
  await waitText(fixture.title);
  await page.select('[aria-label="Attendance filter"]', "due");
  await waitText(fixture.title);
  await click(fixture.title);
  await page.waitForSelector("dialog[open]");
  await page.select('select[name="status"]', "dismissed");
  await click("Save event plan");
  await waitText("Saved. Your networking stats have been updated.");
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector("dialog[open]"));
  await page.select('[aria-label="Attendance filter"]', "dismissed");
  await waitText(fixture.title);
  assert.equal(
    (await db.eventPlan.findUniqueOrThrow({ where: { eventId: fixture.id } }))
      .status,
    "dismissed",
  );

  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".event-card");
  await page.select('[aria-label="Event country"]', "DE");
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".event-meta")].every((e) =>
      e.textContent.includes("Germany"),
    ),
  );
  await page.select('[aria-label="Event type"]', "hackathon");
  await page.waitForFunction(() =>
    [...document.querySelectorAll(".event-kind")].every((e) =>
      e.textContent.includes("hackathon"),
    ),
  );
  await click("Event sources");
  await waitText("Luma · Berlin");
  assert.ok(await page.$('[aria-label="Refresh interval for Luma · Berlin"]'));
  await click("Explore events");
  await page.waitForSelector(".event-card");
  // Remove synthetic data before capturing the actual workspace.
  await db.eventPlan.deleteMany({ where: { eventId: fixture.id } });
  await db.techEvent.delete({ where: { id: fixture.id } });
  await page.reload({ waitUntil: "networkidle0" });
  await page.waitForSelector(".event-card");
  await page.screenshot({
    path: ".context/events-desktop.png",
    fullPage: false,
  });
  await page.setViewport({ width: 390, height: 844 });
  await page.screenshot({ path: ".context/events-mobile.png", fullPage: true });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
    "No horizontal mobile overflow",
  );
  assert.deepEqual(errors, [], "No browser runtime errors");
  console.log(
    "Event browser flow passed: matching filters, persisted attendance, notes, calendar, source controls, CSRF guard, desktop and mobile.",
  );
} finally {
  await db.eventPlan.deleteMany({ where: { eventId: fixture.id } });
  await db.techEvent.deleteMany({ where: { id: fixture.id } });
  await db.$disconnect();
  await browser.close();
}
