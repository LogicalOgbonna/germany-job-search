import { NextRequest, NextResponse } from "next/server";
import { checkMutation, errorResponse } from "@/lib/api";
import {
  deleteInterview,
  interviewDetail,
  interviewPatchSchema,
  updateInterview,
} from "@/lib/interviews/store";
export const dynamic = "force-dynamic";
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    return NextResponse.json(await interviewDetail(id));
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    checkMutation(request);
    const patch = interviewPatchSchema.parse(await request.json());
    const { id } = await ctx.params;
    await updateInterview(id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    checkMutation(request);
    const { id } = await ctx.params;
    await deleteInterview(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
