import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { linkedinOverview } from "@/lib/linkedin/sync";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(await linkedinOverview());
  } catch (e) {
    return errorResponse(e);
  }
}
