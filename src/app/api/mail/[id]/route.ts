import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkMutation, errorResponse } from "@/lib/api";
import {
  addInterview,
  ignoreMail,
  resolveReview,
  undoMail,
  unlinkMail,
} from "@/lib/mail/store";
import { mailCategories } from "@/lib/mail/types";
const body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("resolve"),
    category: z.enum(mailCategories),
    // An application id, "new" for a card made from this email, or null for no application.
    applicationId: z.string().min(1).max(100).nullable(),
  }),
  z.object({ action: z.literal("ignore") }),
  z.object({ action: z.literal("undo") }),
  z.object({ action: z.literal("unlink") }),
  z.object({
    action: z.literal("add-interview"),
    applicationId: z.string().min(1).max(100),
  }),
]);
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    checkMutation(request);
    const data = body.parse(await request.json());
    const { id } = await ctx.params;
    if (data.action === "resolve")
      await resolveReview(id, {
        category: data.category,
        applicationId: data.applicationId,
      });
    else if (data.action === "ignore") await ignoreMail(id);
    else if (data.action === "undo") await undoMail(id);
    else if (data.action === "unlink") await unlinkMail(id);
    else
      return NextResponse.json({
        ok: true,
        ...(await addInterview(id, data.applicationId)),
      });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
