import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Runs the backup script in a temporary folder with a fake `docker` first on PATH, so no
// real database is dumped: the fake prints a few bytes as the dump.
const script = join(process.cwd(), "scripts", "db-backup.mjs");
function sandbox() {
  const root = mkdtempSync(join(tmpdir(), "jobdesk-backup-"));
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, "docker"), "#!/bin/sh\nprintf dump\n");
  chmodSync(join(bin, "docker"), 0o755);
  const backups = join(root, ".data", "backups");
  mkdirSync(backups, { recursive: true });
  const run = (...args: string[]) =>
    spawnSync(process.execPath, [script, ...args], {
      cwd: root,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      encoding: "utf8",
    });
  const dumps = () => readdirSync(backups).filter((f) => f.endsWith(".dump"));
  const existing = (name: string, ageSeconds: number) => {
    const file = join(backups, name);
    writeFileSync(file, "old");
    const at = new Date(Date.now() - ageSeconds * 1000);
    utimesSync(file, at, at);
  };
  return { root, run, dumps, existing };
}

test("--if-older skips the backup while the newest one is younger than that", () => {
  const box = sandbox();
  try {
    box.existing("jobdesk-2026-10-28T10-00-00-000Z.dump", 600);
    const result = box.run("--if-older=3600");
    assert.equal(result.status, 0);
    assert.match(result.stdout, /skipped/i);
    assert.equal(box.dumps().length, 1);
  } finally {
    rmSync(box.root, { recursive: true, force: true });
  }
});

test("--if-older backs up once the newest backup is older than that", () => {
  const box = sandbox();
  try {
    box.existing("jobdesk-2026-10-28T08-00-00-000Z.dump", 7200);
    const result = box.run("--if-older=3600");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(box.dumps().length, 2);
  } finally {
    rmSync(box.root, { recursive: true, force: true });
  }
});

test("without the flag every call backs up, as db:migrate needs", () => {
  const box = sandbox();
  try {
    box.existing("jobdesk-2026-10-28T10-00-00-000Z.dump", 10);
    const result = box.run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(box.dumps().length, 2);
  } finally {
    rmSync(box.root, { recursive: true, force: true });
  }
});
