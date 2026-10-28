import { makeDrafts } from "./templates";
import { db } from "../db";
import { readProfile } from "../profile";
import { hash } from "../domain";
import { contactPriority, linkedinUrl, type FoundContact } from "./domain";
import { discoverPublic } from "./discovery";
export async function saveContact(jobId: string, contact: FoundContact) {
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  const email = contact.email.toLowerCase();
  const linkedin = linkedinUrl(contact.linkedin);
  const identity = hash(
    email || linkedin || `${contact.name.toLowerCase()}:${contact.sourceUrl}`,
  );
  return db.referral.upsert({
    where: { jobId_identity: { jobId, identity } },
    create: {
      ...contact,
      email,
      linkedin,
      jobId,
      identity,
      priority: contactPriority(contact.title || contact.sourceNote),
      drafts: makeDrafts(job, contact, await readProfile()),
    },
    update: {},
  });
}
export async function research(jobId: string, domain: string) {
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  await db.referralSearch.upsert({
    where: { jobId },
    create: { jobId },
    update: {},
  });
  const lock = await db.referralSearch.updateMany({
    where: {
      jobId,
      AND: [
        { OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
        {
          OR: [
            { lastRunAt: null },
            { lastRunAt: { lt: new Date(Date.now() - 60000) } },
          ],
        },
      ],
    },
    data: { leaseUntil: new Date(Date.now() + 120000), domain },
  });
  if (!lock.count)
    throw new Error(
      "Discovery is running or was just run. Please wait a minute before trying again.",
    );
  try {
    const result = await discoverPublic(job, domain);
    for (const contact of result.contacts) await saveContact(jobId, contact);
    await db.referralSearch.update({
      where: { jobId },
      data: { lastRunAt: new Date(), report: result.report },
    });
  } finally {
    await db.referralSearch.update({
      where: { jobId },
      data: { leaseUntil: null },
    });
  }
}
