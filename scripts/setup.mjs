import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parse } from "dotenv";
const base = Number(process.env.CONDUCTOR_PORT ?? 55010);
const suffix = createHash("sha256")
  .update(process.cwd())
  .digest("hex")
  .slice(0, 8);
if (!existsSync(".env"))
  writeFileSync(
    ".env",
    `DATABASE_URL=postgresql://jobdesk:local-jobdesk@127.0.0.1:${base + 1}/jobdesk\nREDIS_URL=redis://127.0.0.1:${base + 2}\nJOBDESK_DB_PORT=${base + 1}\nJOBDESK_REDIS_PORT=${base + 2}\nCOMPOSE_PROJECT_NAME=jobdesk-${suffix}\n`,
    { mode: 0o600 },
  );
// Conductor can copy .env from another workspace. Rebind only our generated
// localhost defaults; preserve custom database connections and other secrets.
const content = readFileSync(".env", "utf8");
const values = parse(content);
if (
  process.env.CONDUCTOR_PORT &&
  /^postgresql:\/\/jobdesk:local-jobdesk@127\.0\.0\.1:\d+\/jobdesk$/.test(
    values.DATABASE_URL ?? "",
  )
) {
  const local = {
    DATABASE_URL: `postgresql://jobdesk:local-jobdesk@127.0.0.1:${base + 1}/jobdesk`,
    REDIS_URL: `redis://127.0.0.1:${base + 2}`,
    JOBDESK_DB_PORT: String(base + 1),
    JOBDESK_REDIS_PORT: String(base + 2),
    COMPOSE_PROJECT_NAME: `jobdesk-${suffix}`,
  };
  let updated = content;
  for (const [key, value] of Object.entries(local)) {
    if (
      key === "REDIS_URL" &&
      values.REDIS_URL &&
      !/^redis:\/\/127\.0\.0\.1:\d+$/.test(values.REDIS_URL)
    )
      continue;
    const line = new RegExp(`^${key}=.*$`, "m");
    updated = line.test(updated)
      ? updated.replace(line, `${key}=${value}`)
      : `${updated.trimEnd()}\n${key}=${value}\n`;
  }
  if (updated !== content) writeFileSync(".env", updated, { mode: 0o600 });
}
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
run("docker", ["compose", "up", "-d", "--wait"]);
run("npx", ["prisma", "generate"]);
run("npx", ["prisma", "migrate", "deploy"]);
run("npm", ["run", "import"]);
console.log(`Ready. Run npm run dev, then open http://localhost:${base}`);
