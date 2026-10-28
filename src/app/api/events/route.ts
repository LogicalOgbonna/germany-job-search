import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkMutation, errorResponse } from "@/lib/api";
import { EUROPE } from "@/lib/events/domain";
import { upsertEvent } from "@/lib/events/store";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const q = (p.get("q") ?? "").slice(0, 200);
    const saved = p.get("saved") === "true";
    const page = Math.max(
      1,
      Math.min(10000, Math.floor(Number(p.get("page"))) || 1),
    );
    const now = new Date();
    const where: Prisma.TechEventWhereInput = {
      ...(saved
        ? { plan: { is: { status: { not: "dismissed" } } } }
        : {
            endsAt: { gt: now },
            status: { not: "cancelled" },
            NOT: { plan: { is: { status: "dismissed" } } },
          }),
    };
    if (saved) {
      const status = p.get("plan");
      if (
        ["saved", "registered", "attended", "dismissed"].includes(status ?? "")
      )
        where.plan = { is: { status: status! } };
      if (status === "due")
        where.plan = {
          is: {
            followUpAt: { lte: now },
            followUpDone: false,
            status: { not: "dismissed" },
          },
        };
    }
    if (q)
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    if (p.get("country") && Object.hasOwn(EUROPE, p.get("country")!))
      where.country = p.get("country")!;
    if (p.get("kind")) where.kind = p.get("kind")!;
    if (p.get("topic")) where.topics = { has: p.get("topic")! };
    if (p.get("free") === "true") where.free = true;
    if (p.get("days")) {
      const days = Number(p.get("days"));
      if ([7, 30, 90, 365].includes(days))
        where.startsAt = { lt: new Date(now.valueOf() + days * 86400000) };
    }
    const [
      events,
      total,
      sources,
      upcoming,
      shortlisted,
      attended,
      contacts,
      due,
      countries,
    ] = await Promise.all([
      db.techEvent.findMany({
        where,
        orderBy:
          p.get("sort") === "match"
            ? [{ score: "desc" }, { startsAt: "asc" }]
            : [{ startsAt: "asc" }, { score: "desc" }],
        skip: (page - 1) * 24,
        take: 24,
        include: {
          plan: true,
          listings: {
            include: { source: { select: { name: true, url: true } } },
          },
        },
      }),
      db.techEvent.count({ where }),
      db.eventSource.findMany({
        orderBy: { name: "asc" },
        include: {
          runs: { orderBy: { startedAt: "desc" }, take: 1 },
          _count: { select: { listings: true } },
        },
      }),
      db.techEvent.count({
        where: { endsAt: { gt: now }, status: { not: "cancelled" } },
      }),
      db.eventPlan.count({
        where: {
          status: { in: ["saved", "registered"] },
          event: { endsAt: { gt: now } },
        },
      }),
      db.eventPlan.count({ where: { status: "attended" } }),
      db.eventPlan.aggregate({
        where: { status: "attended" },
        _sum: { contactsMet: true },
      }),
      db.eventPlan.count({
        where: {
          followUpAt: { lte: now },
          followUpDone: false,
          status: { not: "dismissed" },
        },
      }),
      db.techEvent.findMany({
        where: { endsAt: { gt: now } },
        select: { country: true },
        distinct: ["country"],
      }),
    ]);
    return NextResponse.json({
      events,
      total,
      page,
      sources,
      countries: countries
        .map((c) => ({ code: c.country, name: EUROPE[c.country] ?? c.country }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      stats: {
        upcoming,
        shortlisted,
        attended,
        contacts: contacts._sum.contactsMet ?? 0,
        due,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
const manual = z.object({
  title: z.string().trim().min(3).max(250),
  url: z.url().max(2000),
  city: z.string().trim().min(1).max(150),
  country: z
    .string()
    .refine((c) => Object.hasOwn(EUROPE, c), "Choose a European country."),
  startsAt: z.iso.date(),
  endsAt: z.iso.date(),
  kind: z.enum(["conference", "meetup", "workshop", "hackathon"]),
  description: z.string().max(10000).default(""),
  cost: z.string().max(100).default("Price not published"),
});
export async function POST(request: NextRequest) {
  try {
    checkMutation(request);
    const input = manual.parse(await request.json());
    const startsAt = new Date(input.startsAt),
      endsAt = new Date(new Date(input.endsAt).valueOf() + 86400000);
    if (endsAt <= startsAt)
      throw new Error("The end date must be on or after the start date.");
    const source = await db.eventSource.upsert({
      where: { key: "manual" },
      create: {
        key: "manual",
        name: "Saved by you",
        kind: "manual",
        url: "",
        enabled: false,
        scope: "Manual entry; no automatic refresh",
      },
      update: {},
    });
    const result = await upsertEvent(source.id, {
      ...input,
      externalId: `${input.url}|${input.startsAt}`,
      startsAt,
      endsAt,
      allDay: true,
      format: "in-person",
      topics: ["software development"],
    });
    await db.eventPlan.upsert({
      where: { eventId: result.event.id },
      create: { eventId: result.event.id },
      update: { status: "saved" },
    });
    return NextResponse.json(result.event);
  } catch (error) {
    return errorResponse(error);
  }
}
