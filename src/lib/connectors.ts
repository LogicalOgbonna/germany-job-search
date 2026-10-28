import { load } from "cheerio";
import type { Source } from "@prisma/client";
import { IncomingJob, countryCodes, safeUrl } from "./domain";
import { parseLinkedinEmail } from "./linkedin-email";
import { gmailClient } from "./mail/gmail";

export const engineeringTitle =
  /engineer|entwickler|developer|software|full.?stack|front.?end|back.?end/i;
export function plain(html: string) {
  const $ = load(html);
  $("script,style,iframe,object").remove();
  $("br").replaceWith("\n");
  $("p,li,div,h1,h2,h3").append("\n");
  return $.text()
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();
}
class ProviderError extends Error {
  constructor(
    message: string,
    public retryAfterSeconds = 0,
    public status = 0,
  ) {
    super(message);
  }
}
async function request(
  url: string,
  text = false,
  extraHeaders: Record<string, string> = {},
): Promise<any> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    redirect: "error",
    headers: {
      Accept: text
        ? "application/xml, text/html;q=0.9, */*;q=0.8"
        : "application/json",
      "User-Agent": "PersonalJobDesk/0.1",
      ...extraHeaders,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const retry = response.headers.get("retry-after");
    const seconds = retry
      ? /^\d+$/.test(retry)
        ? Number(retry)
        : Math.max(0, (Date.parse(retry) - Date.now()) / 1000)
      : 0;
    throw new ProviderError(
      `Provider returned HTTP ${response.status}`,
      Number.isFinite(seconds) ? seconds : 0,
      response.status,
    );
  }
  const body = await response.text();
  if (body.length > 15_000_000)
    throw new Error("Feed exceeded the response-size budget");
  return text ? body : JSON.parse(body);
}
const date = (value: unknown) => {
  if (!value) return null;
  const d = new Date(typeof value === "number" ? value * 1000 : String(value));
  return Number.isNaN(d.valueOf()) || d > new Date(Date.now() + 86400000)
    ? null
    : d;
};
const arr = (value: unknown): any[] => {
  if (!Array.isArray(value)) throw new Error("Provider response shape changed");
  return value;
};
// Personio offices are often just "Remote" or "Hybrid"; the title may still name the country.
const named = (text: string) => {
  const found = countryCodes(text);
  return found.length ? found : undefined;
};
const codes = (values: unknown[]) => {
  const found = [
    ...new Set(
      values
        .filter((v) => typeof v === "string" && /^[a-z]{2}$/i.test(v))
        .map((v) => String(v).toUpperCase()),
    ),
  ];
  return found.length ? found : undefined;
};
function nextData(html: unknown) {
  const raw = load(String(html))("script#__NEXT_DATA__").html();
  try {
    return JSON.parse(raw ?? "").props.pageProps.initialState;
  } catch {
    throw new Error("Provider response shape changed");
  }
}
export function parseFeed(
  kind: string,
  data: any,
  source: Pick<Source, "name" | "board" | "region">,
): IncomingJob[] {
  if (kind === "greenhouse")
    return arr(data.jobs).map((j) => ({
      externalId: String(j.id),
      title: j.title,
      company: source.name,
      location: j.location?.name ?? "Not specified",
      description: plain(j.content ?? ""),
      applyUrl: j.absolute_url,
    }));
  if (kind === "ashby")
    return arr(data.jobs)
      .filter((j) => j.isListed !== false)
      .map((j) => ({
        externalId: j.jobUrl,
        title: j.title,
        company: source.name,
        location: [
          j.location,
          ...(j.secondaryLocations ?? []).map((x: any) => x.location),
        ]
          .filter(Boolean)
          .join(" · "),
        description: j.descriptionPlain ?? plain(j.descriptionHtml ?? ""),
        applyUrl: j.applyUrl ?? j.jobUrl,
        sourceUrl: j.jobUrl,
        remote: j.isRemote === true,
        salary: j.compensation?.scrapeableCompensationSalarySummary,
        publishedAt: date(j.publishedAt),
      }));
  if (kind === "lever")
    return arr(data).map((j) => ({
      externalId: j.id,
      title: j.text,
      company: source.name,
      location: (
        j.categories?.allLocations ?? [
          j.categories?.location ?? "Not specified",
        ]
      ).join(" · "),
      description: [
        j.descriptionPlain,
        ...(j.lists ?? []).map((x: any) => `${x.text}\n${plain(x.content)}`),
        j.additionalPlain,
      ]
        .filter(Boolean)
        .join("\n\n"),
      applyUrl: j.applyUrl,
      sourceUrl: j.hostedUrl,
      remote: j.workplaceType === "remote",
      countries: j.country ? [j.country.toUpperCase()] : undefined,
      salary: j.salaryRange
        ? `${j.salaryRange.currency} ${j.salaryRange.min}–${j.salaryRange.max} / ${j.salaryRange.interval}`
        : undefined,
    }));
  if (kind === "arbeitnow")
    return arr(data.data).map((j) => ({
      externalId: j.slug,
      title: j.title,
      company: j.company_name,
      location: j.location,
      description: plain(j.description),
      applyUrl: j.url,
      remote: !!j.remote,
      publishedAt: date(j.created_at),
    }));
  if (kind === "linkedin")
    // LinkedIn's public guest job pages. The employer's own apply link sits behind sign-in,
    // so the LinkedIn posting is the link; the same role from a career board wins in ranking.
    return arr(data.jobs).map((j) => ({
      externalId: String(j.id),
      title: j.title,
      company: j.company,
      location: j.location || source.board,
      countries: /germany|deutschland/i.test(j.location ?? "")
        ? ["DE"]
        : undefined,
      remote: /remote/i.test(`${j.location} ${j.workplace ?? ""}`),
      description: [
        j.employmentType ? `Employment type: ${j.employmentType}` : "",
        j.seniority ? `Seniority level: ${j.seniority}` : "",
        plain(j.descriptionHtml ?? ""),
      ]
        .filter(Boolean)
        .join("\n"),
      applyUrl: `https://www.linkedin.com/jobs/view/${encodeURIComponent(j.id)}/`,
      sourceUrl: `https://www.linkedin.com/jobs/view/${encodeURIComponent(j.id)}/`,
      publishedAt: date(j.postedAt),
    }));
  if (kind === "linkedin-email")
    // Jobs listed in LinkedIn job alert / recommendation emails. Only a summary is known;
    // the full posting arrives when the employer's own board is found (linkedin-resolve.ts).
    return arr(data.mails).flatMap((mail) =>
      parseLinkedinEmail(String(mail.body ?? "")).map((j) => ({
        externalId: j.id,
        title: j.title,
        company: j.company,
        location: j.location || (j.germany ? "Germany" : "Not specified"),
        countries: j.germany ? ["DE"] : named(j.location),
        remote: /remote/i.test(`${j.title} ${j.location}`),
        description: [
          j.search
            ? `Found through your LinkedIn job alert "${j.search}".`
            : "Recommended to you by LinkedIn.",
          j.easyApply
            ? "Applied to on LinkedIn (Easy Apply)."
            : "Applied to on the employer's own site; LinkedIn shows that link only after sign-in.",
          "The full description arrives once the employer's own job board is found.",
        ].join(" "),
        applyUrl: `https://www.linkedin.com/jobs/view/${j.id}/`,
        sourceUrl: `https://www.linkedin.com/jobs/view/${j.id}/`,
        publishedAt: date(mail.receivedAt),
        summaryOnly: true,
        easyApply: j.easyApply,
      })),
    );
  if (kind === "arbeitsagentur")
    // Details from the Bundesagentur für Arbeit Jobbörse. Agency and temp-staffing ads are left out.
    return arr(data.jobs)
      .filter(
        (j) =>
          j.istPrivateArbeitsvermittlung !== true &&
          j.istArbeitnehmerUeberlassung !== true,
      )
      .map((j) => {
        const place = j.stellenlokationen?.[0]?.adresse ?? {};
        const page = `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(j.referenznummer)}`;
        return {
          externalId: String(j.referenznummer),
          title: j.stellenangebotsTitel,
          company: String(j.firma ?? "")
            .replace(/\s+/g, " ")
            .trim(),
          location: [
            [place.plz, place.ort].filter(Boolean).join(" ") || source.board,
            j.homeofficemoeglich ? "home office possible" : "",
          ]
            .filter(Boolean)
            .join(" · "),
          countries: ["DE"],
          description: String(j.stellenangebotsBeschreibung ?? ""),
          applyUrl: safeUrl(String(j.externeURL ?? "")) || page,
          sourceUrl: page,
          publishedAt: date(j.datumErsteVeroeffentlichung),
        };
      });
  if (kind === "himalayas")
    return arr(data.jobs).map((j) => ({
      externalId: String(j.guid ?? j.applicationLink),
      title: j.title,
      company: j.companyName,
      location: j.locationRestrictions?.length
        ? j.locationRestrictions.join(", ")
        : "Remote · restrictions not specified",
      countries: (j.locationRestrictions ?? []).flatMap((c: string) =>
        countryCodes(c),
      ),
      description: plain(j.description ?? j.excerpt ?? ""),
      applyUrl: j.applicationLink,
      sourceUrl:
        safeUrl(String(j.guid)) ||
        `https://himalayas.app/companies/${j.companySlug}/jobs`,
      remote: true,
      publishedAt: date(j.pubDate),
      salary: j.minSalary
        ? `${j.currency} ${j.minSalary}–${j.maxSalary ?? j.minSalary} / ${j.salaryPeriod ?? "year"}`
        : undefined,
    }));
  if (kind === "remotive")
    return arr(data.jobs).map((j) => ({
      externalId: String(j.id),
      title: j.title,
      company: j.company_name,
      location:
        j.candidate_required_location || "Remote · restrictions not specified",
      description: plain(j.description),
      applyUrl: j.url,
      remote: true,
      publishedAt: date(j.publication_date),
      salary: j.salary || undefined,
    }));
  if (kind === "join")
    return arr(data.jobs).map((j) => ({
      externalId: String(j.id),
      title: j.title,
      company: source.name,
      location:
        [
          [j.city?.cityName, j.city?.countryName ?? j.country?.name]
            .filter(Boolean)
            .join(", "),
          j.workplaceType === "REMOTE" ? "Remote" : "",
        ]
          .filter(Boolean)
          .join(" · ") || "Not specified",
      countries: codes([j.country?.iso3166 ?? j.city?.countryCode]),
      description: plain(j.descriptionHtml ?? ""),
      applyUrl: `https://join.com/companies/${source.board}/${j.idParam}`,
      remote: j.workplaceType === "REMOTE",
      publishedAt: date(j.createdAt),
      salary: j.salaryAmountFrom?.amount
        ? `${j.salaryAmountFrom.currency} ${j.salaryAmountFrom.amount / 100}–${(j.salaryAmountTo?.amount ?? j.salaryAmountFrom.amount) / 100} / ${String(
            j.salaryFrequency ?? "PER_YEAR",
          )
            .replace("PER_", "")
            .toLowerCase()}`
        : undefined,
    }));
  // Employers that keep the XML feed switched off still publish a job list and job pages.
  if (kind === "personio" && typeof data === "object")
    return arr(data.positions).map((j) => {
      const $ = load(String(j.page ?? ""));
      $("main").find("h1,a,button,nav").remove();
      return {
        externalId: String(j.id),
        title: j.name,
        company: source.name,
        location: (j.offices ?? [j.office]).filter(Boolean).join(", "),
        countries: named(`${j.office ?? ""} ${j.name ?? ""}`),
        description: plain($("main").html() ?? ""),
        applyUrl: `https://${source.board}.jobs.personio.${source.region === "com" ? "com" : "de"}/job/${j.id}`,
      };
    });
  if (kind === "personio") {
    const $ = load(String(data), { xml: true });
    if (!$("workzag-jobs").length)
      throw new Error("Personio XML feed unavailable or changed");
    return $("position")
      .toArray()
      .map((el) => {
        const node = $(el);
        const id = node.find("id").first().text();
        return {
          externalId: id,
          title: node.find("name").first().text(),
          company: source.name,
          location: [
            node.find("office").text(),
            node.find("additionalOffices").text(),
          ]
            .filter(Boolean)
            .join(", "),
          description: node
            .find("jobDescription")
            .toArray()
            .map(
              (d) =>
                `${$(d).find("name").text()}\n${plain($(d).find("value").text())}`,
            )
            .join("\n\n"),
          applyUrl: `https://${source.board}.jobs.personio.${source.region === "com" ? "com" : "de"}/job/${id}`,
        };
      });
  }
  if (kind === "recruitee")
    return arr(data.offers)
      .filter((j) => !j.status || j.status === "published")
      .map((j) => ({
        externalId: String(j.id),
        title: j.title,
        company: source.name,
        location:
          [j.location, j.remote ? "Remote" : ""].filter(Boolean).join(" · ") ||
          "Not specified",
        countries: codes((j.locations ?? []).map((x: any) => x.country_code)),
        description: plain(`${j.description ?? ""}${j.requirements ?? ""}`),
        applyUrl: j.careers_url,
        remote: j.remote === true,
        publishedAt: date(j.published_at),
        salary: j.salary?.min
          ? `${j.salary.currency} ${j.salary.min}–${j.salary.max ?? j.salary.min} / ${j.salary.period ?? "year"}`
          : undefined,
      }));
  if (kind === "workable")
    return arr(data.jobs).map((j) => ({
      externalId: String(j.shortcode),
      title: j.title,
      company: source.name,
      location:
        [
          [j.city, j.country].filter(Boolean).join(", "),
          j.telecommuting ? "Remote" : "",
        ]
          .filter(Boolean)
          .join(" · ") || "Not specified",
      countries: codes((j.locations ?? []).map((x: any) => x.countryCode)),
      description: plain(j.description ?? ""),
      applyUrl: j.application_url ?? j.url,
      sourceUrl: j.url,
      remote: j.telecommuting === true,
      publishedAt: date(j.published_on),
    }));
  if (kind === "smartrecruiters")
    return arr(data.content).map((j) => ({
      externalId: String(j.id),
      title: j.name,
      company: source.name,
      location:
        [
          j.location?.fullLocation ?? j.location?.city,
          j.location?.remote ? "Remote" : "",
        ]
          .filter(Boolean)
          .join(" · ") || "Not specified",
      countries: codes([j.location?.country]),
      description: Object.values(j.jobAd?.sections ?? {})
        .map((x: any) => `${x.title ?? ""}\n${plain(x.text ?? "")}`.trim())
        .filter(Boolean)
        .join("\n\n"),
      applyUrl: j.applyUrl ?? j.postingUrl,
      sourceUrl: j.postingUrl,
      remote: j.location?.remote === true,
      publishedAt: date(j.releasedDate),
    }));
  if (kind === "teamtailor") {
    const $ = load(String(data), { xml: true });
    if (!$("rss > channel").length)
      throw new Error("Teamtailor RSS feed unavailable or changed");
    return $("item")
      .toArray()
      .map((el) => {
        const node = $(el);
        const places = node
          .find("tt\\:location")
          .toArray()
          .map((place) =>
            [
              $(place).find("tt\\:city").text() ||
                $(place).find("tt\\:name").text(),
              $(place).find("tt\\:country").text(),
            ]
              .filter(Boolean)
              .join(", "),
          );
        const remote = node.find("remoteStatus").text() === "fully";
        return {
          externalId:
            node.find("guid").text() || node.find("link").first().text(),
          title: node.find("title").first().text(),
          company: source.name,
          location:
            [...new Set(places), remote ? "Remote" : ""]
              .filter(Boolean)
              .join(" · ") || "Not specified",
          description: plain(node.find("description").first().text()),
          applyUrl: node.find("link").first().text(),
          remote,
          publishedAt: date(node.find("pubDate").text()),
        };
      });
  }
  throw new Error("Unsupported source type");
}
// Feeds without descriptions need one request per job, so only engineering titles are followed up.
const detailBudget = 120;
const arbeitnowPages = 120;
const pageDelayMs = 2500;
const himalayasQueries = [
  "software engineer",
  "frontend engineer",
  "full stack engineer",
  "react",
  "typescript",
  "product engineer",
  "ai engineer",
  "node.js",
];
// Bundesagentur searches around the source's city (its board, e.g. "Berlin"), last 30 days.
const arbeitsagenturQueries = [
  "Software Engineer",
  "Softwareentwickler",
  "Full Stack",
  "Fullstack",
  "Frontend",
  "React",
  "TypeScript",
  "Node.js",
  "Web Developer",
  "AI Engineer",
];
const arbeitsagenturApi =
  "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service";
// The public client id documented for the Jobbörse web app, not a personal secret.
const arbeitsagenturKey = { "X-API-Key": "jobboerse-jobsuche" };
const arbeitsagenturDetails = 300;
// LinkedIn guest search: role keywords per city, postings from the last day only.
const linkedinQueries = [
  "Senior Frontend Engineer",
  "Senior Full Stack Engineer",
  "Fullstack Developer",
  "Senior Software Engineer TypeScript",
  "React Developer",
  "Node.js Engineer",
  "Product Engineer",
  "AI Engineer",
  "Forward Deployed Engineer",
  "Frontend Developer",
];
const linkedinPlaces: Record<string, string> = {
  berlin: "Berlin, Germany",
  munich: "Munich, Bavaria, Germany",
  hamburg: "Hamburg, Germany",
  germany: "Germany",
};
const linkedinDetails = 250;
const linkedinHeaders = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
};
// Parses one page of guest search results into minimal job cards.
export function parseLinkedinCards(page: string) {
  const $ = load(page);
  return $("li")
    .toArray()
    .map((li) => {
      const card = $(li);
      const urn = card.find("[data-entity-urn]").attr("data-entity-urn") ?? "";
      const id = urn.match(/(\d+)$/)?.[1];
      const title = card.find(".base-search-card__title").text().trim();
      const company = card.find(".base-search-card__subtitle").text().trim();
      return id && title && company
        ? {
            id,
            title,
            company,
            location: card.find(".job-search-card__location").text().trim(),
            postedAt: card.find("time").attr("datetime") ?? null,
          }
        : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
}
// Reads description and criteria from a guest job page.
export function parseLinkedinDetail(page: string) {
  const $ = load(page);
  const criteria: Record<string, string> = {};
  $(".description__job-criteria-item").each((_, el) => {
    const k = $(el).find(".description__job-criteria-subheader").text().trim();
    const v = $(el).find(".description__job-criteria-text").text().trim();
    if (k) criteria[k] = v;
  });
  return {
    descriptionHtml: $(".show-more-less-html__markup").first().html() ?? "",
    employmentType: criteria["Employment type"] ?? "",
    seniority: criteria["Seniority level"] ?? "",
  };
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Waits out up to two rate limits per page; returns null if the provider keeps refusing.
async function politely<T>(load: () => Promise<T>): Promise<T | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await load();
    } catch (error) {
      if (!(error instanceof ProviderError) || error.status !== 429)
        throw error;
      if (attempt === 2) return null;
      await pause(Math.min(60, Math.max(15, error.retryAfterSeconds)) * 1000);
    }
  }
}
async function details<T>(wanted: any[], load: (job: any) => Promise<T>) {
  const result: T[] = [];
  for (let i = 0; i < Math.min(wanted.length, detailBudget); i += 6)
    result.push(...(await Promise.all(wanted.slice(i, i + 6).map(load))));
  return result;
}
export async function fetchSource(
  source: Source,
): Promise<{ jobs: IncomingJob[]; complete: boolean }> {
  if (source.board && !/^[a-zA-Z0-9_-]{1,100}$/.test(source.board))
    throw new Error("Invalid board identifier");
  let jobs: IncomingJob[] = [];
  let complete = true;
  const board = encodeURIComponent(source.board);
  if (source.kind === "greenhouse") {
    const host =
      source.region === "eu"
        ? "boards.eu.greenhouse.io"
        : "boards-api.greenhouse.io";
    const url = `https://${host}/v1/boards/${board}/jobs?content=true`;
    jobs = parseFeed(source.kind, await request(url), source);
  } else if (source.kind === "ashby") {
    jobs = parseFeed(
      source.kind,
      await request(
        `https://api.ashbyhq.com/posting-api/job-board/${board}?includeCompensation=true`,
      ),
      source,
    );
  } else if (source.kind === "lever") {
    for (let page = 0; page < 10; page++) {
      const data = await request(
        `https://${source.region === "eu" ? "api.eu.lever.co" : "api.lever.co"}/v0/postings/${board}?mode=json&limit=100&skip=${page * 100}`,
      );
      jobs.push(...parseFeed(source.kind, data, source));
      if (data.length < 100) break;
      if (page === 9) complete = false;
    }
  } else if (source.kind === "personio") {
    const site = `https://${board}.jobs.personio.${source.region === "com" ? "com" : "de"}`;
    try {
      jobs = parseFeed(
        source.kind,
        await request(`${site}/xml?language=en`, true),
        source,
      );
    } catch (error) {
      if (!(error instanceof ProviderError) || error.status !== 404)
        throw error;
      const wanted = arr(await request(`${site}/search.json`)).filter((j) =>
        engineeringTitle.test(j.name ?? ""),
      );
      if (wanted.length > detailBudget) complete = false;
      const positions = await details(wanted, async (j) => ({
        ...j,
        page: await request(
          `${site}/job/${encodeURIComponent(j.id)}?language=en`,
          true,
        ),
      }));
      jobs = parseFeed(source.kind, { positions }, source);
    }
  } else if (source.kind === "join") {
    const wanted: any[] = [];
    for (let page = 1; page <= 10; page++) {
      const state = nextData(
        await request(`https://join.com/companies/${board}?page=${page}`, true),
      );
      wanted.push(
        ...arr(state.jobs?.items).filter((j) =>
          engineeringTitle.test(j.title ?? ""),
        ),
      );
      if (page >= (state.jobs?.pagination?.pageCount ?? 1)) break;
      if (page === 10) complete = false;
    }
    if (wanted.length > detailBudget) complete = false;
    jobs = parseFeed(
      source.kind,
      {
        jobs: await details(
          wanted,
          async (j) =>
            nextData(
              await request(
                `https://join.com/companies/${board}/${encodeURIComponent(j.idParam)}`,
                true,
              ),
            ).job,
        ),
      },
      source,
    );
  } else if (source.kind === "arbeitnow") {
    // Arbeitnow lists about 90 pages of Germany jobs. Read all of them slowly; it rate-limits fast clients.
    for (let page = 1; page <= arbeitnowPages; page++) {
      const data = await politely(() =>
        request(`https://www.arbeitnow.com/api/job-board-api?page=${page}`),
      );
      if (!data) {
        if (page === 1)
          throw new ProviderError("Arbeitnow kept rate limiting", 900, 429);
        complete = false;
        break;
      }
      jobs.push(...parseFeed(source.kind, data, source));
      if (!data.links?.next || !data.data?.length) break;
      if (page === arbeitnowPages) complete = false;
      await pause(pageDelayMs);
    }
  } else if (source.kind === "linkedin") {
    const place = linkedinPlaces[source.board];
    if (!place) throw new Error("Unsupported LinkedIn place");
    const cards = new Map<
      string,
      ReturnType<typeof parseLinkedinCards>[number]
    >();
    let blocked = false;
    for (const keywords of linkedinQueries) {
      if (blocked) break;
      for (let start = 0; start < 100; start += 10) {
        const params = new URLSearchParams({
          keywords,
          location: place,
          f_TPR: "r86400",
          start: String(start),
        });
        const page = await politely(
          () =>
            request(
              `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${params}`,
              true,
              linkedinHeaders,
            ),
          // LinkedIn also answers 999 or 403 when it throttles guests; keep what was found.
        ).catch(() => null);
        if (page === null) {
          blocked = true;
          complete = false;
          break;
        }
        const found = parseLinkedinCards(page);
        for (const c of found)
          if (engineeringTitle.test(c.title)) cards.set(c.id, c);
        if (found.length < 10) break;
        await pause(1500);
      }
    }
    const wanted = [...cards.values()];
    if (wanted.length > linkedinDetails) complete = false;
    const detailed: any[] = [];
    for (const card of wanted.slice(0, linkedinDetails)) {
      const page = await politely(() =>
        request(
          `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${card.id}`,
          true,
          linkedinHeaders,
        ),
      ).catch(() => null);
      if (page === null) {
        complete = false;
        break;
      }
      detailed.push({ ...card, ...parseLinkedinDetail(page) });
      await pause(1200);
    }
    jobs = parseFeed(source.kind, { jobs: detailed }, source);
  } else if (source.kind === "linkedin-email") {
    // Read-only Gmail search; the first run looks back 30 days, later runs since the last success.
    const days = source.lastSuccessAt
      ? Math.max(
          2,
          Math.ceil((Date.now() - source.lastSuccessAt.valueOf()) / 86400000) +
            1,
        )
      : 30;
    const client = await gmailClient();
    const found = await client.list(
      `from:(jobalerts-noreply@linkedin.com OR jobs-noreply@linkedin.com) newer_than:${Math.min(days, 60)}d`,
    );
    const mails = [];
    for (const { id } of found.slice(0, 300)) {
      const mail = await client.get(id);
      mails.push({ body: mail.bodyText, receivedAt: mail.receivedAt });
    }
    if (found.length > 300) complete = false;
    jobs = parseFeed(source.kind, { mails }, source);
  } else if (source.kind === "arbeitsagentur") {
    const found = new Map<string, any>();
    for (const was of arbeitsagenturQueries)
      for (let page = 1; page <= 3; page++) {
        const params = new URLSearchParams({
          was,
          wo: source.board || "Berlin",
          umkreis: "50",
          angebotsart: "1",
          veroeffentlichtseit: "30",
          page: String(page),
          size: "100",
        });
        const data = await politely(() =>
          request(
            `${arbeitsagenturApi}/pc/v6/jobs?${params}`,
            false,
            arbeitsagenturKey,
          ),
        );
        if (!data) {
          complete = false;
          break;
        }
        const rows = Array.isArray(data.ergebnisliste)
          ? data.ergebnisliste
          : [];
        for (const row of rows)
          if (
            row.referenznummer &&
            engineeringTitle.test(row.stellenangebotsTitel ?? "")
          )
            found.set(row.referenznummer, row);
        if (rows.length < 100) break;
        if (page === 3) complete = false;
        await pause(500);
      }
    // Newest first, so a capped run spends its detail requests on fresh postings.
    const wanted = [...found.values()].sort((a, b) =>
      String(b.datumErsteVeroeffentlichung ?? "").localeCompare(
        String(a.datumErsteVeroeffentlichung ?? ""),
      ),
    );
    if (wanted.length > arbeitsagenturDetails) complete = false;
    const detailed: any[] = [];
    for (let i = 0; i < Math.min(wanted.length, arbeitsagenturDetails); i += 5)
      detailed.push(
        ...(
          await Promise.all(
            wanted
              .slice(i, i + 5)
              .map((row) =>
                politely(() =>
                  request(
                    `${arbeitsagenturApi}/pc/v4/jobdetails/${Buffer.from(row.referenznummer).toString("base64")}`,
                    false,
                    arbeitsagenturKey,
                  ),
                ).catch(() => null),
              ),
          )
        ).filter(Boolean),
      );
    if (detailed.length < Math.min(wanted.length, arbeitsagenturDetails))
      complete = false;
    jobs = parseFeed(source.kind, { jobs: detailed }, source);
  } else if (source.kind === "himalayas") {
    // Several role searches for Germany, one broad search for the US. A bounded discovery scan, never a full inventory.
    const searches = [
      ...himalayasQueries.map((q) => ({ q, country: "DE" })),
      { q: "software engineer", country: "US" },
    ];
    for (const { q, country } of searches)
      for (let page = 1; page <= 3; page++) {
        const data = await politely(() =>
          request(
            `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&country=${country}&sort=recent&page=${page}`,
          ),
        );
        if (!data) break;
        const batch = parseFeed(source.kind, data, source);
        jobs.push(...batch);
        await pause(pageDelayMs / 2);
        if (batch.length < 20) break;
      }
    complete = false;
  } else if (source.kind === "remotive") {
    jobs = parseFeed(
      source.kind,
      await request(
        "https://remotive.com/api/remote-jobs?category=software-dev",
      ),
      source,
    );
  } else if (source.kind === "recruitee") {
    jobs = parseFeed(
      source.kind,
      await request(`https://${board}.recruitee.com/api/offers/`),
      source,
    );
  } else if (source.kind === "workable") {
    jobs = parseFeed(
      source.kind,
      await request(
        `https://apply.workable.com/api/v1/widget/accounts/${board}?details=true`,
      ),
      source,
    );
  } else if (source.kind === "teamtailor") {
    for (let page = 0; page < 5; page++) {
      const batch = parseFeed(
        source.kind,
        await request(
          `https://${board}.teamtailor.com/jobs.rss?offset=${page * 100}`,
          true,
        ),
        source,
      );
      jobs.push(...batch);
      if (batch.length < 100) break;
      if (page === 4) complete = false;
    }
  } else if (source.kind === "smartrecruiters") {
    const wanted: any[] = [];
    for (let page = 0; page < 10; page++) {
      const batch = arr(
        (
          await request(
            `https://api.smartrecruiters.com/v1/companies/${board}/postings?limit=100&offset=${page * 100}`,
          )
        ).content,
      );
      wanted.push(...batch.filter((j) => engineeringTitle.test(j.name ?? "")));
      if (batch.length < 100) break;
      if (page === 9) complete = false;
    }
    if (wanted.length > detailBudget) complete = false;
    const content = await details(wanted, (j) =>
      request(
        `https://api.smartrecruiters.com/v1/companies/${board}/postings/${encodeURIComponent(j.id)}`,
      ),
    );
    jobs = parseFeed(source.kind, { content }, source);
  } else throw new Error("This source does not support automatic fetching");
  return {
    jobs: jobs.filter(
      (j) => j.title && j.company && safeUrl(j.applyUrl) && j.description,
    ),
    complete,
  };
}

export function discoverBoard(
  url: string,
): { kind: string; board: string; region: string } | null {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (/^(jobs|jobs\.eu)\.lever\.co$/.test(u.hostname) && parts[0])
      return {
        kind: "lever",
        board: parts[0],
        region: u.hostname.includes(".eu.") ? "eu" : "global",
      };
    if (u.hostname === "jobs.ashbyhq.com" && parts[0])
      return { kind: "ashby", board: parts[0], region: "global" };
    if (
      [
        "boards.greenhouse.io",
        "job-boards.greenhouse.io",
        "job-boards.eu.greenhouse.io",
      ].includes(u.hostname) &&
      parts[0]
    )
      return {
        kind: "greenhouse",
        board: parts[0],
        region: u.hostname.includes(".eu.") ? "eu" : "global",
      };
    const personio = u.hostname.match(/^([\w-]+)\.jobs\.personio\.(de|com)$/);
    if (personio)
      return { kind: "personio", board: personio[1], region: personio[2] };
    const hosted = u.hostname.match(/^([\w-]+)\.(recruitee|teamtailor)\.com$/);
    if (hosted && !["www", "app"].includes(hosted[1]))
      return { kind: hosted[2], board: hosted[1], region: "global" };
    if (u.hostname === "join.com" && parts[0] === "companies" && parts[1])
      return { kind: "join", board: parts[1], region: "global" };
    if (u.hostname === "apply.workable.com" && parts[0] && parts[0] !== "j")
      return { kind: "workable", board: parts[0], region: "global" };
    if (/^(jobs|careers)\.smartrecruiters\.com$/.test(u.hostname) && parts[0])
      return { kind: "smartrecruiters", board: parts[0], region: "global" };
  } catch {
    /* not a board URL */
  }
  return null;
}
