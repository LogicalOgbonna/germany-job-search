import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/store";
import { localDay } from "@/lib/domain";
import { errorResponse } from "@/lib/api";
export const dynamic = "force-dynamic";
// How long an assessment or interview counts as current without any change.
const activeDays = 60;
export async function GET(request: NextRequest) {
  try {
    const p = request.nextUrl.searchParams;
    const query = (p.get("q") ?? "").slice(0, 200),
      country = p.get("country") ?? "all";
    const settings = await getSettings();
    const and: Prisma.JobWhereInput[] = [];
    // Cards made from an email are applications, not discovered jobs.
    const notMail: Prisma.JobWhereInput = {
      listings: { none: { source: { kind: "mail" } } },
    };
    if (country !== "all") and.push({ countries: { has: country } });
    else
      and.push({
        OR: [
          { countries: { hasSome: settings.countries } },
          { countries: { isEmpty: true } },
        ],
      });
    if (query)
      and.push({
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { company: { contains: query, mode: "insensitive" } },
          { skills: { has: query } },
        ],
      });
    if (p.get("track")) and.push({ track: p.get("track")! });
    if (p.get("remote") === "true") and.push({ remote: true });
    if (p.get("live") === "true")
      and.push({ checkedAt: { gte: new Date(Date.now() - 48 * 3600000) } });
    if (p.get("view") === "queue")
      and.push({ application: { status: { in: ["queued", "prepared"] } } });
    if (p.get("view") === "pipeline")
      and.push({
        application: {
          OR: [{ submittedAt: { not: null } }, { origin: "email" }],
        },
      });
    else and.push(notMail);
    const page = Math.max(1, Math.min(10000, Number(p.get("page") || 1) || 1));
    const where = { AND: and };
    const [jobs, total, sources, apps, heartbeat, totalJobs, freshJobs] =
      await Promise.all([
        db.job.findMany({
          where,
          take: 25,
          skip: (page - 1) * 25,
          orderBy: [
            { liveStatus: "asc" },
            { score: "desc" },
            { firstSeenAt: "desc" },
            { id: "asc" },
          ],
          include: {
            application: true,
            listings: {
              include: { source: { select: { name: true, kind: true } } },
            },
          },
        }),
        db.job.count({ where }),
        db.source.findMany({
          where: { kind: { not: "mail" } },
          include: {
            _count: { select: { listings: true } },
            runs: { orderBy: { startedAt: "desc" }, take: 1 },
          },
          orderBy: [{ enabled: "desc" }, { name: "asc" }],
        }),
        db.application.findMany({
          select: {
            id: true,
            status: true,
            origin: true,
            submittedAt: true,
            followUpAt: true,
            updatedAt: true,
            // When the card reached its current status: its latest timeline entry.
            events: {
              select: { status: true, at: true },
              orderBy: { at: "desc" },
              take: 1,
            },
          },
        }),
        db.setting.findUnique({ where: { key: "workerHeartbeat" } }),
        db.job.count({ where: notMail }),
        db.job.count({
          where: {
            ...notMail,
            checkedAt: { gte: new Date(Date.now() - 48 * 3600000) },
          },
        }),
      ]);
    const today = localDay();
    // Assessment and interview counts mean processes still in motion. A card that reached
    // that stage more than 60 days ago and never changed again (often an old process found
    // by the mail backfill) no longer counts; it stays on its card.
    const activeSince = Date.now() - activeDays * 86400000;
    const current = (status: string) =>
      apps.filter((a) => {
        if (a.status !== status) return false;
        const entered =
          a.events[0]?.status === status ? a.events[0].at : a.updatedAt;
        return entered.valueOf() >= activeSince;
      }).length;
    const submitted = apps.filter((a) => a.submittedAt);
    // The daily goal counts what was sent through Jobdesk, not what email revealed.
    const own = submitted.filter((a) => a.origin === "jobdesk");
    const history = Array.from({ length: 7 }, (_, i) => {
      const day = localDay(new Date(Date.now() - (6 - i) * 86400000));
      return {
        day,
        count: own.filter((a) => localDay(a.submittedAt!) === day).length,
      };
    });
    return NextResponse.json({
      jobs: jobs.map(({ description: _description, ...job }) => job),
      total,
      page,
      settings,
      sources,
      workerHeartbeat: heartbeat?.value ?? null,
      stats: {
        totalJobs,
        freshJobs,
        today: own.filter((a) => localDay(a.submittedAt!) === today).length,
        queued: apps.filter((a) => a.status === "queued").length,
        prepared: apps.filter((a) => a.status === "prepared").length,
        submitted: submitted.length,
        assessments: current("assessment"),
        interviews: current("interview"),
        replies: apps.filter((a) =>
          [
            "response",
            "assessment",
            "interview",
            "offer",
            "on_hold",
            "rejected",
          ].includes(a.status),
        ).length,
        offers: apps.filter((a) => a.status === "offer").length,
        followUps: apps.filter(
          (a) => a.followUpAt && a.followUpAt <= new Date(),
        ).length,
        history,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
