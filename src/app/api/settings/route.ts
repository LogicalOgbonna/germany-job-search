import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { settingsSchema } from "@/lib/domain";
import { checkMutation, errorResponse } from "@/lib/api";
import { readProfile } from "@/lib/profile";
export async function GET() {
  try {
    return NextResponse.json(await readProfile());
  } catch (e) {
    return errorResponse(e);
  }
}
export async function PUT(request: NextRequest) {
  try {
    checkMutation(request);
    const value = settingsSchema.parse(await request.json());
    await db.setting.upsert({
      where: { key: "preferences" },
      create: { key: "preferences", value },
      update: { value },
    });
    return NextResponse.json(value);
  } catch (e) {
    return errorResponse(e);
  }
}
