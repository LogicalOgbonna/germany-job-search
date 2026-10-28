"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileText,
  Filter,
  Globe2,
  Layers3,
  LayoutDashboard,
  ListChecks,
  LoaderCircle,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
  Target,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ManualJob from "./manual-job";
import Events from "./events";
import Referrals from "./referrals";
import {
  ApplicationInterviews,
  InterviewPage,
  UpcomingInterviews,
} from "./interviews";
import {
  ActionNeeded,
  MailConnection,
  MailReview,
  MailTimeline,
  dueText,
  useMailOverview,
  type MailEntry,
  type MailOverview,
} from "./mail";
import type { Settings } from "@/lib/domain";
import type { EvidenceRole } from "@/lib/profile";

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  countries: string[];
  remote: boolean;
  salary: string | null;
  track: string;
  skills: string[];
  score: number;
  reasons: string[];
  eligibilityNote: string;
  checkedAt: string | null;
  firstSeenAt: string;
  publishedAt: string | null;
  applyUrl: string;
  description?: string;
  contentHash: string;
  application: {
    id: string;
    status: string;
    submittedAt: string | null;
    notes: string;
    eligibilityReviewed: boolean;
    followUpAt: string | null;
    evidence: string | null;
    origin: string;
    nextStep: string | null;
    nextStepDueAt: string | null;
    events?: { id: string; status: string; at: string; note: string | null }[];
  } | null;
  listings: { url: string; source: { name: string; kind: string } }[];
  documents?: {
    id: string;
    isCurrent: boolean;
    createdAt: string;
    approvedAt: string | null;
    jobHash: string;
  }[];
  mail?: MailEntry[];
};
type Source = {
  id: string;
  name: string;
  kind: string;
  board: string;
  enabled: boolean;
  intervalMinutes: number;
  nextRunAt: string;
  lastSuccessAt: string | null;
  lastError: string | null;
  _count: { listings: number };
  runs: {
    status: string;
    fetched: number;
    added: number;
    message: string | null;
  }[];
};
type Data = {
  jobs: Job[];
  total: number;
  page: number;
  sources: Source[];
  settings: Settings;
  workerHeartbeat: string | null;
  stats: {
    totalJobs: number;
    freshJobs: number;
    today: number;
    queued: number;
    prepared: number;
    submitted: number;
    assessments: number;
    interviews: number;
    replies: number;
    offers: number;
    followUps: number;
    history: { day: string; count: number }[];
  };
};
type View =
  | "today"
  | "discover"
  | "queue"
  | "pipeline"
  | "sources"
  | "profile"
  | "events"
  | "interview";
const tracks = [
  "Frontend",
  "Full-stack",
  "Backend",
  "Applied AI",
  "Automation",
];
const berlinDay = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const fmt = (value: number) => new Intl.NumberFormat("en").format(value);
const shortDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "Europe/Berlin",
      }).format(new Date(value))
    : "Not checked";
function ago(value: string | null) {
  if (!value) return "Never";
  const mins = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).valueOf()) / 60000),
  );
  return mins < 1
    ? "Just now"
    : mins < 60
      ? `${mins}m ago`
      : mins < 1440
        ? `${Math.floor(mins / 60)}h ago`
        : `${Math.floor(mins / 1440)}d ago`;
}
async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Something went wrong");
  return data;
}
function Logo({ company }: { company: string }) {
  const index = [...company].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 6;
  return (
    <span className={`company-logo logo-${index}`}>
      {company
        .split(/\s/)
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0])
        .join("")}
    </span>
  );
}
function Empty({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <BriefcaseBusiness size={24} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export default function Dashboard() {
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("today");
  const [data, setData] = useState<Data | null>(null);
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState("");
  const [country, setCountry] = useState("all"),
    [track, setTrack] = useState("");
  const [remote, setRemote] = useState(false),
    [live, setLive] = useState(false),
    [page, setPage] = useState(1);
  const [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [profile, setProfile] = useState<EvidenceRole[]>([]);
  const [revision, setRevision] = useState(0);
  const mail = useMailOverview(revision);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (
      [
        "today",
        "discover",
        "queue",
        "pipeline",
        "sources",
        "profile",
        "events",
      ].includes(p.get("view") ?? "")
    )
      setView(p.get("view") as View);
    if (p.get("view") === "interview" && p.get("id")) {
      setInterviewId(p.get("id"));
      setView("interview");
    }
    setQuery(p.get("q") ?? "");
    setCountry(p.get("country") ?? "all");
    setTrack(p.get("track") ?? "");
    setRemote(p.get("remote") === "true");
    setLive(p.get("live") === "true");
    setHydrated(true);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);
  const refresh = useCallback(() => setRevision((v) => v + 1), []);
  const notify = useCallback(
    (message: string) => {
      setToast(message);
      refresh();
    },
    [refresh],
  );
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    const p = new URLSearchParams({
      view,
      q: search,
      country,
      track,
      page: String(page),
      remote: String(remote),
      live: String(live),
    });
    if (view === "interview" && interviewId) p.set("id", interviewId);
    window.history.replaceState({}, "", `?${p}`);
    setLoading(true);
    fetch(`/api/dashboard?${p}`, { signal: controller.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        return d;
      })
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    view,
    search,
    country,
    track,
    page,
    remote,
    live,
    revision,
    hydrated,
    interviewId,
  ]);
  useEffect(() => {
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (view === "profile")
      api<{ roles: EvidenceRole[] }>("/api/settings")
        .then((p) => setProfile(p.roles))
        .catch((e) => setError(e.message));
  }, [view]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.key === "/" &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
      ) {
        e.preventDefault();
        searchInput.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const go = (next: View) => {
    setView(next);
    setPage(1);
    setQuery("");
    setTrack("");
  };
  const openInterview = (id: string) => {
    setSelected(null);
    setInterviewId(id);
    go("interview");
    window.scrollTo({ top: 0 });
  };
  const stats = data?.stats;
  const goal = data?.settings.dailyGoal ?? 100;
  const online =
    data?.workerHeartbeat &&
    Date.now() - new Date(data.workerHeartbeat).valueOf() < 150000;
  const titles: Record<View, string> = {
    today: "A little momentum. A new chapter.",
    discover: "Find your next opportunity.",
    queue: "Make your next move.",
    pipeline: "Every application, one clear picture.",
    events: "Good people. New possibilities.",
    sources: "Good opportunities start here.",
    profile: "Your experience. Your advantage.",
    interview: "Walk in prepared.",
  };
  const subtitles: Record<View, string> = {
    today: "Your job search, with a plan. Let’s move it forward today.",
    discover:
      "Relevant roles across Germany and the United States, in one place.",
    queue: "A focused space to prepare, review, and apply.",
    pipeline:
      "Track conversations, next steps, and the opportunities taking shape.",
    events: "Find your people at tech events and hackathons across Europe.",
    sources: "Connect employer boards and keep your job feed up to date.",
    profile: "Verified experience powers every match and every application.",
    interview:
      "Details, a prep sheet checked against your experience, practice and notes.",
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Layers3 size={23} />
          </span>
          jobdesk<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <nav aria-label="Main navigation">
          {[
            ["today", LayoutDashboard, "Overview"],
            ["discover", Search, "Discover jobs"],
            ["queue", ListChecks, "Application queue"],
            ["pipeline", TrendingUp, "My applications"],
            ["events", CalendarDays, "Events & hackathons"],
          ].map(([key, Icon, label]) => {
            const I = Icon as typeof Search;
            return (
              <button
                key={String(key)}
                aria-label={String(label)}
                onClick={() => go(key as View)}
                className={view === key ? "nav-item active" : "nav-item"}
              >
                <I size={19} />
                <span>{String(label)}</span>
                {key === "queue" && !!stats?.queued && (
                  <b>{stats.queued + stats.prepared}</b>
                )}
                {key === "pipeline" && !!mail?.review.length && (
                  <b title="Emails that need your review">
                    {mail.review.length}
                  </b>
                )}
              </button>
            );
          })}
        </nav>
        <div className="workspace-label second-label">YOUR WORKSPACE</div>
        <nav aria-label="Workspace settings">
          <button
            className={`nav-item ${view === "sources" ? "active" : ""}`}
            onClick={() => go("sources")}
          >
            <Globe2 size={19} />
            Job sources
            <span className="small-dot" />
          </button>
          <button
            className={`nav-item ${view === "profile" ? "active" : ""}`}
            onClick={() => go("profile")}
          >
            <Settings2 size={19} />
            Profile & preferences
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="focus-card">
            <span>
              <Sparkles size={17} /> BUILT AROUND YOU
            </span>
            <p>
              Great work deserves
              <br />
              the right opportunity.
            </p>
            <div>
              Germany <span>·</span> United States
            </div>
          </div>
          <div className="user-card">
            <span className="avatar">AO</span>
            <div>
              <strong>Arinze Ogbonna</strong>
              <small>Personal job search</small>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            My workspace <ChevronRight size={13} />
            <strong>
              {
                {
                  today: "Overview",
                  discover: "Discover jobs",
                  queue: "Application queue",
                  pipeline: "My applications",
                  events: "Events & hackathons",
                  sources: "Job sources",
                  profile: "Profile & preferences",
                  interview: "Interview",
                }[view]
              }
            </strong>
          </div>
          <div className="topbar-right">
            <span className={`sync-indicator ${online ? "connected" : ""}`}>
              <i />
              {online ? "Updates running" : "Updates paused"}
            </span>
            <span className="topbar-divider" />
            <span className="date">
              <CalendarDays size={15} />
              {hydrated &&
                new Date().toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "Europe/Berlin",
                })}
            </span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "today" ? "LET’S GET YOU HIRED" : "YOUR NEXT CHAPTER"}
              </div>
              <h1>{titles[view]}</h1>
              <p>{subtitles[view]}</p>
            </div>
            {view !== "events" && view !== "interview" && (
              <button
                className="primary"
                onClick={() =>
                  view === "queue"
                    ? data?.jobs[0]
                      ? setSelected(data.jobs[0].id)
                      : go("discover")
                    : go("queue")
                }
              >
                <Zap size={16} />
                {view === "queue" ? "Start application" : "Start a session"}
                <ArrowRight size={16} />
              </button>
            )}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <CircleHelp size={18} />
              <span>{error}</span>
              <button onClick={refresh}>Retry</button>
            </div>
          )}
          {view === "discover" && (
            <ManualJob
              onSaved={(id) => {
                setSelected(id);
                notify("Opportunity saved");
              }}
            />
          )}
          {!data && loading && (
            <div className="loading-state">
              <LoaderCircle className="spin" />
              Opening your workspace…
            </div>
          )}
          {data && (
            <>
              {["today", "discover", "queue", "pipeline"].includes(view) && (
                <div className="stats-grid">
                  <Stat
                    icon={Target}
                    label="APPLICATIONS TODAY"
                    value={`${stats!.today}`}
                    suffix={`/ ${goal}`}
                    note="Manually confirmed submissions"
                    color="green"
                  />
                  <Stat
                    icon={BriefcaseBusiness}
                    label="JOBS IN YOUR LIBRARY"
                    value={fmt(stats!.totalJobs)}
                    note={`${fmt(stats!.freshJobs)} checked in the last 48 hours`}
                    color="blue"
                  />
                  <Stat
                    icon={FileText}
                    label="READY TO APPLY"
                    value={String(stats!.prepared)}
                    note={`${stats!.queued} more in your queue`}
                    color="amber"
                  />
                  <Stat
                    icon={TrendingUp}
                    label="INTERVIEWS"
                    value={String(stats!.interviews)}
                    note={`${stats!.submitted} applications submitted`}
                    color="purple"
                  />
                </div>
              )}
              {view === "today" && (
                <UpcomingInterviews
                  revision={revision}
                  onOpen={openInterview}
                />
              )}
              {view === "today" && mail && (
                <ActionNeeded
                  actions={mail.actions}
                  onOpen={setSelected}
                  notify={notify}
                />
              )}
              {view === "pipeline" && mail && (
                <MailReview review={mail.review} notify={notify} />
              )}
              {view === "today" && (
                <div className="overview-grid">
                  <section className="card goal-card">
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">
                          ONE APPLICATION AT A TIME
                        </span>
                        <h2>Your daily momentum</h2>
                      </div>
                      <span className="tag subtle">Europe / Berlin</span>
                    </div>
                    <div className="goal-body">
                      <div
                        className="progress-ring"
                        style={
                          {
                            "--progress": `${Math.min(100, (stats!.today / goal) * 100)}%`,
                          } as React.CSSProperties
                        }
                      >
                        <div>
                          <strong>
                            {stats!.today}
                            <small>/{goal}</small>
                          </strong>
                          <span>applications today</span>
                        </div>
                      </div>
                      <div className="goal-copy">
                        <h3>
                          {stats!.today
                            ? "Keep your momentum going."
                            : "Your next chapter starts with one."}
                        </h3>
                        <p>
                          {Math.max(0, goal - stats!.today)} applications to
                          reach today’s goal.
                          <br />
                          Start with a focused session of 25.
                        </p>
                        <div className="session-chips">
                          {[1, 2, 3, 4].map((i) => (
                            <span
                              key={i}
                              className={
                                stats!.today >= (i * goal) / 4 ? "done" : ""
                              }
                            >
                              {stats!.today >= (i * goal) / 4 ? (
                                <Check size={12} />
                              ) : (
                                <span className="session-dot" />
                              )}
                              Session {i}
                            </span>
                          ))}
                        </div>
                        <button
                          className="text-button"
                          onClick={() => go("queue")}
                        >
                          Open application queue <ArrowRight size={15} />
                        </button>
                      </div>
                    </div>
                  </section>
                  <section className="card week-card">
                    <div className="section-heading">
                      <h2>This week</h2>
                      <span className="tag subtle">Last 7 days</span>
                    </div>
                    <div className="week-total">
                      <strong>
                        {stats!.history.reduce(
                          (sum, day) => sum + day.count,
                          0,
                        )}
                      </strong>
                      <span>applications submitted</span>
                    </div>
                    <div
                      className="chart"
                      aria-label="Applications over the last seven days"
                    >
                      {stats!.history.map((day, i) => (
                        <div className="bar-column" key={day.day}>
                          <span className="bar-count">{day.count || ""}</span>
                          <div
                            className={`bar ${i === 6 ? "current" : ""}`}
                            style={{
                              height: `${Math.max(3, (day.count / Math.max(goal, ...stats!.history.map((x) => x.count))) * 80)}px`,
                            }}
                            title={`${day.day}: ${day.count} applications`}
                          />
                          <small>
                            {new Date(
                              day.day + "T12:00:00Z",
                            ).toLocaleDateString("en", { weekday: "short" })}
                          </small>
                        </div>
                      ))}
                    </div>
                    <div className="chart-foot">
                      <span className="small-dot" />
                      Every confirmed application counts.
                    </div>
                  </section>
                </div>
              )}
              {["today", "discover", "queue", "pipeline"].includes(view) && (
                <section className="card job-section">
                  <div className="section-heading jobs-heading">
                    <div>
                      <h2>
                        {view === "queue"
                          ? "Your application queue"
                          : view === "pipeline"
                            ? "Your applications"
                            : view === "today"
                              ? "Opportunities for your next move"
                              : "Explore opportunities"}{" "}
                        <span className="count-pill">{fmt(data.total)}</span>
                      </h2>
                      <p>
                        {view === "pipeline"
                          ? "Submission dates and outcomes you have recorded."
                          : "Ranked by overlap with your verified experience. Eligibility still needs review."}
                      </p>
                    </div>
                    <button
                      className="icon-button"
                      onClick={refresh}
                      aria-label="Refresh job list"
                    >
                      <RefreshCw size={17} className={loading ? "spin" : ""} />
                    </button>
                  </div>
                  <div className="filters">
                    <div className="search-field">
                      <Search size={17} />
                      <input
                        ref={searchInput}
                        placeholder="Search roles or companies…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        aria-label="Search jobs"
                      />
                      <kbd>/</kbd>
                    </div>
                    <select
                      aria-label="Country"
                      value={country}
                      onChange={(e) => {
                        setCountry(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="all">
                        Germany & US + location review
                      </option>
                      <option value="DE">Germany</option>
                      <option value="US">United States</option>
                    </select>
                    <button
                      className={`filter-button ${remote ? "selected" : ""}`}
                      onClick={() => {
                        setRemote(!remote);
                        setPage(1);
                      }}
                    >
                      <Globe2 size={15} />
                      Remote
                    </button>
                    <button
                      className={`filter-button ${live ? "selected" : ""}`}
                      onClick={() => {
                        setLive(!live);
                        setPage(1);
                      }}
                    >
                      <Filter size={15} />
                      Recently checked
                    </button>
                  </div>
                  <div className="track-tabs">
                    <button
                      className={!track ? "selected" : ""}
                      onClick={() => {
                        setTrack("");
                        setPage(1);
                      }}
                    >
                      All roles
                    </button>
                    {tracks.map((t) => (
                      <button
                        className={track === t ? "selected" : ""}
                        key={t}
                        onClick={() => {
                          setTrack(t);
                          setPage(1);
                        }}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  {!data.jobs.length ? (
                    <Empty
                      title={
                        view === "queue"
                          ? "Your next move is waiting."
                          : view === "pipeline"
                            ? "Your story is just getting started."
                            : "No roles match these filters."
                      }
                    >
                      {view === "queue"
                        ? "Explore a role and add it to your queue. Your application pack comes next."
                        : view === "pipeline"
                          ? "Record a submitted application to start tracking conversations here."
                          : "Try another search or enable more employer boards in Job sources."}
                    </Empty>
                  ) : (
                    <div className="job-list">
                      {data.jobs.map((job) => (
                        <button
                          key={job.id}
                          className="job-row"
                          onClick={() => setSelected(job.id)}
                        >
                          <Logo company={job.company} />
                          <div className="job-main">
                            <div className="job-title-line">
                              <h3>{job.title}</h3>
                              {job.application && (
                                <span className="status-label">
                                  {job.application.status.replaceAll("_", " ")}
                                </span>
                              )}
                              {job.application?.origin === "email" && (
                                <span className="tag subtle">From email</span>
                              )}
                            </div>
                            <div className="job-meta">
                              <strong>{job.company}</strong>
                              <span>·</span>
                              <span>
                                <MapPin size={12} />
                                {job.countries.length
                                  ? job.countries
                                      .map((c) =>
                                        c === "DE"
                                          ? "Germany"
                                          : c === "US"
                                            ? "United States"
                                            : c,
                                      )
                                      .join(", ")
                                  : "Location review"}
                              </span>
                              {job.remote && (
                                <>
                                  <span>·</span>
                                  <span>Remote</span>
                                </>
                              )}
                            </div>
                            {job.application?.nextStep && (
                              <NextStep application={job.application} />
                            )}
                            <div className="job-tags">
                              {job.skills.slice(0, 4).map((s) => (
                                <span key={s}>{s}</span>
                              ))}
                              {job.salary && (
                                <span className="salary">{job.salary}</span>
                              )}
                            </div>
                          </div>
                          <div className="job-side">
                            <span
                              className={`match-badge ${job.score < 65 ? "moderate" : ""}`}
                            >
                              <Sparkles size={12} />
                              {job.score}% stack fit
                            </span>
                            <small>
                              {job.checkedAt
                                ? `Checked ${ago(job.checkedAt)}`
                                : `Saved ${shortDate(job.firstSeenAt)} · unverified`}
                            </small>
                            <span className="view-role">
                              View role <ArrowUpRight size={14} />
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="list-footer">
                    <span>
                      {data.total
                        ? `${(data.page - 1) * 25 + 1}–${Math.min(data.page * 25, data.total)} of ${fmt(data.total)} roles`
                        : "No results"}
                      <span className="footer-note">
                        {" "}
                        · No applications are sent automatically
                      </span>
                    </span>
                    <div>
                      <button
                        disabled={page <= 1}
                        aria-label="Previous page"
                        onClick={() => setPage((p) => p - 1)}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span>{page}</span>
                      <button
                        disabled={page * 25 >= data.total}
                        aria-label="Next page"
                        onClick={() => setPage((p) => p + 1)}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </section>
              )}
              {view === "pipeline" && (
                <section className="card analytics-card">
                  <div className="section-heading">
                    <h2>Your application funnel</h2>
                    <a className="secondary" href="/api/export">
                      <ArrowDownToLine size={15} />
                      Export history
                    </a>
                  </div>
                  <div className="funnel">
                    {[
                      ["Submitted", stats!.submitted],
                      ["Reply / outcome", stats!.replies],
                      ["Assessment", stats!.assessments],
                      ["In interview", stats!.interviews],
                      ["Offer", stats!.offers],
                    ].map(([label, count]) => (
                      <div key={label}>
                        <strong>{count}</strong>
                        <span>{label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="muted">
                    Current outcomes, based on your recorded updates.{" "}
                    {stats!.followUps} follow-ups are due.
                  </p>
                </section>
              )}
              {view === "interview" && interviewId && (
                <InterviewPage
                  id={interviewId}
                  onBack={() => go("today")}
                  onOpenCard={setSelected}
                  notify={notify}
                />
              )}
              {view === "events" && <Events />}
              {view === "sources" && (
                <Sources data={data} mail={mail} notify={notify} />
              )}
              {view === "profile" && (
                <Profile
                  settings={data.settings}
                  roles={profile}
                  notify={notify}
                />
              )}
              <footer className="page-footer">
                <span>
                  <span className="brand-dot">●</span> A more intentional job
                  search.
                </span>
                <span>Private workspace · Built for your next chapter</span>
              </footer>
            </>
          )}
        </main>
      </div>
      {selected && (
        <JobDetail
          id={selected}
          onClose={() => setSelected(null)}
          notify={notify}
          onOpenInterview={openInterview}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}

function NextStep({
  application,
}: {
  application: { nextStep: string | null; nextStepDueAt: string | null };
}) {
  const due = dueText(application.nextStepDueAt);
  return (
    <p className="job-next">
      <Clock3 size={11} />
      <span>
        Next: {application.nextStep}
        {due && (
          <b className={due.soon ? "danger" : ""}>
            {" "}
            · {due.text} ({shortDate(application.nextStepDueAt)})
          </b>
        )}
      </span>
    </p>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  suffix,
  note,
  color,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  suffix?: string;
  note: string;
  color: string;
}) {
  return (
    <section className="card stat">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${color}`}>
          <Icon size={17} />
        </span>
      </div>
      <div className="stat-value">
        {value}
        <small>{suffix}</small>
      </div>
      <p>{note}</p>
    </section>
  );
}

function JobDetail({
  id,
  onClose,
  notify,
  onOpenInterview,
}: {
  id: string;
  onClose: () => void;
  notify: (message: string) => void;
  onOpenInterview: (id: string) => void;
}) {
  const [job, setJob] = useState<Job | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [tab, setTab] = useState("role"),
    [confirm, setConfirm] = useState(false),
    [reviewed, setReviewed] = useState(false),
    [evidence, setEvidence] = useState("");
  const [notes, setNotes] = useState(""),
    [followUp, setFollowUp] = useState("");
  const [submittedDate, setSubmittedDate] = useState(berlinDay());
  const closeRef = useRef<HTMLButtonElement>(null),
    dialogRef = useRef<HTMLElement>(null);
  const load = useCallback(async () => {
    const j = await api<Job>(`/api/jobs/${id}`);
    setJob(j);
    setReviewed(j.application?.eligibilityReviewed ?? false);
    setNotes(j.application?.notes ?? "");
    setFollowUp(j.application?.followUpAt?.slice(0, 10) ?? "");
  }, [id]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    const previous = globalThis.document.activeElement as HTMLElement;
    closeRef.current?.focus();
    globalThis.document.body.style.overflow = "hidden";
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]),a[href],input,textarea,select",
        );
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && globalThis.document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && globalThis.document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      globalThis.document.body.style.overflow = "";
      previous?.focus();
    };
  }, [onClose]);
  async function action(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    try {
      await work();
      await load();
      notify(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  const update = (status: string, more: Record<string, unknown> = {}) =>
    api(`/api/jobs/${id}`, "PATCH", { status, ...more });
  const document = job?.documents?.[0];
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="detail-panel"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-title"
      >
        <div className="detail-top">
          <span>
            <BriefcaseBusiness size={17} />
            OPPORTUNITY DETAILS
          </span>
          <button
            ref={closeRef}
            className="icon-button"
            onClick={onClose}
            aria-label="Close job details"
          >
            <X size={21} />
          </button>
        </div>
        {!job ? (
          <div className="loading-state">{error || "Loading opportunity…"}</div>
        ) : (
          <>
            <div className="detail-heading">
              <Logo company={job.company} />
              <p>{job.company}</p>
              <h2 id="job-title">{job.title}</h2>
              <div className="job-meta">
                <span>
                  <MapPin size={13} />
                  {job.countries.join(" / ") || "Location requires review"}
                </span>
                {job.remote && <span>· Remote</span>}
                <span className="match-badge">
                  <Sparkles size={12} />
                  {job.score}% stack fit
                </span>
              </div>
              <div className="detail-actions">
                <a
                  className="primary"
                  href={job.applyUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {job.application?.origin === "email"
                    ? "Open in Gmail"
                    : "Open application"}{" "}
                  <ExternalLink size={15} />
                </a>
                {!job.application && (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      action(
                        () => update("queued"),
                        "Added to your application queue",
                      )
                    }
                  >
                    <Plus size={15} />
                    Add to queue
                  </button>
                )}
                {job.application && (
                  <span className="status-label">
                    {job.application.status.replaceAll("_", " ")}
                  </span>
                )}
                {job.application?.origin === "email" && (
                  <span className="tag subtle">From email</span>
                )}
              </div>
              {job.application?.nextStep && (
                <NextStep application={job.application} />
              )}
            </div>
            <div className="detail-tabs">
              {[
                ["role", "The role"],
                ["documents", "Application pack"],
                ["referrals", "Referrals"],
                ["tracking", "Notes & history"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={tab === key ? "selected" : ""}
                  onClick={() => setTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="detail-content">
              {error && (
                <div role="alert" className="error-banner">
                  {error}
                </div>
              )}
              {tab === "referrals" && (
                <Referrals jobId={id} company={job.company} title={job.title} />
              )}
              {tab === "role" && (
                <>
                  <div className="eligibility-box">
                    <CircleHelp size={18} />
                    <div>
                      <strong>Check eligibility before applying</strong>
                      <p>{job.eligibilityNote}</p>
                    </div>
                  </div>
                  <div className="fit-box">
                    <h3>
                      <Sparkles size={16} />
                      Why it’s in your feed
                    </h3>
                    {job.reasons.map((reason) => (
                      <p key={reason}>
                        <Check size={13} />
                        {reason}
                      </p>
                    ))}
                    <small>
                      Stack overlap is a guide, not a prediction of hiring
                      success.
                    </small>
                  </div>
                  <h3>Location & work model</h3>
                  <p className="location-copy">{job.location}</p>
                  <h3>Job description</h3>
                  <div className="markdown">
                    <Markdown remarkPlugins={[remarkGfm]}>
                      {job.description ?? ""}
                    </Markdown>
                  </div>
                  <div className="source-attribution">
                    <strong>Sources</strong>
                    {job.listings.map((listing, i) => (
                      <a
                        key={i}
                        href={listing.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {listing.source.name}
                        <ExternalLink size={12} />
                      </a>
                    ))}
                    <small>
                      {job.checkedAt
                        ? `Last checked ${shortDate(job.checkedAt)}`
                        : "Historical import. Current availability has not been verified."}
                    </small>
                  </div>
                </>
              )}
              {tab === "documents" && (
                <>
                  <div className="fit-box">
                    <h3>
                      <FileText size={17} />
                      An application grounded in your experience
                    </h3>
                    <p>
                      This pack includes your summary, core competencies, full
                      work history, role technologies, and detailed projects.
                      Achievements are ordered for this job. Review both
                      documents before sending.
                    </p>
                    <small>
                      Evidence-based templates · No paid AI service required
                    </small>
                  </div>
                  {!job.application?.submittedAt && (
                    <button
                      className="primary full-width"
                      disabled={busy}
                      onClick={() =>
                        action(async () => {
                          if (!job.application) await update("queued");
                          await api("/api/documents", "POST", { jobId: id });
                        }, "Application pack prepared for review")
                      }
                    >
                      <Sparkles size={16} />
                      {busy
                        ? "Preparing…"
                        : document
                          ? "Refresh application pack"
                          : "Prepare tailored CV & letter"}
                    </button>
                  )}
                  {document &&
                    !document.isCurrent &&
                    !job.application?.submittedAt && (
                      <p className="event-caution">
                        A fuller CV format is available, or your profile or job
                        details changed. Refresh this pack to generate the
                        current version, then review it again.
                      </p>
                    )}
                  {document && (
                    <>
                      <div className="document-grid">
                        {[
                          ["cv", "Tailored CV"],
                          ["letter", "Cover letter"],
                        ].map(([kind, title]) => (
                          <div className="document-card" key={kind}>
                            <FileText size={29} />
                            <h3>{title}</h3>
                            <span>{shortDate(document.createdAt)}</span>
                            <a
                              target="_blank"
                              rel="noreferrer"
                              href={`/api/documents/${document.id}?kind=${kind}`}
                            >
                              Preview <ExternalLink size={12} />
                            </a>
                            <a
                              className="secondary"
                              href={`/api/documents/${document.id}?kind=${kind}&format=pdf`}
                            >
                              <ArrowDownToLine size={14} />
                              Download PDF
                            </a>
                          </div>
                        ))}
                      </div>
                      {!document.approvedAt &&
                        document.isCurrent &&
                        !job.application?.submittedAt && (
                          <button
                            className="secondary full-width"
                            disabled={busy}
                            onClick={() =>
                              action(async () => {
                                await api(
                                  `/api/documents/${document.id}`,
                                  "PATCH",
                                  {},
                                );
                                await update("prepared");
                              }, "Documents approved. Ready to apply.")
                            }
                          >
                            <CheckCircle2 size={16} />I reviewed both documents
                            · Mark ready
                          </button>
                        )}
                      {document.approvedAt &&
                        (document.isCurrent ||
                          job.application?.submittedAt) && (
                          <p className="success-copy">
                            <CheckCircle2 size={15} />
                            Documents reviewed {shortDate(document.approvedAt)}
                          </p>
                        )}
                    </>
                  )}
                  <div className="answers">
                    <h3>Quick answers</h3>
                    {[
                      ["Full name", "Arinze Ogbonna"],
                      ["Email", "arinzeogbo@gmail.com"],
                      ["LinkedIn", "https://linkedin.com/in/arinze-ogbonna"],
                    ].map(([label, value]) => (
                      <button
                        key={label}
                        onClick={() =>
                          navigator.clipboard
                            .writeText(value)
                            .then(() => notify(`${label} copied`))
                            .catch(() =>
                              setError(
                                "Clipboard unavailable. Select and copy the text.",
                              ),
                            )
                        }
                      >
                        <span>
                          {label}
                          <strong>{value}</strong>
                        </span>
                        <span>Copy</span>
                      </button>
                    ))}
                    <p className="muted">
                      Authorization, salary, and notice period answers need your
                      confirmation.
                    </p>
                  </div>
                </>
              )}
              {tab === "tracking" && (
                <>
                  {job.application && (
                    <ApplicationInterviews
                      applicationId={job.application.id}
                      onOpen={onOpenInterview}
                      onChanged={(message) => {
                        notify(message);
                        // The card's next step follows its soonest interview.
                        load().catch(() => {});
                      }}
                    />
                  )}
                  <label className="field">
                    Your notes
                    <textarea
                      rows={5}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Recruiter details, questions, next steps…"
                    />
                  </label>
                  <label className="field">
                    Follow-up date
                    <input
                      type="date"
                      value={followUp}
                      onChange={(e) => setFollowUp(e.target.value)}
                    />
                  </label>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      action(
                        () =>
                          update(job.application?.status ?? "queued", {
                            notes,
                            followUpAt: followUp
                              ? new Date(followUp + "T12:00:00Z").toISOString()
                              : null,
                          }),
                        "Notes saved",
                      )
                    }
                  >
                    Save notes
                  </button>
                  {(job.application?.submittedAt ||
                    job.application?.origin === "email") && (
                    <label className="field outcome-field">
                      Application outcome
                      <select
                        value={job.application.status}
                        disabled={busy}
                        onChange={(e) =>
                          action(
                            () => update(e.target.value),
                            "Application updated",
                          )
                        }
                      >
                        {[
                          "submitted",
                          "response",
                          "assessment",
                          "interview",
                          "offer",
                          "on_hold",
                          "rejected",
                          "withdrawn",
                        ].map((s) => (
                          <option key={s} value={s}>
                            {s[0].toUpperCase() +
                              s.slice(1).replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <MailTimeline
                    mail={job.mail ?? []}
                    onChanged={async (message) => {
                      notify(message);
                      // Undoing the email that created this card removes the card.
                      await load().catch(onClose);
                    }}
                  />
                  <h3 className="history-heading">Activity</h3>
                  {job.application?.events?.length ? (
                    job.application.events.map((event) => (
                      <div className="history-event" key={event.id}>
                        <span className="small-dot" />
                        <div>
                          <strong>{event.status.replaceAll("_", " ")}</strong>
                          <small>{shortDate(event.at)}</small>
                          {event.note && <p>{event.note}</p>}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="muted">No application activity yet.</p>
                  )}
                  {job.application?.submittedAt && (
                    <button
                      className="text-button danger"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Correct this record? The submission count will be reduced, and the correction will be kept in history.",
                          )
                        )
                          action(
                            () => update("queued", { undoSubmission: true }),
                            "Submission corrected",
                          );
                      }}
                    >
                      Correct an incorrectly recorded submission
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="detail-bottom">
              {job.application?.submittedAt ? (
                <span className="success-copy">
                  <CheckCircle2 size={17} />
                  Submission recorded · {shortDate(job.application.submittedAt)}
                </span>
              ) : confirm ? (
                <div className="confirmation">
                  <h3>Confirm your application was submitted</h3>
                  <p>
                    Only record this after you have completed the employer’s
                    form.
                  </p>
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={reviewed}
                      onChange={(e) => setReviewed(e.target.checked)}
                    />
                    I checked the role’s location and work eligibility.
                  </label>
                  <label className="field">
                    Submission date
                    <input
                      type="date"
                      value={submittedDate}
                      max={berlinDay()}
                      onChange={(e) => setSubmittedDate(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    Confirmation details
                    <input
                      value={evidence}
                      onChange={(e) => setEvidence(e.target.value)}
                      placeholder="e.g. Confirmation email received from Acme"
                    />
                  </label>
                  <div className="button-row">
                    <button
                      className="secondary"
                      onClick={() => setConfirm(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="primary"
                      disabled={busy || !reviewed || !evidence.trim()}
                      onClick={() =>
                        action(async () => {
                          const today = berlinDay();
                          await update("submitted", {
                            eligibilityReviewed: reviewed,
                            evidence,
                            submittedAt:
                              submittedDate === today
                                ? new Date().toISOString()
                                : new Date(
                                    submittedDate + "T12:00:00Z",
                                  ).toISOString(),
                          });
                          setConfirm(false);
                        }, "Submission recorded. One step forward.")
                      }
                    >
                      <Check size={16} />
                      Record submission
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      action(() => update("skipped"), "Role skipped")
                    }
                  >
                    Skip this role
                  </button>
                  <button className="primary" onClick={() => setConfirm(true)}>
                    <CheckCircle2 size={16} />
                    I’ve submitted this application
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Sources({
  data,
  mail,
  notify,
}: {
  data: Data;
  mail: MailOverview | null;
  notify: (message: string) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState(""),
    [kind, setKind] = useState("ashby"),
    [board, setBoard] = useState(""),
    [region, setRegion] = useState("global");
  const [filter, setFilter] = useState("");
  async function change(id: string, body: object) {
    setBusy(id);
    setError("");
    try {
      await api("/api/sources", "PATCH", { id, ...body });
      notify("Source updated");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="source-summary">
        <div className="card">
          <Globe2 />
          <strong>{data.sources.filter((s) => s.enabled).length}</strong>
          <span>Connected sources</span>
        </div>
        <div className="card">
          <Layers3 />
          <strong>{data.sources.filter((s) => !!s.board).length}</strong>
          <span>Employer boards discovered</span>
        </div>
        <div className="card">
          <Clock3 />
          <strong>Automatic</strong>
          <span>Updates while the worker is running</span>
        </div>
      </div>
      <MailConnection connection={mail?.connection ?? null} />
      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Your job sources</h2>
            <p>
              Employer boards discovered from your saved jobs are ready to
              enable.
            </p>
          </div>
          <button className="primary" onClick={() => setShowAdd(!showAdd)}>
            <Plus size={16} />
            Add employer
          </button>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {showAdd && (
          <form
            className="source-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy("add");
              try {
                await api("/api/sources", "POST", {
                  name,
                  kind,
                  board,
                  region,
                });
                setShowAdd(false);
                notify("Employer connected");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy("");
              }
            }}
          >
            <label className="field">
              Company
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Company name"
              />
            </label>
            <label className="field">
              Hiring platform
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {[
                  "ashby",
                  "greenhouse",
                  "join",
                  "lever",
                  "personio",
                  "recruitee",
                  "smartrecruiters",
                  "teamtailor",
                  "workable",
                ].map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Board identifier
              <input
                required
                pattern="[a-zA-Z0-9_-]+"
                value={board}
                onChange={(e) => setBoard(e.target.value)}
                placeholder="e.g. notion"
              />
            </label>
            <label className="field">
              Region
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
                <option value="global">Global</option>
                <option value="eu">EU</option>
                <option value="de">Personio .de</option>
                <option value="com">Personio .com</option>
              </select>
            </label>
            <button className="primary" disabled={busy === "add"}>
              Connect
            </button>
          </form>
        )}
        <div className="source-search search-field">
          <Search size={16} />
          <input
            aria-label="Find a source"
            placeholder="Find a source or employer…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="source-list">
          {data.sources
            .filter((s) =>
              `${s.name} ${s.kind}`
                .toLowerCase()
                .includes(filter.toLowerCase()),
            )
            .map((s) => (
              <div className="source-row" key={s.id}>
                <Logo company={s.name} />
                <div className="source-name">
                  <strong>{s.name}</strong>
                  <span>
                    {s.kind === "archive" ? "Historical job files" : s.kind}{" "}
                    {s.board && `· ${s.board}`}
                  </span>
                  {s.lastError && (
                    <small className="danger">{s.lastError}</small>
                  )}
                </div>
                <div className="source-health">
                  <span
                    className={`tag ${s.lastError ? "warning" : s.enabled ? "positive" : "subtle"}`}
                  >
                    {s.lastError
                      ? "Needs attention"
                      : s.enabled
                        ? "Connected"
                        : s.kind === "archive"
                          ? "Imported"
                          : "Available"}
                  </span>
                  <small>
                    {s.lastSuccessAt
                      ? `Updated ${ago(s.lastSuccessAt)}`
                      : "Not fetched yet"}{" "}
                    · {s._count.listings} listings
                  </small>
                </div>
                {s.kind !== "archive" && (
                  <>
                    <select
                      className="interval-select"
                      aria-label={`${s.name} refresh interval`}
                      value={s.intervalMinutes}
                      disabled={busy === s.id}
                      onChange={(e) =>
                        change(s.id, {
                          intervalMinutes: Number(e.target.value),
                        })
                      }
                    >
                      {[60, 120, 240, 360, 720, 1440]
                        .filter((m) => s.kind !== "remotive" || m >= 720)
                        .map((m) => (
                          <option key={m} value={m}>
                            Every {m / 60}h
                          </option>
                        ))}
                    </select>
                    <button
                      className="icon-button"
                      aria-label={`Refresh ${s.name}`}
                      disabled={!s.enabled || busy === s.id}
                      onClick={() => change(s.id, { refresh: true })}
                    >
                      <RefreshCw size={16} />
                    </button>
                    <button
                      className={`toggle ${s.enabled ? "on" : ""}`}
                      role="switch"
                      aria-checked={s.enabled}
                      aria-label={`Enable ${s.name}`}
                      disabled={busy === s.id}
                      onClick={() => change(s.id, { enabled: !s.enabled })}
                    >
                      <span />
                    </button>
                  </>
                )}
              </div>
            ))}
        </div>
      </section>
      <p className="muted source-note">
        Refresh requests are picked up by the worker within a minute. Board
        access and freshness vary by provider. LinkedIn jobs come from your
        LinkedIn job alert emails (read-only Gmail), never from scraping
        LinkedIn; Indeed and StepStone are not connected.
      </p>
    </>
  );
}

function Profile({
  settings,
  roles,
  notify,
}: {
  settings: Settings;
  roles: EvidenceRole[];
  notify: (message: string) => void;
}) {
  const [form, setForm] = useState(settings),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="profile-grid">
      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Search preferences</h2>
            <p>Keep your search aligned with what matters to you.</p>
          </div>
          <Settings2 size={19} />
        </div>
        <form
          className="preferences"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api("/api/settings", "PUT", form);
              notify("Preferences saved");
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && (
            <p className="danger" role="alert">
              {error}
            </p>
          )}
          <div className="field-pair">
            <label className="field">
              Daily application goal
              <input
                type="number"
                min={1}
                max={500}
                value={form.dailyGoal}
                onChange={(e) =>
                  setForm({ ...form, dailyGoal: Number(e.target.value) })
                }
              />
            </label>
            <label className="field">
              Daily time budget (minutes)
              <input
                type="number"
                min={15}
                max={960}
                value={form.dailyMinutes}
                onChange={(e) =>
                  setForm({ ...form, dailyMinutes: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <label className="field">
            US opportunities
            <select
              value={form.usPreference}
              onChange={(e) =>
                setForm({
                  ...form,
                  usPreference: e.target.value as Settings["usPreference"],
                })
              }
            >
              <option value="unknown">Not specified yet</option>
              <option value="remote">Remote from Germany</option>
              <option value="relocation">Relocation with sponsorship</option>
              <option value="authorized">I have US work authorization</option>
            </select>
          </label>
          <div className="field-pair">
            <label className="field">
              German proficiency
              <input
                value={form.germanLevel}
                onChange={(e) =>
                  setForm({ ...form, germanLevel: e.target.value })
                }
              />
            </label>
            <label className="field">
              Work model
              <select
                value={form.workModel}
                onChange={(e) =>
                  setForm({
                    ...form,
                    workModel: e.target.value as Settings["workModel"],
                  })
                }
              >
                <option value="any">Open to all</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
              </select>
            </label>
          </div>
          <label className="field">
            Salary preferences
            <input
              value={form.salaryMinimum}
              onChange={(e) =>
                setForm({ ...form, salaryMinimum: e.target.value })
              }
              placeholder="e.g. Germany €85k+, US $140k+"
            />
          </label>
          <p className="muted">
            Preferences are saved for review. Only the country, role, and remote
            filters currently narrow your feed; salary and authorization are not
            inferred.
          </p>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save preferences"}
            <Check size={16} />
          </button>
        </form>
      </section>
      <section className="card">
        <div className="section-heading">
          <div>
            <h2>Your verified experience</h2>
            <p>The foundation of every application pack.</p>
          </div>
          <CheckCircle2 size={20} className="teal" />
        </div>
        <div className="experience-list">
          {roles.map((role) => (
            <div key={role.company} className="experience-item">
              <span className="experience-dot" />
              <div>
                <h3>{role.title}</h3>
                <strong>
                  {role.company}
                  {role.project && " · Project"}
                </strong>
                <small>{role.dates}</small>
                <p>{role.bullets.length} verified achievements</p>
              </div>
            </div>
          ))}
        </div>
        <div className="profile-note">
          Your source files remain authoritative. New claims and technologies
          are never added automatically.
        </div>
      </section>
    </div>
  );
}
