import test from "node:test";
import assert from "node:assert/strict";
import { discoverBoard, parseFeed, plain } from "../src/lib/connectors";
const source = { name: "Acme", board: "acme", region: "global" };
test("Greenhouse listing timestamps do not mistake updated_at for publication", () => {
  const [job] = parseFeed(
    "greenhouse",
    {
      jobs: [
        {
          id: 1,
          title: "Frontend Engineer",
          content: "<p>React</p><script>bad()</script>",
          location: { name: "Berlin" },
          absolute_url: "https://example.com/job",
          updated_at: "2026-10-05",
        },
      ],
    },
    source,
  );
  assert.equal(job.publishedAt, undefined);
  assert.equal(job.description, "React");
});
test("Ashby excludes unlisted jobs and preserves remote flag", () => {
  const jobs = parseFeed(
    "ashby",
    {
      jobs: [
        { title: "Engineer", isListed: false },
        {
          title: "Engineer",
          jobUrl: "https://example.com/a",
          isRemote: true,
          location: "Berlin",
          descriptionPlain: "React",
          applyUrl: "https://example.com/a/apply",
        },
      ],
    },
    source,
  );
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].remote, true);
});
test("Lever retains requirements and distinguishes country from remote work model", () => {
  const [job] = parseFeed(
    "lever",
    [
      {
        id: "1",
        text: "Engineer",
        categories: { location: "New York" },
        country: "us",
        workplaceType: "remote",
        descriptionPlain: "Build software",
        lists: [
          { text: "Requirements", content: "<ul><li>US residency</li></ul>" },
        ],
        applyUrl: "https://example.com",
      },
    ],
    source,
  );
  assert.deepEqual(job.countries, ["US"]);
  assert.ok(job.description.includes("US residency"));
});
test("provider schema failures are not treated as empty successful feeds", () => {
  assert.throws(
    () => parseFeed("arbeitnow", { results: [] }, source),
    /shape changed/,
  );
  assert.throws(
    () => parseFeed("personio", "<html>Sign in</html>", source),
    /unavailable/,
  );
});
test("Personio parses XML and uses the correct regional job link", () => {
  const [job] = parseFeed(
    "personio",
    "<workzag-jobs><position><id>123</id><name>Developer</name><office>Berlin</office><jobDescriptions><jobDescription><name>About</name><value>&lt;p&gt;TypeScript&lt;/p&gt;</value></jobDescription></jobDescriptions></position></workzag-jobs>",
    { ...source, region: "com" },
  );
  assert.equal(job.applyUrl, "https://acme.jobs.personio.com/job/123");
  assert.ok(job.description.includes("TypeScript"));
});
test("board discovery only accepts supported hosts and records EU region", () => {
  assert.deepEqual(
    discoverBoard("https://job-boards.eu.greenhouse.io/acme/jobs/123"),
    { kind: "greenhouse", board: "acme", region: "eu" },
  );
  assert.equal(
    discoverBoard("https://jobs.ashbyhq.com.attacker.example/acme"),
    null,
  );
  assert.equal(
    plain("<style>bad</style><p>Good</p><iframe>bad</iframe>"),
    "Good",
  );
});
test("Recruitee keeps published offers and joins description with requirements", () => {
  const jobs = parseFeed(
    "recruitee",
    {
      offers: [
        { id: 1, title: "Engineer", status: "draft" },
        {
          id: 2,
          title: "Frontend Engineer",
          status: "published",
          location: "Köln, Nordrhein-Westfalen, Germany",
          locations: [{ country_code: "DE" }, { country_code: "de" }],
          description: "<p>React</p>",
          requirements: "<p>TypeScript</p>",
          careers_url: "https://acme.recruitee.com/o/frontend-engineer",
          remote: true,
          published_at: "2026-10-02 12:27:38 UTC",
        },
      ],
    },
    source,
  );
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].countries, ["DE"]);
  assert.equal(jobs[0].remote, true);
  assert.match(jobs[0].description, /React\s+TypeScript/);
  assert.equal(jobs[0].publishedAt?.toISOString(), "2026-10-02T12:27:38.000Z");
});
test("Workable separates the posting link from the application form", () => {
  const [job] = parseFeed(
    "workable",
    {
      jobs: [
        {
          shortcode: "ABC123",
          title: "Full Stack Engineer",
          city: "Hamburg",
          country: "Germany",
          telecommuting: false,
          locations: [{ countryCode: "DE" }],
          description: "<p>Node.js</p>",
          url: "https://apply.workable.com/j/ABC123",
          application_url: "https://apply.workable.com/j/ABC123/apply",
        },
      ],
    },
    source,
  );
  assert.equal(job.location, "Hamburg, Germany");
  assert.equal(job.applyUrl, "https://apply.workable.com/j/ABC123/apply");
  assert.equal(job.sourceUrl, "https://apply.workable.com/j/ABC123");
  assert.equal(job.remote, false);
});
test("SmartRecruiters builds the description from job-ad sections", () => {
  const [job] = parseFeed(
    "smartrecruiters",
    {
      content: [
        {
          id: "744",
          name: "Senior Frontend Developer",
          location: { fullLocation: "Berlin, Germany", country: "de" },
          releasedDate: "2026-10-01T08:00:00.000Z",
          applyUrl: "https://jobs.smartrecruiters.com/Acme/744-frontend",
          jobAd: {
            sections: {
              jobDescription: {
                title: "Job Description",
                text: "<p>React</p>",
              },
              qualifications: { title: "Qualifications", text: "" },
            },
          },
        },
      ],
    },
    source,
  );
  assert.deepEqual(job.countries, ["DE"]);
  assert.equal(job.remote, false);
  assert.ok(job.description.startsWith("Job Description\nReact"));
});
test("Teamtailor reads namespaced locations and rejects non-feed pages", () => {
  const [job] = parseFeed(
    "teamtailor",
    '<?xml version="1.0"?><rss version="2.0" xmlns:tt="https://teamtailor.com/locations"><channel><title>Acme</title><item><title>Backend Engineer</title><description>&lt;p&gt;TypeScript&lt;/p&gt;</description><pubDate>Wed, 06 May 2026 09:58:19 +0200</pubDate><link>https://acme.teamtailor.com/jobs/1-backend-engineer</link><remoteStatus>fully</remoteStatus><guid>abc</guid><tt:locations><tt:location><tt:name>HQ</tt:name><tt:city>Berlin</tt:city><tt:country>Germany</tt:country></tt:location></tt:locations></item></channel></rss>',
    source,
  );
  assert.equal(job.externalId, "abc");
  assert.equal(job.title, "Backend Engineer");
  assert.equal(job.location, "Berlin, Germany · Remote");
  assert.equal(job.description, "TypeScript");
  assert.equal(
    job.applyUrl,
    "https://acme.teamtailor.com/jobs/1-backend-engineer",
  );
  assert.throws(
    () => parseFeed("teamtailor", "<html>Not found</html>", source),
    /unavailable/,
  );
});
test("board discovery covers hosted career sites without trusting lookalikes", () => {
  assert.deepEqual(discoverBoard("https://acme.recruitee.com/o/engineer"), {
    kind: "recruitee",
    board: "acme",
    region: "global",
  });
  assert.deepEqual(discoverBoard("https://acme.teamtailor.com/jobs/1"), {
    kind: "teamtailor",
    board: "acme",
    region: "global",
  });
  assert.deepEqual(discoverBoard("https://apply.workable.com/acme/j/ABC123"), {
    kind: "workable",
    board: "acme",
    region: "global",
  });
  assert.deepEqual(
    discoverBoard("https://jobs.smartrecruiters.com/Acme/744-frontend"),
    { kind: "smartrecruiters", board: "Acme", region: "global" },
  );
  assert.equal(discoverBoard("https://apply.workable.com/j/ABC123"), null);
  assert.equal(discoverBoard("https://www.teamtailor.com/en/"), null);
  assert.equal(
    discoverBoard("https://acme.recruitee.com.evil.example/o/x"),
    null,
  );
});
test("Personio falls back to the job list and page when the XML feed is off", () => {
  const [job] = parseFeed(
    "personio",
    {
      positions: [
        {
          id: 1572417,
          name: "Frontend Developer (remote Germany)",
          office: "Saarbrücken,Remote",
          offices: ["Saarbrücken", "Remote"],
          page: '<html><body><nav>Menu</nav><main id="main-content"><a href="/">Back to all jobs</a><h1>Frontend Developer</h1><h2>Your profile</h2><p>TypeScript and React</p><button>Apply for this job</button></main><script>self.__next_f.push([1])</script></body></html>',
        },
      ],
    },
    { ...source, region: "de" },
  );
  assert.equal(job.location, "Saarbrücken, Remote");
  assert.deepEqual(job.countries, ["DE"]);
  assert.equal(job.applyUrl, "https://acme.jobs.personio.de/job/1572417");
  assert.equal(job.description, "Your profile\nTypeScript and React");
});
test("JOIN maps job-page data and converts salary from cents", () => {
  const [job] = parseFeed(
    "join",
    {
      jobs: [
        {
          id: 16786915,
          idParam: "16786915-frontend-engineer",
          title: "Frontend Engineer",
          descriptionHtml: "<p>React</p>",
          city: { cityName: "Cologne", countryName: "Germany" },
          country: { iso3166: "DE" },
          workplaceType: "HYBRID",
          createdAt: "2026-09-08T18:14:54.965Z",
          salaryAmountFrom: { amount: 7000000, currency: "EUR" },
          salaryAmountTo: { amount: 9000000, currency: "EUR" },
          salaryFrequency: "PER_YEAR",
        },
      ],
    },
    source,
  );
  assert.equal(job.location, "Cologne, Germany");
  assert.deepEqual(job.countries, ["DE"]);
  assert.equal(job.remote, false);
  assert.equal(job.salary, "EUR 70000–90000 / year");
  assert.equal(
    job.applyUrl,
    "https://join.com/companies/acme/16786915-frontend-engineer",
  );
  assert.deepEqual(discoverBoard("https://join.com/companies/acme/123-x"), {
    kind: "join",
    board: "acme",
    region: "global",
  });
  assert.equal(discoverBoard("https://join.com/talent/acme"), null);
});
test("Bundesagentur postings keep the employer link and leave agency ads out", () => {
  const posting = (extra: Record<string, unknown>) => ({
    referenznummer: "13644-305516-S",
    stellenangebotsTitel: "Frontend React Developer (m/w/d)",
    firma: "Smartbroker   ",
    stellenangebotsBeschreibung: "React, TypeScript, Next.js",
    stellenlokationen: [{ adresse: { plz: "10178", ort: "Berlin" } }],
    homeofficemoeglich: true,
    externeURL: "https://www.get-in-it.de/jobsuche/p305516",
    datumErsteVeroeffentlichung: "2026-09-03",
    ...extra,
  });
  const jobs = parseFeed(
    "arbeitsagentur",
    {
      jobs: [
        posting({}),
        posting({ referenznummer: "agency", istPrivateArbeitsvermittlung: true }),
        posting({ referenznummer: "temp", istArbeitnehmerUeberlassung: true }),
        posting({ referenznummer: "10000-1-S", externeURL: undefined }),
      ],
    },
    { ...source, board: "Berlin" },
  );
  assert.deepEqual(jobs.map((j) => j.externalId), ["13644-305516-S", "10000-1-S"]);
  assert.equal(jobs[0].company, "Smartbroker");
  assert.equal(jobs[0].location, "10178 Berlin · home office possible");
  assert.deepEqual(jobs[0].countries, ["DE"]);
  assert.equal(jobs[0].applyUrl, "https://www.get-in-it.de/jobsuche/p305516");
  assert.equal(
    jobs[1].applyUrl,
    "https://www.arbeitsagentur.de/jobsuche/jobdetail/10000-1-S",
    "without an employer link the Jobbörse page is the way to apply",
  );
  assert.throws(() => parseFeed("arbeitsagentur", {}, source), /shape changed/);
});
test("LinkedIn guest cards and details become jobs that link to the posting", async () => {
  const { parseLinkedinCards, parseLinkedinDetail } = await import("../src/lib/connectors");
  const cards = parseLinkedinCards(
    '<li><div data-entity-urn="urn:li:jobPosting:4480985705"><h3 class="base-search-card__title"> Senior Full Stack Engineer </h3><h4 class="base-search-card__subtitle"><a>VARM</a></h4><span class="job-search-card__location">Berlin, Berlin, Germany</span><time datetime="2026-10-20"></time></div></li><li><div>no urn</div></li>',
  );
  assert.deepEqual(cards.map((c) => [c.id, c.title, c.company]), [["4480985705", "Senior Full Stack Engineer", "VARM"]]);
  const detail = parseLinkedinDetail(
    '<div class="show-more-less-html__markup"><p>React and Node.js</p></div><ul><li class="description__job-criteria-item"><h3 class="description__job-criteria-subheader">Employment type</h3><span class="description__job-criteria-text">Full-time</span></li></ul>',
  );
  assert.equal(detail.employmentType, "Full-time");
  const [job] = parseFeed("linkedin", { jobs: [{ ...cards[0], ...detail }] }, { ...source, board: "berlin" });
  assert.equal(job.applyUrl, "https://www.linkedin.com/jobs/view/4480985705/");
  assert.deepEqual(job.countries, ["DE"]);
  assert.match(job.description, /^Employment type: Full-time/);
  assert.match(job.description, /React and Node\.js/);
});
