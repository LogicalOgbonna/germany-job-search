import { db } from "../db";
import { normalizeCompany } from "../mail/match";
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

// Keys of the name's opening words, legal suffixes dropped at each cut: "Grafana Labs GmbH"
// gives grafana, grafanalabs. The last one is the whole name's key.
function openingKeys(name: string): string[] {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.map((_, i) => companyKey(words.slice(0, i + 1).join(" ")));
}

// Same rule as the mail matcher for names read from text: equal, or the shorter name
// (5 characters or more) is the longer one's opening words.
export function keysMatch(a: string, b: string): boolean {
  const x = openingKeys(a);
  const y = openingKeys(b);
  const kx = x[x.length - 1];
  const ky = y[y.length - 1];
  if (!kx || !ky) return false;
  if (kx === ky) return true;
  const [short, long] = kx.length <= ky.length ? [kx, y] : [ky, x];
  return short.length >= 5 && long.includes(short);
}

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

// Replaces the stored connections with a complete snapshot. Only new and changed rows are
// written, so a repeat run over ~1,500 connections is one read and one delete.
export async function refreshConnections(rows: Record<string, string>[]) {
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
      const stored = new Map(
        (await tx.linkedinConnection.findMany()).map((c) => [c.profileUrl, c]),
      );
      await tx.linkedinConnection.deleteMany({
        where: { profileUrl: { notIn: records.map((r) => r.profileUrl) } },
      });
      await tx.linkedinConnection.createMany({
        data: records.filter((r) => !stored.has(r.profileUrl)),
      });
      for (const record of records) {
        const old = stored.get(record.profileUrl);
        if (old && differs(old, record))
          await tx.linkedinConnection.update({
            where: { profileUrl: record.profileUrl },
            data: record,
          });
      }
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

// For LinkedIn messages: the sender's company, by profile URL, else by exact name.
export async function companyOfSender(profileUrl: string, name: string) {
  const byUrl = profileUrl
    ? await db.linkedinConnection.findUnique({
        where: { profileUrl: profileKey(profileUrl) },
      })
    : null;
  if (byUrl) return byUrl.company || null;
  if (!name.trim()) return null;
  const byName = await db.linkedinConnection.findMany({
    where: { name: { equals: name.trim(), mode: "insensitive" } },
    take: 2,
  });
  // Two connections with the same name cannot tell which company is meant.
  return byName.length === 1 ? byName[0].company || null : null;
}
