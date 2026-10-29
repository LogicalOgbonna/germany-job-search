import "dotenv/config";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { db } from "../src/lib/db";

// Registers employer boards from a JSON registry. Existing sources keep their settings.
const boards = z.array(
  z.object({
    name: z.string().min(1).max(100),
    kind: z.enum([
      "ashby",
      "greenhouse",
      "join",
      "lever",
      "personio",
      "recruitee",
      "smartrecruiters",
      "teamtailor",
      "workable",
    ]),
    board: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    region: z.enum(["global", "eu", "de", "com"]).default("global"),
  }),
);
async function main() {
  const file = process.argv[2] ?? "content/sources/employer-boards.json";
  const list = boards.parse(JSON.parse(await readFile(file, "utf8")));
  const added: string[] = [];
  for (const board of list) {
    const key = `${board.kind}-${board.region}-${board.board.toLowerCase()}`;
    const existing = await db.source.findUnique({ where: { key } });
    if (existing) continue;
    await db.source.create({
      data: { ...board, key, enabled: true, intervalMinutes: 360 },
    });
    added.push(key);
  }
  console.log({ file, listed: list.length, added: added.length });
  if (added.length) console.log(added.join("\n"));
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
