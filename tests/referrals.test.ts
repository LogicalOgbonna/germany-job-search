import test from "node:test";
import assert from "node:assert/strict";
import {
  companyDomain,
  contactPriority,
  linkedinUrl,
  workEmail,
} from "../src/lib/referrals/domain";
import { makeDrafts } from "../src/lib/referrals/templates";
import { extractContacts } from "../src/lib/referrals/discovery";
import {
  isPublicIPv4,
  publicPage,
  robotsAllows,
} from "../src/lib/referrals/public-web";
import { readProfile } from "../src/lib/profile";
test("public extraction keeps professional addresses and provenance without guessing identities", () => {
  const html =
    '<p>Write to engineer@acme.com, careers@acme.com, support@acme.com, private@gmail.com, outside@elsewhere.com.</p><div>Sam, Engineering Manager <a href="https://de.linkedin.com/in/sam/?trk=x">LinkedIn</a></div><a href="javascript:alert(1)">Bad</a>';
  const found = extractContacts(html, "https://acme.com/team", "acme.com");
  assert.deepEqual(
    found.filter((c) => c.email).map((c) => c.email),
    ["engineer@acme.com", "careers@acme.com"],
  );
  assert.equal(found[0].name, "Name unconfirmed");
  assert.equal(found[1].name, "Hiring inbox");
  assert.equal(found[2].linkedin, "https://www.linkedin.com/in/sam");
  assert.match(found[2].sourceNote, /Engineering Manager/);
  assert.ok(found.every((c) => c.sourceUrl === "https://acme.com/team"));
  assert.equal(workEmail("PRIVATE@gmail.com", "gmail.com"), "");
  assert.equal(workEmail("sam@acme.com", "www.acme.com"), "sam@acme.com");
  assert.equal(linkedinUrl("https://linkedin.com.evil.com/in/sam"), "");
  assert.throws(() => companyDomain("https://user:secret@acme.com"));
  assert.throws(() => companyDomain("localhost"));
  assert.ok(
    contactPriority("Engineering Manager") > contactPriority("Recruiter"),
  );
  assert.ok(
    contactPriority("Software Engineer") > contactPriority("Recruiter"),
  );
});
test("outreach is role-specific, evidence-backed and distinguishes hiring inboxes", async () => {
  const p = await readProfile();
  const job = {
    title: "Payments Engineer",
    company: "Acme",
    description: "Stripe payments CI/CD pipelines",
    applyUrl: "https://acme.com/jobs/1",
  };
  const d = makeDrafts(job, { name: "Sam Smith", email: "sam@acme.com" }, p);
  assert.match(d.referral, /Hi Sam,/);
  assert.match(d.referral, /Payments Engineer role at Acme/);
  assert.match(d.referral, /Wunderflats/);
  assert.match(d.referral, /considering a referral/);
  assert.ok(d.referral.includes(job.applyUrl));
  assert.ok(
    p.roles.some((r) => r.bullets.some((b) => d.referral.includes(b.text))),
  );
  assert.ok(d.connection.length <= 200);
  assert.doesNotMatch(
    makeDrafts(job, { name: "Hiring inbox", email: "jobs@acme.com" }, p)
      .referral,
    /considering a referral/,
  );
  assert.match(
    makeDrafts(job, { name: "Hiring inbox", email: "jobs@acme.com" }, p)
      .referral,
    /point me to the recruiter/,
  );
});
test("public fetch rejects local networks and respects applicable robots directives", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "100.100.100.200",
    "192.168.1.1",
    "172.16.0.1",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
    "224.0.0.1",
  ])
    assert.equal(isPublicIPv4(ip), false, ip);
  assert.equal(isPublicIPv4("93.184.216.34"), true);
  await assert.rejects(publicPage("https://localhost/"), /public address/);
  await assert.rejects(publicPage("http://example.com/"), /HTTPS/);
  assert.equal(
    robotsAllows(
      "User-agent: *\nDisallow: /private\nAllow: /private/team",
      "/private/team",
    ),
    true,
  );
  assert.equal(
    robotsAllows("User-agent: *\nDisallow: /private*", "/private/staff"),
    false,
  );
  assert.equal(
    robotsAllows(
      "User-agent: OtherBot\nDisallow: /\nUser-agent: *\nDisallow: /private",
      "/team",
    ),
    true,
  );
  assert.equal(
    robotsAllows(
      "User-agent: Jobdesk\nDisallow: /\nUser-agent: *\nAllow: /",
      "/team",
    ),
    false,
  );
});
