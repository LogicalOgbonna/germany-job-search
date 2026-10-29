import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkMutation, errorResponse } from "@/lib/api";
import { completeNextStep, mailOverview } from "@/lib/mail/store";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await mailOverview());
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    checkMutation(request);
    const data = z
      .object({
        action: z.literal("done"),
        applicationId: z.string().min(1).max(100),
      })
      .parse(await request.json());
    await completeNextStep(data.applicationId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
