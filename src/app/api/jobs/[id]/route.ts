import { NextRequest, NextResponse } from "next/server";
import { readProfile } from "@/lib/profile";
import { documentFingerprint } from "@/lib/document-version";
import { db } from "@/lib/db";
import { checkMutation, errorResponse } from "@/lib/api";
import { changeApplication } from "@/lib/applications";
import { statuses } from "@/lib/domain";
import { mailForApplication } from "@/lib/mail/store";
import { z } from "zod";
export async function GET(
  _r: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const job = await db.job.findUnique({
      where: { id },
      include: {
        application: { include: { events: { orderBy: { at: "desc" } } } },
        listings: {
          include: { source: { select: { name: true, kind: true } } },
        },
        documents: {
          select: {
            id: true,
            createdAt: true,
            approvedAt: true,
            jobHash: true,
            profileHash: true,
            fingerprint: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    const profile = job ? await readProfile() : null;
    return job
      ? NextResponse.json({
          ...job,
          mail: job.application
            ? await mailForApplication(job.application.id)
            : [],
          documents: job.documents.map((doc) => ({
            ...doc,
            isCurrent:
              doc.fingerprint ===
              documentFingerprint(profile!.hash, job.contentHash),
          })),
        })
      : NextResponse.json({ error: "Job not found" }, { status: 404 });
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
    const body = z
      .object({
        status: z.enum(statuses),
        eligibilityReviewed: z.boolean().optional(),
        evidence: z.string().max(2000).optional(),
        notes: z.string().max(10000).optional(),
        submittedAt: z.string().datetime().optional(),
        followUpAt: z.string().datetime().nullable().optional(),
        undoSubmission: z.boolean().optional(),
      })
      .parse(await request.json());
    return NextResponse.json(
      await changeApplication((await ctx.params).id, body),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
