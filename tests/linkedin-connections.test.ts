import test from "node:test";
import assert from "node:assert/strict";
import {
  companyKey,
  connectionWrites,
  keysMatch,
  rank,
  toConnection,
} from "../src/lib/linkedin/connections";

test("company keys reuse the mail matcher's normalisation", () => {
  assert.equal(companyKey("Personio SE & Co. KG"), companyKey("Personio"));
  assert.equal(companyKey("Peec AI"), "peecai");
});

test("keys match when equal or when one opens the other on a word boundary", () => {
  assert.equal(keysMatch("Grafana", "Grafana Labs"), true);
  assert.equal(
    keysMatch("Eye", "Eye Security"),
    false,
    "short names need equality",
  );
  assert.equal(keysMatch("Develop", "Senior Developer"), false);
});

test("legal suffixes never decide a match", () => {
  assert.equal(keysMatch("Personio SE & Co. KG", "Personio"), true);
  assert.equal(keysMatch("Personio", "Personio SE & Co. KG"), true);
  assert.equal(keysMatch("Emidat GmbH", "Emidat AG"), true);
  assert.equal(keysMatch("Emidat GmbH", "Emidat Labs"), true);
  assert.equal(keysMatch("Personio", "Personal Capital"), false);
  assert.equal(keysMatch("", "Personio"), false);
});

test("a connection row maps to a record", () => {
  const record = toConnection({
    "First Name": "Grace",
    "Last Name": "Hopper",
    URL: "https://www.linkedin.com/in/gracehopper",
    "Email Address": "",
    Company: "Personio",
    Position: "Senior Software Engineer",
    "Connected On": "19 Oct 2026",
  })!;
  assert.equal(record.name, "Grace Hopper");
  assert.equal(record.profileUrl, "https://www.linkedin.com/in/gracehopper");
  assert.equal(record.companyKey, companyKey("Personio"));
  assert.equal(record.connectedOn?.toISOString().slice(0, 10), "2026-10-19");
  assert.equal(toConnection({ "First Name": "x" }), null, "no profile URL");
});

test("profile URLs are stored lower-cased, as LinkedIn messages carry them", () => {
  const record = toConnection({
    "First Name": "Grace",
    "Last Name": "Hopper",
    URL: "https://www.linkedin.com/in/GraceHopper-1A2B/",
  })!;
  assert.equal(
    record.profileUrl,
    "https://www.linkedin.com/in/gracehopper-1a2b",
  );
});

test("engineers come first, then managers and founders, then recruiters", () => {
  const order = rank([
    { position: "Talent Acquisition Partner" },
    { position: "Head of Marketing" },
    { position: "Co-Founder" },
    { position: "Senior Software Engineer" },
  ] as any).map((c: any) => c.position);
  assert.deepEqual(order, [
    "Senior Software Engineer",
    "Co-Founder",
    "Talent Acquisition Partner",
    "Head of Marketing",
  ]);
});

test("only a complete snapshot removes connections that are missing from it", () => {
  const person = (n: number, company = "Personio") =>
    toConnection({
      "First Name": "Person",
      "Last Name": String(n),
      URL: `https://www.linkedin.com/in/person-${n}`,
      Company: company,
    })!;
  const stored = [person(1), person(2), person(3)];
  const rows = [person(2, "Grafana Labs"), person(3), person(4)];
  const complete = connectionWrites(stored, rows, true);
  assert.deepEqual(
    complete.create.map((r) => r.profileUrl),
    [person(4).profileUrl],
  );
  assert.deepEqual(
    complete.update.map((r) => r.profileUrl),
    [person(2).profileUrl],
  );
  assert.deepEqual(complete.remove, [person(1).profileUrl]);
  const partial = connectionWrites(stored, rows, false);
  assert.deepEqual(partial.remove, []);
  assert.deepEqual(partial.create, complete.create);
  assert.deepEqual(partial.update, complete.update);
});
