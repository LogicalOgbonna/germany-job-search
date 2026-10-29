import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { errorResponse } from "@/lib/api";
export async function GET() {
  try {
    const rows = await db.application.findMany({
      include: {
        job: true,
        events: true,
        mail: {
          select: {
            subject: true,
            fromName: true,
            fromAddress: true,
            receivedAt: true,
            category: true,
            state: true,
          },
          orderBy: { receivedAt: "asc" },
        },
      },
    });
    // A card made from an email keeps the email text as its job description. Mail bodies stay local.
    const applications = rows.map((row) =>
      row.origin === "email"
        ? { ...row, job: { ...row.job, description: "" } }
        : row,
    );
    return NextResponse.json(
      { exportedAt: new Date().toISOString(), applications },
      {
        headers: {
          "Content-Disposition":
            'attachment; filename="jobdesk-applications.json"',
        },
      },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
