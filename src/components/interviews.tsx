"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  Check,
  Copy,
  ExternalLink,
  Plus,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Practice } from "./practice";
import {
  interviewStages,
  type InterviewStage,
  type Interviewer,
  type PrepEvidence,
  type PrepSheet,
} from "@/lib/interviews/types";

type Upcoming = {
  id: string;
  applicationId: string;
  jobId: string;
  company: string;
  role: string;
  stage: InterviewStage;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  meetingUrl: string | null;
  status: string;
  prepStatus: string;
};
type Round = {
  id: string;
  stage: InterviewStage;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  status: string;
  prepStatus: string;
};
type ChecklistItem = { label: string; done: boolean };
type Detail = {
  interview: {
    id: string;
    applicationId: string;
    stage: InterviewStage;
    title: string;
    startsAt: string | null;
    endsAt: string | null;
    timezone: string;
    interviewerTimezone: string | null;
    interviewers: Interviewer[];
    meetingUrl: string | null;
    eventUrl: string | null;
    rescheduleUrl: string | null;
    status: string;
    prep: PrepSheet | null;
    prepStatus: string;
    prepError: string | null;
    prepGeneratedAt: string | null;
    checklist: ChecklistItem[];
    notes: string;
    debrief: string;
    nextSteps: string;
    thankYouDraft: string | null;
  };
  application: {
    id: string;
    jobId: string;
    status: string;
    company: string;
    role: string;
  };
  questions: Array<{
    id: string;
    position: number;
    question: string;
    outline: string;
    evidence: unknown;
    userNotes: string;
    ready: boolean;
    stale: boolean;
  }>;
  prepFile: { path: string; markdown: string } | null;
};

export const stageLabels: Record<InterviewStage, string> = {
  talent: "Talent screen",
  technical: "Technical interview",
  assessment: "Assessment",
  final: "Final interview",
  other: "Interview",
};
const prepLabels: Record<string, { text: string; tone: string }> = {
  none: { text: "No prep yet", tone: "subtle" },
  queued: { text: "Prep queued", tone: "subtle" },
  running: { text: "Writing prep", tone: "subtle" },
  ready: { text: "Prep ready", tone: "positive" },
  failed: { text: "Prep failed", tone: "warning" },
};
const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  done: "Done",
  cancelled: "Cancelled",
};
const defaultZone = "Europe/Berlin";
const commonZones = [
  "Europe/Berlin",
  "Europe/London",
  "Europe/Amsterdam",
  "Europe/Paris",
  "Europe/Lisbon",
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Africa/Lagos",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Jakarta",
];

async function request<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
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

function validZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
function zoneNames(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return commonZones;
  }
}
// Wall-clock parts of an instant in a time zone.
function wall(at: number, zone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}
const pad = (value: number) => String(value).padStart(2, "0");
const dayOf = (at: number, zone: string) => {
  const p = wall(at, zone);
  return Date.UTC(p.year, p.month - 1, p.day) / 86_400_000;
};
const clock = (at: number, zone: string) => {
  const p = wall(at, zone);
  return `${pad(p.hour)}:${pad(p.minute)}`;
};
// "2026-10-22" and "10:15" as shown in the form for an instant in a zone.
function formValues(value: string | null, zone: string) {
  if (!value) return { date: "", time: "" };
  const p = wall(Date.parse(value), zone);
  return {
    date: `${p.year}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}
// The instant at which the wall clock in `zone` shows this date and time.
function zonedInstant(date: string, time: string, zone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const offset = (at: number) => {
    const p = wall(at, zone);
    return (
      Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) -
      Math.floor(at / 60_000) * 60_000
    );
  };
  let at = target - offset(target);
  at = target - offset(at);
  return new Date(at).toISOString();
}
function zoneShort(at: number, zone: string): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      timeZoneName: "short",
    })
      .formatToParts(new Date(at))
      .find((part) => part.type === "timeZoneName")?.value ?? ""
  );
}
// "Thu 22 Oct 2026, 10:15 to 10:45"
function when(
  startsAt: string | null,
  endsAt: string | null,
  zone: string,
  year = true,
): string {
  if (!startsAt) return "Time not set";
  const start = Date.parse(startsAt);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(year ? { year: "numeric" } : {}),
  }).format(new Date(start));
  const end = endsAt ? ` to ${clock(Date.parse(endsAt), zone)}` : "";
  return `${day}, ${clock(start, zone)}${end}`;
}
function countdown(
  startsAt: string | null,
  endsAt: string | null,
  zone: string,
  now: number,
): string {
  if (!startsAt) return "Time not set";
  const start = Date.parse(startsAt);
  const end = endsAt ? Date.parse(endsAt) : start + 3_600_000;
  if (now >= start) return now < end ? "now" : "ended";
  const minutes = Math.ceil((start - now) / 60_000);
  if (minutes < 60) return `starts in ${minutes} min`;
  const days = dayOf(start, zone) - dayOf(now, zone);
  if (days === 0) return `today ${clock(start, zone)}`;
  if (days === 1) return `tomorrow ${clock(start, zone)}`;
  return `in ${days} days`;
}
function useNow(interval = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}
const asEvidence = (value: unknown): PrepEvidence[] =>
  Array.isArray(value)
    ? value.filter(
        (item): item is PrepEvidence =>
          !!item && typeof item === "object" && typeof item.quote === "string",
      )
    : [];
const outlineLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
const host = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};
const failure = (e: unknown) =>
  e instanceof Error ? e.message : "Action failed";

function PrepBadge({ status }: { status: string }) {
  const label = prepLabels[status] ?? prepLabels.none;
  return <span className={`tag ${label.tone}`}>{label.text}</span>;
}

export function UpcomingInterviews({
  revision,
  onOpen,
}: {
  revision: number;
  onOpen: (id: string) => void;
}) {
  const [rows, setRows] = useState<Upcoming[]>([]);
  const now = useNow();
  useEffect(() => {
    let active = true;
    request<Upcoming[]>("/api/interviews")
      .then((data) => {
        if (active) setRows(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [revision]);
  if (!rows.length) return null;
  return (
    <section
      className="card interview-section"
      aria-label="Upcoming interviews"
    >
      <div className="section-heading">
        <div>
          <h2>
            Upcoming interviews{" "}
            <span className="count-pill">{rows.length}</span>
          </h2>
          <p>Soonest first. Open one to prepare, practise and take notes.</p>
        </div>
      </div>
      {rows.map((row) => {
        const label = countdown(row.startsAt, row.endsAt, row.timezone, now);
        const soon = /^(now|starts in|today)/.test(label);
        return (
          <div className="mail-row interview-row" key={row.id}>
            <button
              className="interview-open"
              onClick={() => onOpen(row.id)}
              aria-label={`Open the ${stageLabels[row.stage]} with ${row.company}`}
            >
              <span className={`tag ${soon ? "warning" : "subtle"}`}>
                {label[0].toUpperCase() + label.slice(1)}
              </span>
              <span className="mail-row-main">
                <span className="mail-row-title">
                  <h3>{row.company}</h3>
                  <span className="status-label">{stageLabels[row.stage]}</span>
                </span>
                <span className="mail-meta">
                  {row.role} ·{" "}
                  {when(row.startsAt, row.endsAt, row.timezone, false)}{" "}
                  {row.startsAt && `(${row.timezone})`}
                </span>
              </span>
            </button>
            <div className="mail-row-side">
              <PrepBadge status={row.prepStatus} />
              {row.meetingUrl && (
                <a
                  className="secondary"
                  href={row.meetingUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Video size={14} />
                  Join
                </a>
              )}
              <button
                className="text-button"
                onClick={() => onOpen(row.id)}
                tabIndex={-1}
              >
                Prepare <ArrowUpRight size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function ZoneInput({
  value,
  onChange,
  label,
  optional,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  optional?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <input
        list="interview-zones"
        value={value}
        placeholder={optional ? "Same as the interview" : defaultZone}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function ZoneList() {
  return (
    <datalist id="interview-zones">
      {zoneNames().map((zone) => (
        <option key={zone} value={zone} />
      ))}
    </datalist>
  );
}

export function ApplicationInterviews({
  applicationId,
  onOpen,
  onChanged,
}: {
  applicationId: string;
  onOpen: (id: string) => void;
  onChanged?: (message: string) => void;
}) {
  const [rows, setRows] = useState<Round[] | null>(null),
    [adding, setAdding] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [stage, setStage] = useState<InterviewStage>("talent"),
    [date, setDate] = useState(""),
    [time, setTime] = useState(""),
    [zone, setZone] = useState(defaultZone),
    [meetingUrl, setMeetingUrl] = useState("");
  const load = useCallback(
    () =>
      request<Round[]>(
        `/api/interviews?applicationId=${encodeURIComponent(applicationId)}`,
      ).then(setRows),
    [applicationId],
  );
  useEffect(() => {
    load().catch((e) => setError(failure(e)));
  }, [load]);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const timezone = zone.trim() || defaultZone;
    if (!validZone(timezone))
      return setError(`"${timezone}" is not a known time zone.`);
    if (date && !time) return setError("Add a start time, or clear the date.");
    setBusy(true);
    try {
      await request("/api/interviews", "POST", {
        applicationId,
        stage,
        timezone,
        startsAt: date ? zonedInstant(date, time, timezone) : null,
        meetingUrl: meetingUrl.trim() || null,
      });
      await load();
      setAdding(false);
      setDate("");
      setTime("");
      setMeetingUrl("");
      onChanged?.("Interview added");
    } catch (e) {
      setError(failure(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="interview-rounds" aria-label="Interviews">
      <div className="interview-rounds-heading">
        <h3>Interviews</h3>
        <button
          className="secondary"
          onClick={() => setAdding(!adding)}
          aria-expanded={adding}
        >
          <Plus size={14} />
          Add interview
        </button>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {adding && (
        <form className="interview-form" onSubmit={add}>
          <ZoneList />
          <div className="field-pair">
            <label className="field">
              Stage
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as InterviewStage)}
              >
                {interviewStages.map((key) => (
                  <option key={key} value={key}>
                    {stageLabels[key]}
                  </option>
                ))}
              </select>
            </label>
            <ZoneInput value={zone} onChange={setZone} label="Time zone" />
          </div>
          <div className="field-pair">
            <label className="field">
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="field">
              Start time
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
          </div>
          <label className="field">
            Meeting link
            <input
              type="url"
              value={meetingUrl}
              placeholder="https://meet.google.com/…"
              onChange={(e) => setMeetingUrl(e.target.value)}
            />
          </label>
          <div className="button-row">
            <button
              type="button"
              className="secondary"
              onClick={() => setAdding(false)}
            >
              Cancel
            </button>
            <button className="primary" disabled={busy}>
              <Check size={14} />
              Save interview
            </button>
          </div>
        </form>
      )}
      {rows && !rows.length && !adding && (
        <p className="muted">No interviews recorded for this application.</p>
      )}
      {rows?.map((row) => (
        <button
          key={row.id}
          className="interview-round"
          onClick={() => onOpen(row.id)}
        >
          <span>
            <strong>{row.title || stageLabels[row.stage]}</strong>
            <small>
              {when(row.startsAt, row.endsAt, row.timezone)}
              {row.startsAt && ` (${row.timezone})`}
            </small>
          </span>
          <span className="interview-round-side">
            <span className="status-label">
              {statusLabels[row.status] ?? row.status}
            </span>
            <ArrowUpRight size={14} />
          </span>
        </button>
      ))}
    </section>
  );
}

function Section({
  id,
  title,
  note,
  action,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card interview-section" id={id} aria-label={title}>
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          {note && <p>{note}</p>}
        </div>
        {action}
      </div>
      <div className="interview-body">{children}</div>
    </section>
  );
}
function Bullets({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="interview-block">
      <h3>{title}</h3>
      <ul className="interview-list">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
function EvidenceList({ items }: { items: PrepEvidence[] }) {
  return (
    <>
      {items.map((item, index) => (
        <div className="interview-evidence" key={index}>
          {item.claim && <p>{item.claim}</p>}
          <blockquote className="mail-quote">{item.quote}</blockquote>
          <p className="mail-meta">{item.role}</p>
        </div>
      ))}
    </>
  );
}
function EvidenceBlock({
  title,
  items,
}: {
  title: string;
  items: PrepEvidence[];
}) {
  if (!items?.length) return null;
  return (
    <div className="interview-block">
      <h3>{title}</h3>
      <EvidenceList items={items} />
    </div>
  );
}

function Sheet({ sheet }: { sheet: PrepSheet }) {
  const facts = sheet.company?.facts ?? [];
  const sourced = facts.some((fact) => fact.sources?.length);
  const scripts = [
    ["Why this company", sheet.scripts?.whyCompany],
    ["What you are looking for", sheet.scripts?.lookingFor],
    ["Tell me about yourself", sheet.scripts?.aboutMe],
  ].filter(([, text]) => text);
  return (
    <div className="interview-sheet">
      <p className="mail-meta">
        Generated{" "}
        {new Date(sheet.generatedAt).toLocaleString("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: defaultZone,
        })}{" "}
        with {sheet.model} for the {stageLabels[sheet.stage] ?? "interview"}.
      </p>
      <Bullets title="Logistics" items={sheet.logistics} />
      <div className="interview-block">
        <h3>The company</h3>
        {sheet.company?.summary && <p>{sheet.company.summary}</p>}
        {facts.length > 0 && (
          <ul className="interview-list">
            {facts.map((fact, index) => (
              <li key={index}>
                {fact.text}
                {fact.sources?.length > 0 && (
                  <span className="interview-sources">
                    {fact.sources.map((source, i) => (
                      <a
                        key={i}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mail-link"
                      >
                        {source.title || host(source.url)}
                        <ExternalLink size={11} />
                      </a>
                    ))}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {!sourced && <p className="muted">No sources found.</p>}
      </div>
      <Bullets title="Why it fits you" items={sheet.company?.reasons ?? []} />
      <Bullets
        title="What the role involves"
        items={sheet.role?.responsibilities ?? []}
      />
      <Bullets title="Likely challenges" items={sheet.role?.challenges ?? []} />
      <Bullets title="Must have" items={sheet.role?.mustHave ?? []} />
      <Bullets title="Nice to have" items={sheet.role?.niceToHave ?? []} />
      <EvidenceBlock title="Your matching evidence" items={sheet.matches} />
      <EvidenceBlock
        title="Transferable experience"
        items={sheet.transferable}
      />
      {sheet.gaps?.length > 0 && (
        <div className="interview-block">
          <h3>Gaps and how to talk about them</h3>
          {sheet.gaps.map((gap, index) => (
            <div className="interview-evidence" key={index}>
              <p>
                <strong>{gap.gap}</strong>
              </p>
              <p>{gap.framing}</p>
            </div>
          ))}
        </div>
      )}
      {scripts.length > 0 && (
        <div className="interview-block">
          <h3>Scripts</h3>
          {scripts.map(([label, text]) => (
            <div className="interview-evidence" key={label}>
              <p>
                <strong>{label}</strong>
              </p>
              <p className="interview-script">{text}</p>
            </div>
          ))}
        </div>
      )}
      <Bullets title="Questions to ask them" items={sheet.askThem} />
      <div className="interview-block interview-check">
        <h3>Checked against your experience files</h3>
        {!sheet.warnings?.length && !sheet.dropped?.length ? (
          <p>No problems found.</p>
        ) : (
          <>
            {sheet.warnings?.length > 0 && (
              <>
                <p>Check these before you say them:</p>
                <ul className="interview-list">
                  {sheet.warnings.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </>
            )}
            {sheet.dropped?.length > 0 && (
              <>
                <p>Removed because the quote was not in your files:</p>
                <ul className="interview-list">
                  {sheet.dropped.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PrepFile({ file }: { file: { path: string; markdown: string } }) {
  return (
    <div className="interview-file">
      <p className="mail-meta">From {file.path}</p>
      <div className="markdown">
        <Markdown remarkPlugins={[remarkGfm]}>{file.markdown}</Markdown>
      </div>
    </div>
  );
}

function QuestionRow({
  interviewId,
  question,
}: {
  interviewId: string;
  question: Detail["questions"][number];
}) {
  const [notes, setNotes] = useState(question.userNotes),
    [ready, setReady] = useState(question.ready),
    [saved, setSaved] = useState(question.userNotes),
    [state, setState] = useState("");
  const save = async (patch: { userNotes?: string; ready?: boolean }) => {
    setState("Saving…");
    try {
      await request(
        `/api/interviews/${interviewId}/questions/${question.id}`,
        "PATCH",
        patch,
      );
      if (patch.userNotes !== undefined) setSaved(patch.userNotes);
      setState("Saved");
    } catch (e) {
      setState(failure(e));
    }
  };
  const evidence = asEvidence(question.evidence);
  const outline = outlineLines(question.outline);
  return (
    <div className={`interview-question ${ready ? "ready" : ""}`}>
      <div className="mail-row-title">
        <h3>{question.question}</h3>
        {ready && <span className="tag positive">Ready</span>}
      </div>
      {outline.length > 0 && (
        <ul className="interview-list">
          {outline.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      )}
      <EvidenceList items={evidence} />
      <label className="field">
        Your notes
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== saved) void save({ userNotes: notes });
          }}
          placeholder="How you will answer, in your own words"
        />
      </label>
      <div className="interview-question-foot">
        <label className="check-field">
          <input
            type="checkbox"
            checked={ready}
            onChange={(e) => {
              setReady(e.target.checked);
              void save({ ready: e.target.checked });
            }}
          />
          I am ready for this question
        </label>
        <small className="mail-meta" role="status">
          {state}
        </small>
      </div>
    </div>
  );
}

function Checklist({
  stored,
  seed,
  save,
}: {
  stored: ChecklistItem[];
  seed: string[];
  save: (items: ChecklistItem[]) => Promise<void>;
}) {
  const items = stored.length
    ? stored
    : seed.map((label) => ({ label, done: false }));
  const [draft, setDraft] = useState("");
  const change = (next: ChecklistItem[]) => void save(next);
  return (
    <div className="interview-checklist">
      {!stored.length && seed.length > 0 && (
        <p className="muted">
          Taken from your prep sheet. Your changes are saved with this
          interview.
        </p>
      )}
      {!items.length && <p className="muted">Nothing on the list yet.</p>}
      {items.map((item, index) => (
        <div className="interview-check-item" key={`${index}-${item.label}`}>
          <input
            type="checkbox"
            aria-label={`Done: ${item.label}`}
            checked={item.done}
            onChange={(e) =>
              change(
                items.map((other, i) =>
                  i === index ? { ...other, done: e.target.checked } : other,
                ),
              )
            }
          />
          <input
            className={item.done ? "done" : ""}
            defaultValue={item.label}
            aria-label="Checklist item"
            onBlur={(e) => {
              const label = e.target.value.trim();
              if (label && label !== item.label)
                change(
                  items.map((other, i) =>
                    i === index ? { ...other, label } : other,
                  ),
                );
            }}
          />
          <button
            className="icon-button"
            aria-label={`Remove ${item.label}`}
            onClick={() => change(items.filter((_, i) => i !== index))}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <form
        className="interview-check-add"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          change([...items, { label: draft.trim(), done: false }]);
          setDraft("");
        }}
      >
        <input
          value={draft}
          aria-label="New checklist item"
          placeholder="Add an item"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="secondary" disabled={!draft.trim()}>
          <Plus size={14} />
          Add item
        </button>
      </form>
    </div>
  );
}

type DetailsForm = {
  stage: InterviewStage;
  title: string;
  date: string;
  start: string;
  end: string;
  timezone: string;
  interviewerTimezone: string;
  interviewers: string;
  meetingUrl: string;
  eventUrl: string;
  rescheduleUrl: string;
  status: string;
};
function toForm(interview: Detail["interview"]): DetailsForm {
  const start = formValues(interview.startsAt, interview.timezone);
  const end = formValues(interview.endsAt, interview.timezone);
  return {
    stage: interview.stage,
    title: interview.title,
    date: start.date,
    start: start.time,
    end: end.time,
    timezone: interview.timezone,
    interviewerTimezone: interview.interviewerTimezone ?? "",
    interviewers: interview.interviewers
      .map((person) =>
        person.role ? `${person.name}, ${person.role}` : person.name,
      )
      .join("\n"),
    meetingUrl: interview.meetingUrl ?? "",
    eventUrl: interview.eventUrl ?? "",
    rescheduleUrl: interview.rescheduleUrl ?? "",
    status: interview.status,
  };
}

function Details({
  detail,
  save,
  remove,
}: {
  detail: Detail;
  save: (patch: Record<string, unknown>, message: string) => Promise<boolean>;
  remove: () => void;
}) {
  const { interview } = detail;
  const [form, setForm] = useState<DetailsForm | null>(null),
    [error, setError] = useState("");
  const zone = interview.timezone;
  const other =
    interview.interviewerTimezone && interview.interviewerTimezone !== zone
      ? interview.interviewerTimezone
      : null;
  const start = interview.startsAt ? Date.parse(interview.startsAt) : null;
  const set = (patch: Partial<DetailsForm>) =>
    setForm((current) => current && { ...current, ...patch });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError("");
    const timezone = form.timezone.trim() || defaultZone;
    const theirs = form.interviewerTimezone.trim();
    if (!validZone(timezone))
      return setError(`"${timezone}" is not a known time zone.`);
    if (theirs && !validZone(theirs))
      return setError(`"${theirs}" is not a known time zone.`);
    if (form.date && !form.start)
      return setError("Add a start time, or clear the date.");
    const known = new Map(
      interview.interviewers.map((person) => [person.name, person]),
    );
    const interviewers = form.interviewers
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, ...role] = line.split(",");
        const person = known.get(name.trim());
        return {
          ...person,
          name: name.trim(),
          ...(role.join(",").trim() ? { role: role.join(",").trim() } : {}),
        };
      });
    const done = await save(
      {
        stage: form.stage,
        title: form.title,
        timezone,
        interviewerTimezone: theirs || null,
        startsAt: form.date
          ? zonedInstant(form.date, form.start, timezone)
          : null,
        endsAt:
          form.date && form.end
            ? zonedInstant(form.date, form.end, timezone)
            : null,
        interviewers,
        meetingUrl: form.meetingUrl.trim() || null,
        eventUrl: form.eventUrl.trim() || null,
        rescheduleUrl: form.rescheduleUrl.trim() || null,
        status: form.status,
      },
      "Interview details saved",
    );
    if (done) setForm(null);
  }
  return (
    <Section
      id="interview-details"
      title="Details"
      action={
        !form && (
          <button
            className="secondary"
            onClick={() => setForm(toForm(interview))}
          >
            Edit details
          </button>
        )
      }
    >
      {!form ? (
        <>
          <div className="interview-times">
            <p>
              <CalendarClock size={15} />
              <span>
                <strong>
                  {when(interview.startsAt, interview.endsAt, zone)}
                </strong>{" "}
                {start !== null && (
                  <span className="mail-meta">
                    {zone} ({zoneShort(start, zone)})
                  </span>
                )}
              </span>
            </p>
            {other && start !== null && (
              <p>
                <CalendarClock size={15} />
                <span>
                  For the interviewer:{" "}
                  <strong>
                    {when(interview.startsAt, interview.endsAt, other)}
                  </strong>{" "}
                  <span className="mail-meta">
                    {other} ({zoneShort(start, other)})
                  </span>
                </span>
              </p>
            )}
          </div>
          <div className="interview-facts">
            <span className="status-label">{stageLabels[interview.stage]}</span>
            <span
              className={`tag ${interview.status === "scheduled" ? "positive" : "subtle"}`}
            >
              {statusLabels[interview.status] ?? interview.status}
            </span>
          </div>
          {interview.interviewers.length > 0 && (
            <ul className="interview-list">
              {interview.interviewers.map((person, index) => (
                <li key={index}>
                  <strong>{person.name}</strong>
                  {person.role && `, ${person.role}`}
                  {person.linkedin && (
                    <>
                      {" "}
                      <a
                        className="mail-link"
                        href={person.linkedin}
                        target="_blank"
                        rel="noreferrer"
                      >
                        LinkedIn <ExternalLink size={11} />
                      </a>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="interview-links">
            {interview.meetingUrl && (
              <a
                className="primary"
                href={interview.meetingUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Video size={15} />
                Join meeting
              </a>
            )}
            {interview.eventUrl && (
              <a
                className="secondary"
                href={interview.eventUrl}
                target="_blank"
                rel="noreferrer"
              >
                Event <ExternalLink size={13} />
              </a>
            )}
            {interview.rescheduleUrl && (
              <a
                className="secondary"
                href={interview.rescheduleUrl}
                target="_blank"
                rel="noreferrer"
              >
                Reschedule <ExternalLink size={13} />
              </a>
            )}
            {!interview.meetingUrl &&
              !interview.eventUrl &&
              !interview.rescheduleUrl && (
                <p className="muted">No meeting link saved yet.</p>
              )}
          </div>
        </>
      ) : (
        <form className="interview-form" onSubmit={submit}>
          <ZoneList />
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          <div className="field-pair">
            <label className="field">
              Stage
              <select
                value={form.stage}
                onChange={(e) =>
                  set({ stage: e.target.value as InterviewStage })
                }
              >
                {interviewStages.map((key) => (
                  <option key={key} value={key}>
                    {stageLabels[key]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Title
              <input
                value={form.title}
                onChange={(e) => set({ title: e.target.value })}
              />
            </label>
          </div>
          <div className="field-pair">
            <label className="field">
              Date
              <input
                type="date"
                value={form.date}
                onChange={(e) => set({ date: e.target.value })}
              />
            </label>
            <div className="field-pair">
              <label className="field">
                Starts
                <input
                  type="time"
                  value={form.start}
                  onChange={(e) => set({ start: e.target.value })}
                />
              </label>
              <label className="field">
                Ends
                <input
                  type="time"
                  value={form.end}
                  onChange={(e) => set({ end: e.target.value })}
                />
              </label>
            </div>
          </div>
          <div className="field-pair">
            <ZoneInput
              label="Time zone of the invitation"
              value={form.timezone}
              onChange={(timezone) => set({ timezone })}
            />
            <ZoneInput
              label="Interviewer's time zone (optional)"
              value={form.interviewerTimezone}
              optional
              onChange={(interviewerTimezone) => set({ interviewerTimezone })}
            />
          </div>
          <label className="field">
            Interviewers, one per line: name, then role after a comma
            <textarea
              rows={3}
              value={form.interviewers}
              onChange={(e) => set({ interviewers: e.target.value })}
            />
          </label>
          <label className="field">
            Meeting link
            <input
              type="url"
              value={form.meetingUrl}
              onChange={(e) => set({ meetingUrl: e.target.value })}
            />
          </label>
          <div className="field-pair">
            <label className="field">
              Event page
              <input
                type="url"
                value={form.eventUrl}
                onChange={(e) => set({ eventUrl: e.target.value })}
              />
            </label>
            <label className="field">
              Reschedule link
              <input
                type="url"
                value={form.rescheduleUrl}
                onChange={(e) => set({ rescheduleUrl: e.target.value })}
              />
            </label>
          </div>
          <label className="field">
            Status
            <select
              value={form.status}
              onChange={(e) => set({ status: e.target.value })}
            >
              {Object.entries(statusLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="interview-form-foot">
            <button
              type="button"
              className="text-button danger"
              onClick={remove}
            >
              Delete this interview
            </button>
            <div className="button-row">
              <button
                type="button"
                className="secondary"
                onClick={() => setForm(null)}
              >
                Cancel
              </button>
              <button className="primary">
                <Check size={14} />
                Save details
              </button>
            </div>
          </div>
        </form>
      )}
    </Section>
  );
}

function AfterCall({
  detail,
  save,
}: {
  detail: Detail;
  save: (patch: Record<string, unknown>, message: string) => Promise<boolean>;
}) {
  const { interview } = detail;
  const [debrief, setDebrief] = useState(interview.debrief),
    [nextSteps, setNextSteps] = useState(interview.nextSteps),
    [draft, setDraft] = useState(interview.thankYouDraft ?? ""),
    [drafting, setDrafting] = useState(false),
    [saving, setSaving] = useState(false),
    [draftNote, setDraftNote] = useState(""),
    [copied, setCopied] = useState("");
  const changed =
    debrief !== interview.debrief || nextSteps !== interview.nextSteps;
  async function saveDebrief() {
    setSaving(true);
    try {
      return await save({ debrief, nextSteps }, "Debrief saved");
    } finally {
      setSaving(false);
    }
  }
  // The draft is written from the saved debrief, so unsaved text is saved first.
  async function requestDraft() {
    setDrafting(true);
    setDraftNote("");
    try {
      if (changed && !(await saveDebrief())) {
        setDraftNote(
          "Your debrief could not be saved, so no draft was made. See the message at the top of the page.",
        );
        return;
      }
      const data = await request<{ draft: string }>(
        `/api/interviews/${interview.id}/thank-you`,
        "POST",
        {},
      );
      setDraft(data.draft);
    } catch (e) {
      setDraftNote(failure(e));
    } finally {
      setDrafting(false);
    }
  }
  return (
    <Section
      id="interview-after"
      title="After the call"
      note="Write it down while it is fresh. Next steps you save here become the card's next step."
    >
      <label className="field">
        Debrief: who you met, what they asked, how it went
        <textarea
          rows={6}
          value={debrief}
          onChange={(e) => setDebrief(e.target.value)}
          placeholder="People met, questions asked, what went well, what to improve"
        />
      </label>
      <label className="field">
        Next steps
        <input
          value={nextSteps}
          onChange={(e) => setNextSteps(e.target.value)}
          placeholder="For example: they will reply by Friday"
        />
      </label>
      <div className="interview-links">
        <button
          className="primary"
          disabled={!changed || saving || drafting}
          onClick={saveDebrief}
        >
          <Check size={14} />
          Save debrief
        </button>
        {interview.status !== "done" && (
          <button
            className="secondary"
            onClick={() => save({ status: "done" }, "Interview marked as done")}
          >
            Mark as done
          </button>
        )}
        {interview.status !== "cancelled" && (
          <button
            className="secondary"
            onClick={() =>
              save({ status: "cancelled" }, "Interview marked as cancelled")
            }
          >
            Mark as cancelled
          </button>
        )}
      </div>
      <div className="interview-block">
        <h3>Thank-you email</h3>
        <p className="muted">
          A short note to your interviewer, drafted from your debrief. Jobdesk
          never sends it. Your debrief, the stage, company, role, interviewer
          names and your name go to the Claude API. Unsaved debrief changes are
          saved first.
        </p>
        <button
          className="secondary"
          disabled={drafting || saving}
          onClick={requestDraft}
        >
          <Sparkles size={14} />
          {drafting
            ? "Drafting…"
            : draft
              ? "Draft it again"
              : "Draft thank-you email"}
        </button>
        {draftNote && (
          <p className="interview-notice" role="status">
            {draftNote}
          </p>
        )}
        {draft && (
          <>
            <textarea
              className="interview-draft"
              rows={7}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Thank-you draft"
            />
            <div className="interview-links">
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(draft);
                    setCopied("Copied. Nothing was sent.");
                  } catch {
                    setCopied(
                      "Clipboard unavailable. Select the text to copy it.",
                    );
                  }
                }}
              >
                <Copy size={14} />
                Copy
              </button>
              <span className="mail-meta" role="status">
                {copied}
              </span>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}

export function InterviewPage({
  id,
  onBack,
  onOpenCard,
  notify,
}: {
  id: string;
  onBack: () => void;
  onOpenCard?: (jobId: string) => void;
  notify?: (message: string) => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null),
    [error, setError] = useState(""),
    [actionError, setActionError] = useState(""),
    [queuing, setQueuing] = useState(false);
  const now = useNow();
  const load = useCallback(
    () =>
      request<Detail>(`/api/interviews/${id}`).then((data) => {
        setDetail(data);
        setError("");
      }),
    [id],
  );
  useEffect(() => {
    setDetail(null);
    load().catch((e) => setError(failure(e)));
  }, [load]);
  const prepStatus = detail?.interview.prepStatus;
  useEffect(() => {
    if (prepStatus !== "queued" && prepStatus !== "running") return;
    const timer = setInterval(() => {
      load().catch((e) => setError(failure(e)));
    }, 5000);
    return () => clearInterval(timer);
  }, [prepStatus, load]);
  const save = async (patch: Record<string, unknown>, message: string) => {
    setActionError("");
    try {
      await request(`/api/interviews/${id}`, "PATCH", patch);
      await load();
      if (message) notify?.(message);
      return true;
    } catch (e) {
      setActionError(failure(e));
      return false;
    }
  };
  async function generate() {
    setQueuing(true);
    setActionError("");
    try {
      await request(`/api/interviews/${id}/prep`, "POST", {});
      await load();
    } catch (e) {
      setActionError(failure(e));
    } finally {
      setQueuing(false);
    }
  }
  async function remove() {
    if (
      !window.confirm(
        "Delete this interview with its question notes and practice sessions?",
      )
    )
      return;
    try {
      await request(`/api/interviews/${id}`, "DELETE");
      notify?.("Interview deleted");
      onBack();
    } catch (e) {
      setActionError(failure(e));
    }
  }
  if (!detail)
    return (
      <div className="card interview-section interview-body interview-empty">
        <p>{error || "Opening the interview…"}</p>
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={14} />
          Back to overview
        </button>
      </div>
    );
  const { interview, application, questions } = detail;
  const sheet = interview.prep;
  const current = questions.filter((item) => !item.stale);
  const stale = questions.filter((item) => item.stale);
  const busy = prepStatus === "queued" || prepStatus === "running";
  const started =
    interview.status === "done" ||
    (interview.startsAt !== null && Date.parse(interview.startsAt) <= now);
  const sections = [
    ["interview-details", "Details"],
    ["interview-prep", "Prep sheet"],
    ["interview-questions", "Questions"],
    ["interview-practice", "Practice"],
    ...(started ? [["interview-after", "After the call"]] : []),
    ["interview-checklist", "Checklist"],
  ];
  return (
    <div className="interview-page">
      <div className="interview-top">
        <button className="text-button" onClick={onBack}>
          <ArrowLeft size={14} />
          Back to overview
        </button>
        <div className="interview-heading">
          <div>
            <span className="eyebrow">
              {stageLabels[interview.stage].toUpperCase()}
            </span>
            <h2>
              {interview.title || stageLabels[interview.stage]} with{" "}
              {application.company}
            </h2>
            <p className="mail-meta">
              {application.role} ·{" "}
              {countdown(
                interview.startsAt,
                interview.endsAt,
                interview.timezone,
                now,
              )}
            </p>
          </div>
          {onOpenCard && (
            <button
              className="secondary"
              onClick={() => onOpenCard(application.jobId)}
            >
              Open the application <ArrowUpRight size={14} />
            </button>
          )}
        </div>
        <nav
          className="track-tabs interview-nav"
          aria-label="Interview sections"
        >
          {sections.map(([anchor, label]) => (
            <button
              key={anchor}
              onClick={() =>
                document
                  .getElementById(anchor)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
            >
              {label}
            </button>
          ))}
        </nav>
      </div>
      {actionError && (
        <div className="error-banner" role="alert">
          {actionError}
        </div>
      )}
      <Details detail={detail} save={save} remove={remove} />
      <Section
        id="interview-prep"
        title="Prep sheet"
        note="Researched for this company and stage, then checked against your experience files."
        action={
          <button
            className="primary"
            disabled={busy || queuing}
            onClick={generate}
          >
            <Sparkles size={15} />
            {busy
              ? "Working…"
              : sheet || prepStatus === "failed"
                ? "Regenerate"
                : "Generate prep sheet"}
          </button>
        }
      >
        <p className="muted">
          Generating sends the job description, your application notes, the
          emails about this interview and your experience files to the Claude
          API, and searches the web for the company. Meeting and reschedule
          links are not sent.
        </p>
        {prepStatus === "queued" && (
          <p className="interview-notice" role="status">
            Waiting for the worker to start. This page checks again every 5
            seconds.
          </p>
        )}
        {prepStatus === "running" && (
          <p className="interview-notice" role="status">
            Researching the company and writing your sheet. This page checks
            again every 5 seconds.
          </p>
        )}
        {prepStatus === "failed" && (
          <div className="error-banner" role="alert">
            The prep sheet could not be made:{" "}
            {interview.prepError ?? "unknown error"}
            {sheet ? " Your earlier sheet is kept below." : ""}
          </div>
        )}
        {sheet ? (
          <>
            <Sheet sheet={sheet} />
            {detail.prepFile && (
              <details className="interview-saved">
                <summary>Your saved prep file</summary>
                <PrepFile file={detail.prepFile} />
              </details>
            )}
          </>
        ) : detail.prepFile ? (
          <PrepFile file={detail.prepFile} />
        ) : (
          !busy && (
            <p className="muted">
              No prep sheet yet. Generate one, or add an intro_prep.md to this
              job&apos;s folder.
            </p>
          )
        )}
      </Section>
      <Section
        id="interview-questions"
        title="Questions"
        note="Likely questions from the prep sheet. Your notes and ready marks are kept when the sheet is regenerated."
      >
        {!questions.length && (
          <p className="muted">
            Questions appear here once a prep sheet is generated.
          </p>
        )}
        {current.map((question) => (
          <QuestionRow
            key={question.id}
            interviewId={interview.id}
            question={question}
          />
        ))}
        {stale.length > 0 && (
          <div className="interview-stale">
            <h3>From an earlier sheet</h3>
            {stale.map((question) => (
              <QuestionRow
                key={question.id}
                interviewId={interview.id}
                question={question}
              />
            ))}
          </div>
        )}
      </Section>
      {/* Practice brings its own heading and cards. */}
      <section
        className="interview-section"
        id="interview-practice"
        aria-label="Practice"
      >
        <Practice interviewId={interview.id} />
      </section>
      {started && <AfterCall key={interview.id} detail={detail} save={save} />}
      <Section
        id="interview-checklist"
        title="Checklist"
        note="Things to do before the call."
      >
        <Checklist
          key={JSON.stringify(interview.checklist)}
          stored={interview.checklist}
          seed={sheet?.checklist ?? []}
          save={async (checklist) => {
            await save({ checklist }, "");
          }}
        />
      </Section>
    </div>
  );
}
