import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkMutation, errorResponse } from "@/lib/api";
import {
  draftSchema,
  referralStatuses,
  contactPriority,
} from "@/lib/referrals/domain";
export async function PATCH(
  r: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    checkMutation(r);
    const id = (await ctx.params).id;
    const body = z
      .object({
        name: z.string().trim().min(1).max(160).optional(),
        title: z.string().trim().max(300).optional(),
        status: z.enum(referralStatuses).optional(),
        employmentReviewed: z.boolean().optional(),
        notes: z.string().max(10000).optional(),
        followUpAt: z.string().datetime().nullable().optional(),
        drafts: draftSchema.optional(),
      })
      .parse(await r.json());
    const current = await db.referral.findUniqueOrThrow({ where: { id } });
    if (
      body.status &&
      ["contacted", "replied", "referred"].includes(body.status) &&
      !(body.employmentReviewed ?? current.employmentReviewed)
    )
      throw new Error(
        "Check the contact's current employer and relevance before recording outreach.",
      );
    if (body.status === "contacted") {
      const suppressed = await db.referral.count({
        where: {
          status: "do_not_contact",
          OR: [
            ...(current.email ? [{ email: current.email }] : []),
            ...(current.linkedin ? [{ linkedin: current.linkedin }] : []),
          ],
        },
      });
      if (suppressed)
        throw new Error(
          "This person is marked do not contact. Review that record before outreach.",
        );
    }
    return NextResponse.json(
      await db.referral.update({
        where: { id },
        data: {
          ...body,
          ...(body.title === undefined
            ? {}
            : { priority: contactPriority(body.title) }),
          ...(body.status === "contacted" && !current.contactedAt
            ? { contactedAt: new Date() }
            : {}),
        },
      }),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(
  r: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    checkMutation(r);
    await db.referral.delete({ where: { id: (await ctx.params).id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
