import "dotenv/config";
import puppeteer from "puppeteer";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const db = new PrismaClient();
const base =
  process.env.TEST_BASE_URL ??
  `http://localhost:${process.env.CONDUCTOR_PORT ?? 55010}`;
const key = `browser-test-${randomUUID()}`;
const browser = await puppeteer.launch({
  headless: true,
  ...(process.env.CHROME_EXECUTABLE_PATH
    ? { executablePath: process.env.CHROME_EXECUTABLE_PATH }
    : {}),
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const fixture = await db.job.create({
  data: {
    canonicalKey: key,
    title: "Jobdesk Browser Fixture",
    company: "Jobdesk Test Company",
    location: "Berlin, Germany",
    countries: ["DE"],
    description:
      "Build React and TypeScript applications. Improve CI/CD and work on Stripe Connect payments.",
    applyUrl: "https://example.com/test-only-never-submit",
    track: "Frontend",
    skills: ["React", "TypeScript"],
    score: 95,
    reasons: ["React appears in your verified experience"],
    contentHash: key,
  },
});
const click = async (text) => {
  const clicked = await page.evaluate((text) => {
    const el = [...document.querySelectorAll("button")].find(
      (el) => el.textContent.trim() === text,
    );
    if (!el) return false;
    el.click();
    return true;
  }, text);
  assert.ok(clicked, `Button found: ${text}`);
};
const waitText = (text) =>
  page.waitForFunction(
    (text) => document.body.innerText.includes(text),
    { timeout: 20000 },
    text,
  );
try {
  await mkdir(".context", { recursive: true });
  await page.setViewport({ width: 1440, height: 1080 });
  await page.goto(`${base}/?view=discover`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".job-row");
  await page.type('input[aria-label="Search jobs"]', "Jobdesk Browser Fixture");
  await waitText("Jobdesk Browser Fixture");
  await page.click(".job-row");
  await page.waitForSelector('[role="dialog"]');
  await waitText("Add to queue");
  await click("Add to queue");
  await waitText("Added to your application queue");
  await click("Application pack");
  await click("Prepare tailored CV & letter");
  await page.waitForSelector(".document-card");
  const doc = await db.document.findFirstOrThrow({
    where: { jobId: fixture.id },
  });
  const response = await fetch(`${base}/api/documents/${doc.id}?format=pdf`);
  assert.equal(response.status, 200, "PDF generation succeeded");
  assert.equal(response.headers.get("content-type"), "application/pdf");
  const pdf = Buffer.from(await response.arrayBuffer());
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
  await writeFile(".context/test-cv.pdf", pdf);
  await click("I reviewed both documents · Mark ready");
  await waitText("Documents approved. Ready to apply.");
  await click("I’ve submitted this application");
  assert.equal(
    await page.$eval(".confirmation .primary", (el) => el.disabled),
    true,
    "Confirmation cannot be skipped",
  );
  await page.click(".check-field input");
  await page.type(
    'input[placeholder="e.g. Confirmation email received from Acme"]',
    "Synthetic local browser test, no employer application sent.",
  );
  await click("Record submission");
  await waitText("Submission recorded ·");
  const app = await db.application.findUniqueOrThrow({
    where: { jobId: fixture.id },
  });
  assert.equal(app.status, "submitted");
  await click("Notes & history");
  await page.select(".outcome-field select", "interview");
  await waitText("Application updated");
  assert.equal(
    (await db.application.findUniqueOrThrow({ where: { jobId: fixture.id } }))
      .status,
    "interview",
  );
  await page.click('[aria-label="Close job details"]');
  await click("Profile & preferences");
  await waitText("Search preferences");
  await waitText("Wunderflats");
  assert.ok(
    (await page.$eval(".experience-list", (el) => el.textContent)).includes(
      "Wunderflats",
    ),
  );
  await click("Job sources");
  await waitText("Your job sources");
  assert.ok(await page.$('[role="switch"]'));
  await click("Discover jobs");
  await page.waitForSelector(".job-row");
  await page.select('select[aria-label="Country"]', "US");
  await page.waitForFunction(() => {
    const rows = [...document.querySelectorAll(".job-meta")];
    return (
      rows.length && rows.every((r) => r.innerText.includes("United States"))
    );
  });
  // Only the synthetic local record is deleted; no real application records are changed.
  await db.applicationEvent.deleteMany({ where: { applicationId: app.id } });
  await db.application.delete({ where: { id: app.id } });
  await db.document.deleteMany({ where: { jobId: fixture.id } });
  await db.job.delete({ where: { id: fixture.id } });
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.waitForSelector(".job-row");
  await page.screenshot({
    path: ".context/dashboard-desktop.png",
    fullPage: false,
  });
  await page.setViewport({
    width: 390,
    height: 844,
    isMobile: true,
    deviceScaleFactor: 1,
  });
  await page.goto(base, { waitUntil: "networkidle0" });
  await page.waitForSelector(".job-row");
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Mobile has no horizontal overflow",
  );
  await page.screenshot({
    path: ".context/dashboard-mobile.png",
    fullPage: false,
  });
  await page.click(".job-row");
  await page.waitForSelector('[role="dialog"]');
  await waitText("Why it’s in your feed");
  await page.screenshot({
    path: ".context/job-detail-mobile.png",
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  assert.deepEqual(errors, [], "No browser runtime errors");
  console.log(
    "Browser checks passed: search, queue, documents, PDF, approval, submission, outcome, country filter, source controls, profile, desktop and mobile layouts.",
  );
} finally {
  const app = await db.application.findUnique({ where: { jobId: fixture.id } });
  if (app) {
    await db.applicationEvent.deleteMany({ where: { applicationId: app.id } });
    await db.application.delete({ where: { id: app.id } });
  }
  await db.document.deleteMany({ where: { jobId: fixture.id } });
  await db.job.deleteMany({ where: { id: fixture.id } });
  await db.$disconnect();
  await browser.close();
}
