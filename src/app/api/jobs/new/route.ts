import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkMutation, errorResponse } from "@/lib/api";
import { safeUrl, hash } from "@/lib/domain";
import { upsertJob } from "@/lib/store";
export async function POST(request: NextRequest) {
  try {
    checkMutation(request);
    const data = z
      .object({
        title: z.string().min(2).max(250),
        company: z.string().min(1).max(150),
        location: z.string().min(1).max(500),
        description: z.string().min(20).max(100000),
        applyUrl: z
          .string()
          .url()
          .refine((v) => !!safeUrl(v), "Use an HTTPS application link"),
        remote: z.boolean(),
      })
      .parse(await request.json());
    const source = await db.source.upsert({
      where: { key: "saved-links" },
      create: { key: "saved-links", name: "Saved links", kind: "archive" },
      update: {},
    });
    const result = await upsertJob(source, {
      ...data,
      externalId: hash(data.applyUrl),
      historical: true,
    });
    return NextResponse.json({ id: result.job.id });
  } catch (e) {
    return errorResponse(e);
  }
}
