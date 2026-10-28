import * as cheerio from "cheerio";
import {
  contactPriority,
  genericInbox,
  linkedinUrl,
  publicUrl,
  workEmail,
  type FoundContact,
} from "./domain";
import { publicPage, robotsAllows } from "./public-web";
export function extractContacts(
  html: string,
  sourceUrl: string,
  domain: string,
  sourceKind = "Company website",
): FoundContact[] {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg").remove();
  const found: FoundContact[] = [];
  const text = $.text();
  const emails = new Set(
    `${text} ${$("a[href^='mailto:']")
      .map((_, el) => $(el).attr("href"))
      .get()
      .join(" ")}`.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [],
  );
  for (const raw of emails) {
    const email = workEmail(raw, domain);
    if (!email) continue;
    // Exclude irrelevant operational inboxes; hiring inboxes remain clearly labeled.
    if (
      genericInbox(email) &&
      !/^(careers?|jobs?|hiring|recruit(ment|ing)?|talent|hr)@/i.test(email)
    )
      continue;
    found.push({
      name: genericInbox(email) ? "Hiring inbox" : "Name unconfirmed",
      title: genericInbox(email) ? "Recruiting inbox" : "",
      email,
      linkedin: "",
      sourceUrl,
      sourceKind,
      sourceNote:
        "Email published on the source page. Confirm its owner and relevance before outreach.",
      emailStatus: "Published work email; deliverability not checked",
    });
  }
  $("a[href]").each((_, el) => {
    const linkedin = linkedinUrl($(el).attr("href") ?? "");
    if (!linkedin) return;
    // Keep source context without inventing a person's name from a URL slug.
    const anchor = $(el).text().replace(/\s+/g, " ").trim();
    const context = $(el)
      .parent()
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1000);
    let name =
      anchor &&
      anchor.length < 100 &&
      !/linkedin|profile|follow|connect|view|visit/i.test(anchor)
        ? anchor
        : "LinkedIn profile (name unconfirmed)";
    let title = "";
    const card = $(el).parent();
    const leaves = card
      .find("h2,h3,h4,p,div,span")
      .filter((_, node) => $(node).children().length === 0)
      .map((_, node) => $(node).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean);
    // Only read a compact, single-person card. Never infer names from URL slugs.
    if (
      card.find('a[href*="linkedin.com/in/"]').length === 1 &&
      leaves.length === 2 &&
      /^[\p{L}][\p{L} .'-]{2,99}$/u.test(leaves[0]) &&
      /engineer|developer|manager|recruit|talent|founder|chief|head|ceo|cto|director/i.test(
        leaves[1],
      )
    ) {
      name = leaves[0];
      title = leaves[1];
    }
    found.push({
      name,
      title,
      email: "",
      linkedin,
      sourceUrl,
      sourceKind,
      sourceNote:
        context ||
        "Profile linked from this company page. Check name, title and current employer.",
      emailStatus: "No email found",
    });
  });
  return found.slice(0, 50);
}
export async function discoverPublic(
  job: { description: string; applyUrl: string },
  domain: string,
) {
  const contacts = extractContacts(
    job.description,
    job.applyUrl,
    domain,
    "Job posting",
  );
  const reports = [`Job posting: ${contacts.length} public contact(s).`];
  let origin = `https://${domain}`;
  try {
    const robots = await publicPage(`${origin}/robots.txt`);
    if (![200, 404].includes(robots.status))
      throw new Error(
        `robots.txt returned HTTP ${robots.status}; company pages skipped. Try the canonical website domain if it redirects.`,
      );
    origin = new URL(robots.url).origin;
    if (!robotsAllows(robots.text, "/"))
      throw new Error("The website's robots rules disallow this crawl.");
    const home = await publicPage(origin);
    if (home.status !== 200)
      throw new Error(
        `Company homepage returned HTTP ${home.status}; use its final domain if it redirects.`,
      );
    contacts.push(...extractContacts(home.text, origin, domain));
    const $ = cheerio.load(home.text);
    const paths = new Set<string>();
    $("a[href]").each((_, el) => {
      try {
        const u = new URL($(el).attr("href")!, origin);
        if (
          u.origin === origin &&
          /(?:team|about|people|career|contact)/i.test(u.pathname) &&
          !/\/(?:solutions|products|blog|press)\//i.test(u.pathname) &&
          !u.search &&
          robotsAllows(robots.text, u.pathname)
        )
          paths.add(u.pathname);
      } catch {
        /* Invalid public link. */
      }
    });
    reports.push("Company homepage checked.");
    const pagePriority = (path: string) =>
      /team|about|people/i.test(path) ? 3 : /career/i.test(path) ? 2 : 1;
    for (const path of [...paths]
      .sort((a, b) => pagePriority(b) - pagePriority(a))
      .slice(0, 3)) {
      try {
        const page = await publicPage(origin + path);
        if (page.status !== 200) {
          reports.push(`${path}: HTTP ${page.status}, skipped.`);
          continue;
        }
        const matches = extractContacts(page.text, origin + path, domain);
        contacts.push(...matches);
        reports.push(`${path}: ${matches.length} public contact(s).`);
      } catch {
        reports.push(`${path}: unavailable, skipped.`);
      }
    }
  } catch (e) {
    reports.push(
      e instanceof Error ? e.message : "Company website unavailable.",
    );
  }
  return {
    contacts: contacts
      .sort(
        (a, b) =>
          contactPriority(b.title + " " + b.sourceNote) -
          contactPriority(a.title + " " + a.sourceNote),
      )
      .slice(0, 60),
    report:
      reports.join("\n") +
      "\nLinkedIn profiles are linked, not scraped. This is a limited public-page scan, not a complete employee directory.",
  };
}
