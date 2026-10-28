import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { eventCalendar } from "@/lib/events/domain";
import { errorResponse } from "@/lib/api";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const event = await db.techEvent.findUniqueOrThrow({ where: { id } });
    return new Response(eventCalendar(event), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="jobdesk-event.ics"',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
