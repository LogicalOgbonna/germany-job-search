import "dotenv/config";
import puppeteer from "puppeteer";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const db = new PrismaClient(),
  base = process.env.TEST_BASE_URL ?? "https://jobdesk.localhost",
  key = randomUUID();
const job = await db.job.create({
  data: {
    canonicalKey: key,
    title: "Referral Browser Fixture",
    company: "Referral Test Company",
    location: "Berlin",
    countries: ["DE"],
    description: "Stripe payments CI/CD React",
    applyUrl: "https://example.com/job",
    track: "Full stack",
    skills: ["Stripe"],
    score: 98,
    reasons: [],
    contentHash: key,
  },
});
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const click = async (text) => {
  assert.ok(
    await page.evaluate((text) => {
      const b = [...document.querySelectorAll("button")].find(
        (b) => b.textContent.trim() === text,
      );
      if (!b) return false;
      b.click();
      return true;
    }, text),
  );
};
const wait = (text) =>
  page.waitForFunction(
    (text) => document.body.innerText.includes(text),
    {},
    text,
  );
try {
  await page.setViewport({ width: 1440, height: 1080 });
  await page.goto(`${base}/?view=discover`, { waitUntil: "networkidle0" });
  await page.type(
    'input[aria-label="Search jobs"]',
    "Referral Browser Fixture",
  );
  await wait("Referral Browser Fixture");
  await page.click(".job-row");
  await wait("Referrals");
  await click("Referrals");
  await wait("Find a way into the team");
  await page.type('input[aria-label="Employer website"]', "example.com");
  await click("Add a contact");
  for (const [name, value] of Object.entries({
    name: "Alex Example",
    title: "Engineering Manager",
    email: "alex@example.com",
    linkedin: "https://www.linkedin.com/in/jobdesk-synthetic-example",
    sourceUrl: "https://example.com/team",
    sourceNote: "Synthetic browser test. Never send.",
  }))
    await page.type(`[name="${name}"]`, value);
  await click("Save contact");
  await wait("Alex Example");
  assert.equal(
    await page.evaluate(
      () =>
        [...document.querySelectorAll("button")].find(
          (b) => b.textContent === "Copy message",
        ).disabled,
    ),
    true,
  );
  let contact = await db.referral.findFirstOrThrow({
    where: { jobId: job.id },
  });
  assert.equal(contact.contactedAt, null);
  assert.equal(contact.status, "saved");
  assert.match(
    contact.drafts.referral,
    /Referral Browser Fixture role at Referral Test Company/,
  );
  const rejected = await page.evaluate(async (id) => {
    const r = await fetch(`/api/referrals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "contacted" }),
    });
    return r.status;
  }, contact.id);
  assert.equal(rejected, 400);
  await page.click(".referral-box .check-field input");
  const edited =
    "Hi Alex, this is an edited synthetic draft. No message was sent.";
  await page.evaluate((edited) => {
    const area = [...document.querySelectorAll(".referral-box textarea")][0];
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    ).set;
    setter.call(area, edited);
    area.dispatchEvent(new Event("input", { bubbles: true }));
  }, edited);

  await click("Save changes");
  await wait("Contact and draft changes saved.");
  contact = await db.referral.findUniqueOrThrow({ where: { id: contact.id } });
  assert.equal(contact.employmentReviewed, true);
  assert.equal(contact.status, "saved");
  assert.equal(contact.contactedAt, null);
  assert.equal(contact.drafts.referral, edited);
  await page.reload({ waitUntil: "networkidle0" });
  await page.type(
    'input[aria-label="Search jobs"]',
    "Referral Browser Fixture",
  );
  await wait("Referral Browser Fixture");
  await page.click(".job-row");
  await wait("Referrals");
  await click("Referrals");
  await wait("Alex Example");
  assert.equal(
    await page.$eval(".referral-box textarea", (e) => e.value),
    edited,
  );
  assert.equal(await db.application.count({ where: { jobId: job.id } }), 0);
  await page.screenshot({
    path: ".context/referrals-browser.png",
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "Referral browser workflow passed: sourced contact, review gate, persisted edits, no outreach/application recorded.",
  );
} finally {
  await browser.close();
  await db.job.delete({ where: { id: job.id } });
  await db.$disconnect();
}
