import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "./db";
import { discoverBoard } from "./connectors";
import { safeUrl } from "./domain";
import { seedSources, upsertJob } from "./store";

export function parseArchive(text: string, relative: string) {
  const parts = relative.split("/");
  const [day, month, year] = parts[0].split("-").map(Number);
  const firstSeenAt = new Date(Date.UTC(year, month - 1, day, 12));
  const linkSection = text.match(
    /##[^\n]*(?:Application Link|Apply|Application URL)[^\n]*\n([\s\S]*?)(?=\n##|$)/i,
  )?.[1];
  const url = (linkSection ?? text).match(/https:\/\/[^\s)<>\]]+/)?.[0] ?? "";
  const location =
    text
      .match(
        /##[^\n]*(?:Work Model|Location)[^\n]*\n([\s\S]*?)(?=\n##|$)/i,
      )?.[1]
      ?.replace(/[*#]/g, "")
      .trim()
      .slice(0, 600) ?? "Location not recorded";
  const title =
    text.match(/^#\s+(.+)$/m)?.[1] ??
    parts[2]?.replace(/_/g, " ") ??
    "Untitled role";
  return {
    externalId: relative,
    title: title.replace(/\*\*/g, ""),
    company: parts[1]
      .split("_")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" "),
    location,
    description: text,
    applyUrl: safeUrl(url),
    firstSeenAt: Number.isNaN(firstSeenAt.valueOf()) ? new Date() : firstSeenAt,
    historical: true,
  };
}
async function jobFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await jobFiles(full)));
    else if (entry.name === "job_description.md") result.push(full);
  }
  return result;
}
export async function importArchive() {
  await seedSources();
  const source = await db.source.findUniqueOrThrow({
    where: { key: "archive" },
  });
  let added = 0,
    skipped = 0;
  const files = await jobFiles(path.join(process.cwd(), "jobs"));
  for (const file of files) {
    const relative = path.relative(path.join(process.cwd(), "jobs"), file);
    const job = parseArchive(await readFile(file, "utf8"), relative);
    if (!job.applyUrl) {
      skipped++;
      continue;
    }
    const saved = await upsertJob(source, job);
    if (saved.added) added++;
    const board = discoverBoard(job.applyUrl);
    if (board && /^[\w-]{1,100}$/.test(board.board)) {
      const key = `${board.kind}-${board.region}-${board.board.toLowerCase()}`;
      await db.source.upsert({
        where: { key },
        create: {
          key,
          name: job.company,
          ...board,
          enabled: false,
          intervalMinutes: 240,
        },
        update: {},
      });
    }
  }
  await db.source.update({
    where: { id: source.id },
    data: { lastSuccessAt: new Date() },
  });
  return { scanned: files.length, added, skipped };
}
