import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkMutation, errorResponse } from "@/lib/api";
export async function PATCH(request: NextRequest) {
  try {
    checkMutation(request);
    const data = z
      .object({
        id: z.string(),
        enabled: z.boolean().optional(),
        refresh: z.boolean().optional(),
        intervalMinutes: z.number().int().min(60).max(10080).optional(),
      })
      .parse(await request.json());
    const source = await db.source.findUniqueOrThrow({
      where: { id: data.id },
    });
    if (source.kind === "archive")
      throw new Error("Use npm run import to refresh your saved jobs.");
    if (
      source.kind === "remotive" &&
      data.intervalMinutes &&
      data.intervalMinutes < 720
    )
      throw new Error("Remotive refreshes at most twice per day.");
    return NextResponse.json(
      await db.source.update({
        where: { id: data.id },
        data: {
          ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
          ...(data.intervalMinutes
            ? { intervalMinutes: data.intervalMinutes }
            : {}),
          ...(data.refresh || data.enabled ? { nextRunAt: new Date() } : {}),
        },
      }),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    checkMutation(request);
    const data = z
      .object({
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
      })
      .parse(await request.json());
    const source = await db.source.upsert({
      where: { key: `${data.kind}-${data.region}-${data.board.toLowerCase()}` },
      create: {
        ...data,
        key: `${data.kind}-${data.region}-${data.board.toLowerCase()}`,
        enabled: true,
      },
      update: { enabled: true, nextRunAt: new Date() },
    });
    return NextResponse.json(source);
  } catch (e) {
    return errorResponse(e);
  }
}
