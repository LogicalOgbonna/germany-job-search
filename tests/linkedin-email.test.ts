import test from "node:test";
import assert from "node:assert/strict";
import {
  isRecruiter,
  parseLinkedinEmail,
  sameRole,
} from "../src/lib/linkedin-email";

const alert = `Your job alert for frontend engineer in Germany
Staff Frontend Engineer / Frontend Architect (m/f/d)
FactFinder
Berlin
View job: https://www.linkedin.com/comm/jobs/view/4479001111/?trackingId=abc&refId=x

---------------------------------------------------------

IT - Entwickler u.a. Github, Typescript (w/m/d)
Randstad Deutschland
Frankfurt

This company is actively hiring
View job: https://www.linkedin.com/comm/jobs/view/4479002222/?trackingId=def

---------------------------------------------------------

Senior Software Engineer, Operations Foundations
Wolt
Berlin

This company is actively hiring
Apply with resume & profile
View job: https://www.linkedin.com/comm/jobs/view/4479003333/

---------------------------------------------------------

See all jobs on LinkedIn: https://www.linkedin.com/comm/jobs/search?keywords=frontend
Manage your job alerts: https://www.linkedin.com/comm/jobs/alerts`;

const recommendation = `Expand your search

Recommendations based on your activity.

Frontend jobs
https://www.linkedin.com/comm/jobs/search-results/?keywords=javascript+developer

Senior Frontend Engineer - Remote
Plentific
Köpenick

High experience match
View job: https://www.linkedin.com/comm/jobs/view/4473937971/?trackingId=DFQ

Full Stack Engineer
voize
Germany
1 school alum
High skills match
View job: https://www.linkedin.com/comm/jobs/view/4480989614/`;

test("LinkedIn alert emails become one job per 'View job' link with search, Easy Apply and Germany scope", () => {
  const jobs = parseLinkedinEmail(alert);
  assert.equal(jobs.length, 3);
  assert.deepEqual(
    jobs.map((j) => [j.id, j.title, j.company, j.location]),
    [
      [
        "4479001111",
        "Staff Frontend Engineer / Frontend Architect (m/f/d)",
        "FactFinder",
        "Berlin",
      ],
      [
        "4479002222",
        "IT - Entwickler u.a. Github, Typescript (w/m/d)",
        "Randstad Deutschland",
        "Frankfurt",
      ],
      [
        "4479003333",
        "Senior Software Engineer, Operations Foundations",
        "Wolt",
        "Berlin",
      ],
    ],
  );
  assert.equal(jobs[0].search, "frontend engineer in Germany");
  assert.equal(jobs[0].germany, true);
  assert.equal(jobs[0].easyApply, false);
  assert.equal(jobs[2].easyApply, true);
});

test("recommendation emails skip headers and search links", () => {
  const [job, second, ...rest] = parseLinkedinEmail(recommendation);
  assert.equal(rest.length, 0);
  assert.deepEqual(
    [second.title, second.company, second.location],
    ["Full Stack Engineer", "voize", "Germany"],
  );
  assert.equal(job.id, "4473937971");
  assert.equal(job.title, "Senior Frontend Engineer - Remote");
  assert.equal(job.company, "Plentific");
  assert.equal(job.location, "Köpenick");
  assert.equal(job.search, null);
});

test("recruiters, staffing agencies and contractor marketplaces are recognised", () => {
  assert.ok(isRecruiter("Randstad Deutschland", ""));
  assert.ok(isRecruiter("Jobgether", ""));
  assert.ok(isRecruiter("Computer Futures", ""));
  assert.ok(isRecruiter("Brunel", ""));
  assert.ok(isRecruiter("Zero to One Search | Recruitment Agency", ""));
  assert.ok(isRecruiter("Acme GmbH", "Im Auftrag unseres Kunden suchen wir"));
  assert.ok(
    isRecruiter(
      "Acme GmbH",
      "We are recruiting on behalf of our client, a scale-up",
    ),
  );
  assert.ok(!isRecruiter("Wolt", "Join our recruiting team"));
  assert.ok(!isRecruiter("FactFinder", ""));
  assert.ok(
    !isRecruiter("Auvaria", "Wir begleiten unsere Kunden als Trusted Advisor"),
  );
  assert.ok(
    !isRecruiter("gicom AG", "Software für unsere Kunden aus dem Handel"),
  );
  assert.ok(isRecruiter("wabcon", "Unser Kunde entwickelt Technologien"));
  assert.ok(!isRecruiter("Haystack", ""));
  assert.ok(
    !isRecruiter(
      "zeb",
      "Die Stelle wird nicht im Rahmen einer Personalvermittlung besetzt.",
    ),
  );
  assert.ok(isRecruiter("Hays AG", ""));
});

test("the same role on LinkedIn and an employer board is recognised despite gender tags and punctuation", () => {
  assert.ok(
    sameRole(
      "Senior Frontend Engineer - Checkout (all genders)",
      "Senior Frontend Engineer – Checkout",
    ),
  );
  assert.ok(
    sameRole(
      "Staff Frontend Engineer / Frontend Architect (m/f/d)",
      "Staff Frontend Engineer / Frontend Architect (m/w/d)",
    ),
  );
  assert.ok(
    !sameRole(
      "Senior Frontend Engineer - Checkout",
      "Senior Frontend Engineer - Marketing",
    ),
  );
  assert.ok(!sameRole("Senior Backend Engineer", "Senior Frontend Engineer"));
});
