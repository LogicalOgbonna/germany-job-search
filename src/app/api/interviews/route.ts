import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkMutation, errorResponse } from "@/lib/api";
import {
  createInterview,
  interviewInputSchema,
  interviewsForApplication,
  upcomingInterviews,
} from "@/lib/interviews/store";
export const dynamic = "force-dynamic";
// Upcoming interviews, or with ?applicationId= every interview of that application.
export async function GET(request: NextRequest) {
  try {
    const applicationId = request.nextUrl.searchParams.get("applicationId");
    return NextResponse.json(
      applicationId
        ? await interviewsForApplication(applicationId.slice(0, 100))
        : await upcomingInterviews(),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    checkMutation(request);
    const { applicationId, ...input } = interviewInputSchema
      .extend({ applicationId: z.string().min(1).max(100) })
      .parse(await request.json());
    return NextResponse.json(await createInterview(applicationId, input));
  } catch (e) {
    return errorResponse(e);
  }
}
