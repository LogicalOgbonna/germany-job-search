// Dumps the Jobdesk database to .data/backups/ (outside git) and keeps the newest 30.
// Runs before every migration (always) and when Jobdesk starts (with --if-older=3600: only
// when the newest backup is older than that many seconds). Restore with:
//   docker compose exec -T postgres pg_restore -U jobdesk -d jobdesk --clean --if-exists < .data/backups/<file>
import { spawnSync } from "node:child_process";
import {
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), ".data", "backups");
const keep = 30;
const isDump = (name) => /^jobdesk-.*\.dump$/.test(name);
mkdirSync(dir, { recursive: true, mode: 0o700 });
const ifOlder = process.argv
  .map((arg) => /^--if-older=(\d+)$/.exec(arg)?.[1])
  .find(Boolean);
if (ifOlder) {
  const newest = Math.max(
    0,
    ...readdirSync(dir)
      .filter(isDump)
      .map((name) => statSync(join(dir, name)).mtimeMs),
  );
  const age = (Date.now() - newest) / 1000;
  if (age < Number(ifOlder)) {
    console.log(
      `Database backup skipped: the newest is ${Math.round(age / 60)} minutes old.`,
    );
    process.exit(0);
  }
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = join(dir, `jobdesk-${stamp}.dump`);
const out = openSync(file, "wx", 0o600);
const dump = spawnSync(
  "docker",
  [
    "compose",
    "exec",
    "-T",
    "postgres",
    "pg_dump",
    "-U",
    "jobdesk",
    "-Fc",
    "jobdesk",
  ],
  { stdio: ["ignore", out, "inherit"] },
);
closeSync(out);
if (dump.status !== 0 || statSync(file).size === 0) {
  rmSync(file, { force: true });
  console.error("Database backup failed; nothing was changed.");
  process.exit(1);
}
const dumps = readdirSync(dir).filter(isDump).sort();
for (const old of dumps.slice(0, Math.max(0, dumps.length - keep)))
  rmSync(join(dir, old));
console.log(`Database backed up to ${file}`);
