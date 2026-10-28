import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkMutation, errorResponse } from "@/lib/api";
const schema = z
  .object({
    status: z.enum(["saved", "registered", "attended", "dismissed"]).optional(),
    notes: z.string().max(10000).optional(),
    contactsMet: z.number().int().min(0).max(10000).optional(),
    followUpAt: z.iso.date().nullable().optional(),
    followUpDone: z.boolean().optional(),
  })
  .strict();
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    checkMutation(request);
    const { id } = await params;
    const input = schema.parse(await request.json());
    await db.techEvent.findUniqueOrThrow({ where: { id } });
    const { followUpAt, ...rest } = input;
    const data = {
      ...rest,
      ...(followUpAt !== undefined
        ? {
            followUpAt: followUpAt ? new Date(`${followUpAt}T00:00:00Z`) : null,
          }
        : {}),
    };
    const plan = await db.eventPlan.upsert({
      where: { eventId: id },
      create: { eventId: id, ...data },
      update: data,
    });
    return NextResponse.json(plan);
  } catch (error) {
    return errorResponse(error);
  }
}
