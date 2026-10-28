import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkMutation, errorResponse } from "@/lib/api";
import {
  answerTurn,
  deletePractice,
  finishPractice,
} from "@/lib/interviews/practice";
const body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("answer"),
    transcript: z.string().min(1).max(20000),
    // 0 when the answer was typed and not timed.
    seconds: z.number().min(0).max(3600),
  }),
  z.object({ action: z.literal("finish") }),
]);
type Ctx = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, ctx: Ctx) {
  try {
    checkMutation(request);
    const data = body.parse(await request.json());
    const { id } = await ctx.params;
    if (data.action === "answer")
      return NextResponse.json(
        await answerTurn(id, {
          transcript: data.transcript,
          seconds: data.seconds,
        }),
      );
    return NextResponse.json({ summary: await finishPractice(id) });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(request: NextRequest, ctx: Ctx) {
  try {
    checkMutation(request);
    const { id } = await ctx.params;
    await deletePractice(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
