import { NextRequest, NextResponse } from "next/server";
import { checkMutation, errorResponse } from "@/lib/api";
import { updateInterview } from "@/lib/interviews/store";
import { draftThankYou } from "@/lib/interviews/prep";
// Drafts a short thank-you note with Claude. Jobdesk shows it and never sends it.
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    checkMutation(request);
    const { id } = await ctx.params;
    const draft = await draftThankYou(id);
    await updateInterview(id, { thankYouDraft: draft });
    return NextResponse.json({ draft });
  } catch (e) {
    return errorResponse(e);
  }
}
