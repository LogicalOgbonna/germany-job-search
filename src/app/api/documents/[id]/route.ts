import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { documentFingerprint } from "@/lib/document-version";
import { readProfile } from "@/lib/profile";
import { checkMutation, errorResponse } from "@/lib/api";
export const runtime = "nodejs";
const filenamePart = (value: string, fallback: string, limit: number) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, limit)
    .replace(/^[_-]+|[_-]+$/g, "") || fallback;
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const doc = await db.document.findUniqueOrThrow({
      where: { id: (await ctx.params).id },
      include: { job: { select: { company: true, title: true } } },
    });
    const letter = request.nextUrl.searchParams.get("kind") === "letter";
    const html = letter ? doc.letterHtml : doc.cvHtml;
    if (request.nextUrl.searchParams.get("format") !== "pdf")
      return new NextResponse(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'",
        },
      });
    const profile = await readProfile();
    const filename =
      [
        filenamePart(doc.job.company, "Company", 70),
        filenamePart(profile.contact.name, "Candidate", 60),
        filenamePart(doc.job.title, "Position", 100),
      ].join("_") +
      (letter ? "_Cover_Letter" : "") +
      ".pdf";
    const puppeteer = (await import("puppeteer")).default;
    const browser = await puppeteer.launch({
      headless: true,
      ...(process.env.CHROME_EXECUTABLE_PATH
        ? { executablePath: process.env.CHROME_EXECUTABLE_PATH }
        : {}),
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        preferCSSPageSize: true,
      });
      return new NextResponse(Buffer.from(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    } finally {
      await browser.close();
    }
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
    const doc = await db.document.findUniqueOrThrow({
      where: { id: (await ctx.params).id },
      include: { job: { include: { application: true } } },
    });
    if (doc.job.application?.submittedAt)
      throw new Error("Submitted application documents are preserved.");
    const profile = await readProfile();
    if (
      doc.fingerprint !== documentFingerprint(profile.hash, doc.job.contentHash)
    )
      throw new Error(
        "Your profile, the job, or the CV template changed. Generate a new document pack.",
      );
    return NextResponse.json(
      await db.document.update({
        where: { id: doc.id },
        data: { approvedAt: new Date() },
      }),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
