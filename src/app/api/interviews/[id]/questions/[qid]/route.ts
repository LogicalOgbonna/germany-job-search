import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkMutation, errorResponse } from "@/lib/api";
import { updateQuestion } from "@/lib/interviews/store";
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; qid: string }> },
) {
  try {
    checkMutation(request);
    const patch = z
      .object({
        userNotes: z.string().max(50_000).optional(),
        ready: z.boolean().optional(),
      })
      .parse(await request.json());
    const { id, qid } = await ctx.params;
    await updateQuestion(qid, patch, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
