import { NextRequest, NextResponse } from "next/server";
import { generateDocuments } from "@/lib/documents";
import { checkMutation, errorResponse } from "@/lib/api";
import { z } from "zod";
export async function POST(request: NextRequest) {
  try {
    checkMutation(request);
    const { jobId } = z
      .object({ jobId: z.string().cuid() })
      .parse(await request.json());
    const document = await generateDocuments(jobId);
    return NextResponse.json({ id: document.id });
  } catch (e) {
    return errorResponse(e);
  }
}
