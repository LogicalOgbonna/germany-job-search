// Mail domains of hiring systems and job platforms. A sender matches on the domain itself
// or any subdomain of it.
const systemDomains = [
  "ashbyhq.com",
  "greenhouse.io",
  "greenhouse-mail.io",
  "lever.co",
  "personio.de",
  "personio.com",
  "recruitee.com",
  "recruiteemail.com",
  "teamtailor.com",
  "teamtailor-mail.com",
  "smartrecruiters.com",
  "workablemail.com",
  "workable.com",
  "join.com",
  "myworkday.com",
  "myworkdayjobs.com",
  "workday.com",
  "successfactors.eu",
  "successfactors.com",
  "sapsf.eu",
  "sapsf.com",
  "bamboohr.com",
  "softgarden.io",
  "softgarden.de",
  "wellfound.com",
  "instaffo.com",
  "hibob.com",
  "gem.com",
  "pinpoint.email",
  "pinpointhq.com",
  "ats.rippling.com",
  "comeet-notifications.com",
  "applytojob.com",
  "jobvite.com",
  "icims.com",
  "freshteam.com",
  "recruiterbox.com",
  "trakstar.com",
  "homerun.co",
  "manatal.com",
  "broadbean.net",
  "catch-talents.de",
  "private-hrworks.de",
  "screenloop.com",
  "breezy.hr",
  "taleo.net",
  "njoyn.com",
];
// LinkedIn sends far more than job mail; only these mailboxes are about applications.
const linkedInJobs = /^(jobs-noreply|inmail-hit-reply|hit-reply)$/;
// Systems that put the employer in a subdomain: <employer>.<base>.
const tenantBases = [
  "teamtailor-mail.com",
  "recruitee.com",
  "msg.join.com",
  "comeet-notifications.com",
  "hire.trakstar.com",
  "freshteam.com",
  "recruiterbox.com",
];
const notEmployer =
  /^(|app|www|mail|email|msg|message|messages|hire|jobs|careers|eu|us|no-?reply|do-?not-?reply|notifications?|workday|system|info|support)$/;

function split(fromAddress: string): [string, string] {
  const address = fromAddress.trim().toLowerCase();
  const at = address.lastIndexOf("@");
  return at > 0 && !/\s/.test(address)
    ? [address.slice(0, at), address.slice(at + 1)]
    : ["", ""];
}
const under = (domain: string, ...bases: string[]) =>
  bases.some((base) => domain === base || domain.endsWith(`.${base}`));

// True for addresses of hiring systems and job platforms (Ashby, Greenhouse, Lever, Personio,
// Recruitee, Teamtailor, SmartRecruiters, Workable, JOIN, Workday, SuccessFactors, BambooHR,
// softgarden, LinkedIn jobs, Wellfound, Instaffo and similar).
export function isHiringSystem(fromAddress: string): boolean {
  const [local, domain] = split(fromAddress);
  if (!domain) return false;
  if (under(domain, "linkedin.com")) return linkedInJobs.test(local);
  return under(domain, ...systemDomains);
}

// Employer encoded in a hiring-system address, e.g. "xolife" from xolife-jobs@m.personio.de,
// "aignostics" from no-reply@aignostics.teamtailor-mail.com, "epilot" from x@epilot.recruitee.com,
// "zalando" from zalando@myworkday.com. Null when the address carries no employer.
export function employerFromAddress(fromAddress: string): string | null {
  const [local, domain] = split(fromAddress);
  if (!domain) return null;
  if (under(domain, "personio.de", "personio.com"))
    return local.match(/^(.+?)(?:-\d+)?-jobs$/)?.[1] ?? null;
  if (under(domain, "myworkday.com", "workday.com"))
    return notEmployer.test(local) ? null : local;
  if (
    under(
      domain,
      "successfactors.eu",
      "successfactors.com",
      "sapsf.eu",
      "sapsf.com",
    )
  )
    return local.match(/^correspondence(.+)$/)?.[1] ?? null;
  for (const base of tenantBases) {
    if (!domain.endsWith(`.${base}`)) continue;
    const tenant =
      domain
        .slice(0, -base.length - 1)
        .split(".")
        .pop() ?? "";
    return notEmployer.test(tenant) ? null : tenant;
  }
  return null;
}
