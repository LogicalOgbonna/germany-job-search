import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkMutation, errorResponse } from "@/lib/api";
import { startPractice } from "@/lib/interviews/practice";
import { interviewStages } from "@/lib/interviews/types";
const body = z.object({
  interviewId: z.string().min(1).max(100),
  questions: z.union([z.literal(5), z.literal(10)]),
  // Defaults to the interview's own stage.
  stage: z.enum(interviewStages).optional(),
});
export async function POST(request: NextRequest) {
  try {
    checkMutation(request);
    const data = body.parse(await request.json());
    const started = await startPractice(data.interviewId, {
      questions: data.questions,
      stage: data.stage,
    });
    return NextResponse.json(started);
  } catch (e) {
    return errorResponse(e);
  }
}
