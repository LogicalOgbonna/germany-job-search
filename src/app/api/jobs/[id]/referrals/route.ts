import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkMutation, errorResponse } from "@/lib/api";
import {
  companyDomain,
  contactSchema,
  workEmail,
} from "@/lib/referrals/domain";
import { connectionsAt } from "@/lib/linkedin/connections";
import { linkedinUrl } from "@/lib/referrals/domain";
import { research, saveContact } from "@/lib/referrals/store";
export async function GET(
  _r: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const jobId = (await ctx.params).id;
    const [contacts, search, job] = await Promise.all([
      db.referral.findMany({
        where: { jobId },
        orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      }),
      db.referralSearch.findUnique({ where: { jobId } }),
      db.job.findUnique({ where: { id: jobId }, select: { company: true } }),
    ]);
    const connections = job ? await connectionsAt(job.company) : [];
    // Contacts saved before LinkedIn URLs were lower-cased keep their casing, so profiles are
    // always compared lower-cased.
    const savedProfiles = new Set(
      contacts.map((c) => c.linkedin.toLowerCase()).filter(Boolean),
    );
    const emails = contacts.map((c) => c.email).filter(Boolean),
      profiles = [...savedProfiles];
    const elsewhere = await db.referral.findMany({
      where: {
        jobId: { not: jobId },
        OR: [
          { email: { in: emails } },
          ...profiles.map((profile) => ({
            linkedin: { equals: profile, mode: "insensitive" as const },
          })),
        ],
      },
      select: {
        email: true,
        linkedin: true,
        status: true,
        job: { select: { title: true, company: true } },
      },
    });
    return NextResponse.json({
      contacts: contacts.map((c) => ({
        ...c,
        elsewhere: elsewhere.filter(
          (o) =>
            (c.email && o.email === c.email) ||
            (c.linkedin &&
              o.linkedin.toLowerCase() === c.linkedin.toLowerCase()),
        ),
      })),
      search,
      connections: connections.map((c) => ({
        id: c.id,
        name: c.name,
        position: c.position,
        company: c.company,
        profileUrl: c.profileUrl,
        connectedOn: c.connectedOn,
        saved: savedProfiles.has(
          (linkedinUrl(c.profileUrl) || c.profileUrl).toLowerCase(),
        ),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(
  r: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    checkMutation(r);
    const jobId = (await ctx.params).id;
    const body = z
      .discriminatedUnion("action", [
        z.object({
          action: z.literal("discover"),
          domain: z.string().max(253),
        }),
        z.object({
          action: z.literal("add"),
          domain: z.string().max(253).default(""),
          contact: contactSchema,
        }),
        z.object({
          action: z.literal("add-connection"),
          connectionId: z.string().min(1).max(100),
        }),
      ])
      .parse(await r.json());
    if (body.action === "discover") {
      await research(jobId, companyDomain(body.domain));
      return NextResponse.json({ ok: true });
    }
    if (body.action === "add-connection") {
      const c = await db.linkedinConnection.findUnique({
        where: { id: body.connectionId },
      });
      if (!c)
        return NextResponse.json(
          { error: "Connection not found" },
          { status: 404 },
        );
      const since = c.connectedOn
        ? ` since ${c.connectedOn.toISOString().slice(0, 10)}`
        : "";
      return NextResponse.json(
        await saveContact(
          jobId,
          {
            name: c.name,
            title: c.position,
            email: "",
            linkedin: c.profileUrl,
            sourceUrl: c.profileUrl,
            sourceKind: "LinkedIn connection",
            sourceNote: `1st-degree LinkedIn connection${since}; current company per LinkedIn: ${c.company || "not shown"}`,
            emailStatus: "No email found",
          },
          { connected: true },
        ),
        { status: 201 },
      );
    }
    const domain = body.domain ? companyDomain(body.domain) : "";
    if (body.contact.email && !workEmail(body.contact.email, domain))
      throw new Error(
        "Use a work email at the confirmed employer domain. Leave email blank for a LinkedIn-only contact.",
      );
    if (domain)
      await db.referralSearch.upsert({
        where: { jobId },
        create: { jobId, domain },
        update: { domain },
      });
    return NextResponse.json(
      await saveContact(jobId, {
        ...body.contact,
        sourceKind: "Manual professional source",
        emailStatus: body.contact.email
          ? "User-provided work email; not verified"
          : "No email found",
      }),
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
