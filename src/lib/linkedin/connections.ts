import { db } from "../db";
import { companyTokens, normalizeCompany, sameCompany } from "../mail/match";
import { linkedinUrl } from "../referrals/domain";

export type ConnectionRecord = {
  profileUrl: string;
  name: string;
  company: string;
  companyKey: string;
  position: string;
  email: string;
  connectedOn: Date | null;
};

export const companyKey = (name: string) => normalizeCompany(name);

// LinkedIn messages carry lower-cased profile URLs while the connections export keeps the
// member's own casing, so both sides are stored and looked up lower-cased.
const profileKey = (url: string) => (linkedinUrl(url) || url).toLowerCase();

// The mail matcher's rule for names read from text: equal, or the shorter name (5 characters
// or more) is the longer one's opening words.
export const keysMatch = (a: string, b: string): boolean =>
  sameCompany(companyTokens(a), companyTokens(b), false);

export function toConnection(
  row: Record<string, string>,
): ConnectionRecord | null {
  const profileUrl = linkedinUrl(row.URL ?? "").toLowerCase();
  const name = [row["First Name"], row["Last Name"]]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (!profileUrl || !name) return null;
  const connected = Date.parse(`${row["Connected On"] ?? ""} UTC`);
  return {
    profileUrl,
    name,
    company: (row.Company ?? "").trim(),
    companyKey: companyKey(row.Company ?? ""),
    position: (row.Position ?? "").trim(),
    email: (row["Email Address"] ?? "").trim().toLowerCase(),
    connectedOn: Number.isNaN(connected) ? null : new Date(connected),
  };
}

const tier = (position: string) =>
  /engineer|developer|architect|programmer|\bsre\b|devops/i.test(position)
    ? 0
    : /founder|\bcto\b|\bceo\b|head of engineering|engineering manager|vp.*engineering|tech lead/i.test(
          position,
        )
      ? 1
      : /recruit|talent|hiring|people|\bhr\b/i.test(position)
        ? 2
        : 3;
export const rank = <T extends { position: string }>(list: T[]) =>
  [...list].sort((a, b) => tier(a.position) - tier(b.position));

const differs = (stored: ConnectionRecord, next: ConnectionRecord) =>
  stored.name !== next.name ||
  stored.company !== next.company ||
  stored.companyKey !== next.companyKey ||
  stored.position !== next.position ||
  stored.email !== next.email ||
  stored.connectedOn?.getTime() !== next.connectedOn?.getTime();

// What a snapshot changes: new rows, changed rows, and (only for a complete snapshot)
// stored connections it no longer lists. A partial snapshot cannot tell a removed connection
// from one on a page that was never read.
export function connectionWrites(
  stored: ConnectionRecord[],
  records: ConnectionRecord[],
  complete: boolean,
) {
  const known = new Map(stored.map((c) => [c.profileUrl, c]));
  const listed = new Set(records.map((r) => r.profileUrl));
  return {
    create: records.filter((r) => !known.has(r.profileUrl)),
    update: records.filter((r) => {
      const old = known.get(r.profileUrl);
      return !!old && differs(old, r);
    }),
    remove: complete
      ? stored.map((c) => c.profileUrl).filter((url) => !listed.has(url))
      : [],
  };
}

// Brings the stored connections in line with a snapshot. Only new and changed rows are
// written, so a repeat run over ~1,500 connections is one read and at most one delete.
export async function refreshConnections(
  rows: Record<string, string>[],
  complete: boolean,
) {
  const records = [
    ...new Map(
      rows
        .map(toConnection)
        .filter((r): r is ConnectionRecord => !!r)
        .map((r) => [r.profileUrl, r] as const),
    ).values(),
  ];
  // A snapshot without a single usable row is a bad export, not an empty network.
  if (!records.length) return 0;
  await db.$transaction(
    async (tx) => {
      const writes = connectionWrites(
        await tx.linkedinConnection.findMany(),
        records,
        complete,
      );
      if (writes.remove.length)
        await tx.linkedinConnection.deleteMany({
          where: { profileUrl: { in: writes.remove } },
        });
      await tx.linkedinConnection.createMany({ data: writes.create });
      for (const record of writes.update)
        await tx.linkedinConnection.update({
          where: { profileUrl: record.profileUrl },
          data: record,
        });
    },
    { timeout: 120_000, maxWait: 30_000 },
  );
  return records.length;
}

// Connections whose current company is this one, best referral contacts first.
export async function connectionsAt(company: string) {
  const key = companyKey(company);
  if (key.length < 3) return [];
  // Matching names always share their first 3 key characters (equal keys, or a 5+ character
  // key opening the other), so this only narrows the scan; keysMatch decides.
  const found = await db.linkedinConnection.findMany({
    where: { companyKey: { startsWith: key.slice(0, 3) } },
  });
  return rank(found.filter((c) => keysMatch(c.company, company)));
}

// For LinkedIn messages: the sender's company, by profile URL. Only a message without a
// profile URL is looked up by exact name: a URL that is not stored is someone who is not a
// connection, however their name reads.
export async function companyOfSender(profileUrl: string, name: string) {
  if (profileUrl.trim()) {
    const byUrl = await db.linkedinConnection.findUnique({
      where: { profileUrl: profileKey(profileUrl) },
    });
    return byUrl?.company || null;
  }
  if (!name.trim()) return null;
  const byName = await db.linkedinConnection.findMany({
    where: { name: { equals: name.trim(), mode: "insensitive" } },
    take: 2,
  });
  // Two connections with the same name cannot tell which company is meant.
  return byName.length === 1 ? byName[0].company || null : null;
}
