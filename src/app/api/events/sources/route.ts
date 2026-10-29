import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkMutation, errorResponse } from "@/lib/api";
const schema = z
  .object({
    id: z.string(),
    enabled: z.boolean().optional(),
    intervalMinutes: z.number().int().min(60).max(10080).optional(),
    refresh: z.boolean().optional(),
  })
  .strict();
export async function PATCH(request: NextRequest) {
  try {
    checkMutation(request);
    const { id, refresh, ...data } = schema.parse(await request.json());
    const source = await db.eventSource.findUniqueOrThrow({ where: { id } });
    if (source.kind === "manual")
      throw new Error("Manual entries do not have an automatic feed.");
    if (refresh && !source.enabled && data.enabled !== true)
      throw new Error("Enable the source before requesting a refresh.");
    return NextResponse.json(
      await db.eventSource.update({
        where: { id },
        data: {
          ...data,
          ...(refresh || data.enabled === true
            ? { nextRunAt: new Date() }
            : {}),
        },
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
