import { makeDrafts } from "./templates";
import { db } from "../db";
import { readProfile } from "../profile";
import { hash } from "../domain";
import { contactPriority, linkedinUrl, type FoundContact } from "./domain";
import { discoverPublic } from "./discovery";
export async function saveContact(
  jobId: string,
  contact: FoundContact,
  options: { connected?: boolean } = {},
) {
  const job = await db.job.findUniqueOrThrow({ where: { id: jobId } });
  const email = contact.email.toLowerCase();
  // LinkedIn profile paths are case-insensitive, and connections are stored lower-cased.
  const linkedin = linkedinUrl(contact.linkedin).toLowerCase();
  const identity = hash(
    email || linkedin || `${contact.name.toLowerCase()}:${contact.sourceUrl}`,
  );
  // A contact saved before LinkedIn URLs were lower-cased has its identity from the casing
  // it was entered with: it is the same person, so it is returned untouched, as upsert does.
  if (!email && linkedin) {
    const earlier = await db.referral.findFirst({
      where: { jobId, linkedin: { equals: linkedin, mode: "insensitive" } },
    });
    if (earlier) return earlier;
  }
  return db.referral.upsert({
    where: { jobId_identity: { jobId, identity } },
    create: {
      ...contact,
      email,
      linkedin,
      jobId,
      identity,
      priority: contactPriority(contact.title || contact.sourceNote),
      drafts: makeDrafts(job, contact, await readProfile(), options),
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
