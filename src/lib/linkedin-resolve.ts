import { load } from "cheerio";
import { db } from "./db";
import { isRecruiter, normalizeCompany, sameRole } from "./linkedin-email";

// LinkedIn jobs only link to LinkedIn. For each company seen only there, look for its own
// public job board, register it as a source, and fold each LinkedIn job into the matching
// board posting, which carries the full description and the direct application link.

const linkedinKinds = ["linkedin", "linkedin-email"];
const memoKey = "linkedinBoards";
const recheckDays = 14;
type Memo = Record<string, { checkedAt: string; sourceKey: string | null }>;
type Board = { kind: string; region: string; board: string; name: string };

const timeout = 10000;
async function get(url: string, text = false): Promise<any> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeout),
      headers: {
        Accept: text ? "text/html,application/xml" : "application/json",
        "User-Agent": "PersonalJobDesk/0.1",
      },
    });
    if (!response.ok) return null;
    const body = await response.text();
    return text ? body : JSON.parse(body);
  } catch {
    return null;
  }
}

// Board slugs a company is likely to use: "Snke OS GmbH" -> snkeos, snke-os, snke.
export function slugCandidates(company: string) {
  const words = company
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/\(.*?\)|\|.*$/g, " ")
    .replace(
      /\b(?:gmbh|ag|se|ug|kg|co|inc|ltd|llc|group|holding|germany|deutschland|europe)\b\.?/g,
      " ",
    )
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const slugs = new Set<string>();
  if (words.length) {
    slugs.add(words.join(""));
    slugs.add(words.join("-"));
    if (words.length > 1 && words[0].length >= 5) slugs.add(words[0]);
  }
  return [...slugs].filter((s) => s.length >= 3 && s.length <= 40);
}

// Each probe returns the board's job titles and, when the provider states it, the company name.
const probes: ((
  slug: string,
) => Promise<{ board: Board; titles: string[]; named?: string } | null>)[] = [
  async (slug) => {
    for (const [region, host] of [
      ["global", "boards-api.greenhouse.io"],
      ["eu", "boards.eu.greenhouse.io"],
    ]) {
      const d = await get(`https://${host}/v1/boards/${slug}/jobs`);
      if (Array.isArray(d?.jobs) && d.jobs.length) {
        const meta = await get(`https://${host}/v1/boards/${slug}`);
        return {
          board: {
            kind: "greenhouse",
            region,
            board: slug,
            name: meta?.name ?? slug,
          },
          titles: d.jobs.map((j: any) => j.title),
          named: meta?.name,
        };
      }
    }
    return null;
  },
  async (slug) => {
    const d = await get(
      `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
    );
    return Array.isArray(d?.jobs) && d.jobs.length
      ? {
          board: { kind: "ashby", region: "global", board: slug, name: slug },
          titles: d.jobs.map((j: any) => j.title),
        }
      : null;
  },
  async (slug) => {
    for (const [region, host] of [
      ["global", "api.lever.co"],
      ["eu", "api.eu.lever.co"],
    ]) {
      const d = await get(`https://${host}/v0/postings/${slug}?mode=json`);
      if (Array.isArray(d) && d.length)
        return {
          board: { kind: "lever", region, board: slug, name: slug },
          titles: d.map((j: any) => j.text),
        };
    }
    return null;
  },
  async (slug) => {
    for (const tld of ["de", "com"]) {
      const list = await get(
        `https://${slug}.jobs.personio.${tld}/search.json`,
      );
      if (Array.isArray(list) && list.length)
        return {
          board: { kind: "personio", region: tld, board: slug, name: slug },
          titles: list.map((j: any) => j.name),
        };
    }
    return null;
  },
  async (slug) => {
    const d = await get(`https://${slug}.recruitee.com/api/offers/`);
    return Array.isArray(d?.offers) && d.offers.length
      ? {
          board: {
            kind: "recruitee",
            region: "global",
            board: slug,
            name: slug,
          },
          titles: d.offers.map((j: any) => j.title),
          named: d.offers[0]?.company_name,
        }
      : null;
  },
  async (slug) => {
    const d = await get(
      `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`,
    );
    return Array.isArray(d?.content) && d.content.length
      ? {
          board: {
            kind: "smartrecruiters",
            region: "global",
            board: slug,
            name: slug,
          },
          titles: d.content.map((j: any) => j.name),
          named: d.content[0]?.company?.name,
        }
      : null;
  },
  async (slug) => {
    const rss = await get(`https://${slug}.teamtailor.com/jobs.rss`, true);
    if (typeof rss !== "string" || !rss.includes("<item>")) return null;
    const $ = load(rss, { xml: true });
    return {
      board: { kind: "teamtailor", region: "global", board: slug, name: slug },
      titles: $("item > title")
        .toArray()
        .map((el) => $(el).text()),
      named: $("channel > title").first().text(),
    };
  },
  async (slug) => {
    const page = await get(`https://join.com/companies/${slug}`, true);
    if (typeof page !== "string") return null;
    try {
      const state = JSON.parse(load(page)("script#__NEXT_DATA__").html() ?? "")
        .props.pageProps.initialState;
      const items = state?.jobs?.items ?? [];
      return items.length
        ? {
            board: { kind: "join", region: "global", board: slug, name: slug },
            titles: items.map((j: any) => j.title),
            named: state?.company?.name,
          }
        : null;
    } catch {
      return null;
    }
  },
];

// A board belongs to the company when it lists one of the LinkedIn roles, or when the
// provider's own company name matches.
export async function findBoard(
  company: string,
  titles: string[],
): Promise<Board | null> {
  const want = normalizeCompany(company);
  for (const slug of slugCandidates(company)) {
    const results = await Promise.all(probes.map((probe) => probe(slug)));
    for (const r of results) {
      if (!r) continue;
      const titled = r.titles.some((t) => titles.some((l) => sameRole(t, l)));
      const named = r.named && normalizeCompany(r.named) === want;
      if (titled || named) return { ...r.board, name: company };
    }
  }
  return null;
}

type Sync = (sourceId: string) => Promise<unknown>;

export async function resolveLinkedinJobs(sync: Sync, maxCompanies = 25) {
  const memoRow = await db.setting.findUnique({ where: { key: memoKey } });
  const memo: Memo = (memoRow?.value as Memo) ?? {};
  const linkedinOnly = await db.job.findMany({
    where: {
      liveStatus: "listed",
      listings: { every: { source: { kind: { in: linkedinKinds } } } },
    },
    select: { id: true, title: true, company: true, description: true },
  });
  const byCompany = new Map<string, { name: string; titles: string[] }>();
  for (const job of linkedinOnly) {
    if (isRecruiter(job.company, job.description)) continue;
    const key = normalizeCompany(job.company);
    if (!key) continue;
    const entry = byCompany.get(key) ?? { name: job.company, titles: [] };
    entry.titles.push(job.title);
    byCompany.set(key, entry);
  }
  const sources = await db.source.findMany({
    where: {
      kind: {
        notIn: [
          ...linkedinKinds,
          "archive",
          "arbeitnow",
          "himalayas",
          "remotive",
          "arbeitsagentur",
          "mail",
        ],
      },
    },
  });
  const known = new Map(sources.map((s) => [normalizeCompany(s.name), s]));
  for (const s of sources)
    if (s.board)
      known.set(
        normalizeCompany(s.board),
        known.get(normalizeCompany(s.board)) ?? s,
      );
  const now = Date.now();
  let checked = 0;
  let registered = 0;
  for (const [key, { name, titles }] of byCompany) {
    const seen = memo[key];
    let source =
      known.get(key) ??
      (seen?.sourceKey
        ? sources.find((s) => s.key === seen.sourceKey)
        : undefined);
    if (!source) {
      if (seen && now - Date.parse(seen.checkedAt) < recheckDays * 86400000)
        continue;
      if (checked >= maxCompanies) continue;
      checked++;
      const board = await findBoard(name, titles);
      if (board) {
        const sourceKey = `${board.kind}-${board.region}-${board.board.toLowerCase()}`;
        source =
          (await db.source.findUnique({ where: { key: sourceKey } })) ??
          (await db.source.create({
            data: {
              key: sourceKey,
              name: board.name,
              kind: board.kind,
              board: board.board,
              region: board.region,
              enabled: true,
              intervalMinutes: 360,
            },
          }));
        registered++;
        try {
          await sync(source.id);
        } catch {
          // A failing board keeps its LinkedIn jobs; the source shows the error on its own.
        }
      }
      memo[key] = {
        checkedAt: new Date(now).toISOString(),
        sourceKey: source?.key ?? null,
      };
    } else if (!seen?.sourceKey)
      memo[key] = {
        checkedAt: new Date(now).toISOString(),
        sourceKey: source.key,
      };
  }
  await db.setting.upsert({
    where: { key: memoKey },
    create: { key: memoKey, value: memo },
    update: { value: memo },
  });
  const merged = await mergeLinkedinJobs(memo);
  return { checked, registered, merged };
}

// Moves each LinkedIn listing onto the same role from the employer's board and removes the
// LinkedIn-only copy. Jobs with an application, documents or referral contacts are left alone.
export async function mergeLinkedinJobs(memo?: Memo) {
  memo ??=
    ((await db.setting.findUnique({ where: { key: memoKey } }))
      ?.value as Memo) ?? {};
  const boardKeys = new Map(
    Object.entries(memo)
      .filter(([, v]) => v.sourceKey)
      .map(([k, v]) => [k, v.sourceKey!]),
  );
  const linkedinOnly = await db.job.findMany({
    where: { listings: { every: { source: { kind: { in: linkedinKinds } } } } },
    select: {
      id: true,
      title: true,
      company: true,
      application: { select: { id: true } },
      _count: { select: { documents: true, referrals: true } },
    },
  });
  let merged = 0;
  for (const job of linkedinOnly) {
    if (job.application || job._count.documents || job._count.referrals)
      continue;
    const sourceKey = boardKeys.get(normalizeCompany(job.company));
    if (!sourceKey) continue;
    const candidates = await db.job.findMany({
      where: {
        listings: { some: { source: { key: sourceKey } } },
        liveStatus: "listed",
      },
      select: { id: true, title: true },
    });
    const target = candidates.find((c) => sameRole(c.title, job.title));
    if (!target) continue;
    await db.$transaction([
      db.listing.updateMany({
        where: { jobId: job.id },
        data: { jobId: target.id },
      }),
      db.job.delete({ where: { id: job.id } }),
    ]);
    merged++;
  }
  return merged;
}
