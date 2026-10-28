import { NextRequest, NextResponse } from "next/server";
import { checkMutation, errorResponse } from "@/lib/api";
import { requestPrep } from "@/lib/interviews/store";
// Queues prep generation; the worker picks it up and the page polls the status.
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    checkMutation(request);
    const { id } = await ctx.params;
    await requestPrep(id);
    return NextResponse.json({ ok: true, prepStatus: "queued" });
  } catch (e) {
    return errorResponse(e);
  }
}
