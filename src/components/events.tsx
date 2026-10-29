"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bookmark,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { EUROPE } from "@/lib/events/countries";

type Plan = {
  status: string;
  notes: string;
  contactsMet: number;
  followUpAt: string | null;
  followUpDone: boolean;
};
type Event = {
  id: string;
  title: string;
  url: string;
  description: string;
  city: string;
  country: string;
  format: string;
  kind: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  timezone: string | null;
  cost: string;
  free: boolean;
  eligibility: string;
  status: string;
  score: number;
  topics: string[];
  reasons: string[];
  lastSeenAt: string;
  plan: Plan | null;
  listings: { source: { name: string; url: string } }[];
};
type Source = {
  id: string;
  name: string;
  url: string;
  kind: string;
  scope: string;
  enabled: boolean;
  intervalMinutes: number;
  lastSuccessAt: string | null;
  lastError: string | null;
  nextRunAt: string;
  runs: {
    status: string;
    fetched: number;
    matched: number;
    added: number;
    message: string | null;
  }[];
  _count: { listings: number };
};
type Data = {
  events: Event[];
  total: number;
  page: number;
  sources: Source[];
  countries: { code: string; name: string }[];
  stats: {
    upcoming: number;
    shortlisted: number;
    attended: number;
    contacts: number;
    due: number;
  };
};
const topics = [
  "AI & agents",
  "Web engineering",
  "Backend & payments",
  "Cloud & DevOps",
  "Open source",
  "Tech community",
];
const date = (s: string, tz = "Europe/Berlin") =>
  new Date(s).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: tz,
  });
function schedule(e: Event) {
  const timezone = e.allDay ? "UTC" : e.timezone || "Europe/Berlin";
  const end = new Date(
    new Date(e.endsAt).valueOf() - (e.allDay ? 86400000 : 0),
  ).toISOString();
  const same = date(e.startsAt, timezone) === date(end, timezone);
  return `${date(e.startsAt, timezone)}${same ? "" : ` – ${date(end, timezone)}`}${e.allDay ? " · Times not published" : ` · ${new Date(e.startsAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: timezone })} ${timezone}`}`;
}
async function mutate(url: string, body: unknown, method = "PATCH") {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
export default function Events() {
  const [tab, setTab] = useState("discover"),
    [planFilter, setPlanFilter] = useState(""),
    [query, setQuery] = useState(""),
    [country, setCountry] = useState(""),
    [kind, setKind] = useState(""),
    [topic, setTopic] = useState(""),
    [days, setDays] = useState("365"),
    [free, setFree] = useState(false),
    [sort, setSort] = useState("match"),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [selected, setSelected] = useState<Event | null>(null),
    [manual, setManual] = useState(false),
    [message, setMessage] = useState("");
  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      const p = new URLSearchParams({
        q: query,
        country,
        kind,
        topic,
        days: tab === "saved" ? "" : days,
        free: String(free),
        sort,
        page: String(page),
        saved: String(tab === "saved"),
        plan: planFilter,
      });
      fetch(`/api/events?${p}`, { signal: controller.signal })
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
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    tab,
    query,
    country,
    kind,
    topic,
    days,
    free,
    sort,
    page,
    revision,
    planFilter,
  ]);
  useEffect(() => {
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(""), 5000);
      return () => clearTimeout(t);
    }
  }, [message]);
  function switchTab(next: string) {
    setTab(next);
    setPlanFilter("");
    setPage(1);
    setQuery("");
    setCountry("");
    setKind("");
    setTopic("");
    setFree(false);
  }
  function change(set: (s: string) => void, value: string) {
    set(value);
    setPage(1);
  }
  async function save(e: Event) {
    try {
      await mutate(`/api/events/${e.id}`, { status: "saved" });
      refresh();
      setMessage("Added to your event shortlist.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="events-workspace">
      <div className="events-stats">
        {[
          [
            "Upcoming matches",
            data?.stats.upcoming,
            "Across Europe",
            CalendarDays,
          ],
          [
            "On your shortlist",
            data?.stats.shortlisted,
            "Saved or registered",
            Bookmark,
          ],
          ["Events attended", data?.stats.attended, "Recorded by you", Check],
          [
            "People met",
            data?.stats.contacts,
            `${data?.stats.due ?? 0} follow-ups due`,
            Users,
          ],
        ].map(([label, value, note, Icon]) => {
          const I = Icon as typeof Users;
          return (
            <section className="card event-stat" key={String(label)}>
              <div>
                <span>{String(label)}</span>
                <I size={17} />
              </div>
              <strong>{value === undefined ? "…" : String(value)}</strong>
              <small>{String(note)}</small>
            </section>
          );
        })}
      </div>
      <section className="event-intro">
        <div className="event-intro-icon">
          <Users size={25} />
        </div>
        <div>
          <h2>Your next opportunity could start with a conversation.</h2>
          <p>
            AI and agents, web engineering, payments, and developer tools.
            In-person events across Europe, with Germany preferred in match
            scoring.
          </p>
        </div>
        <button className="secondary" onClick={() => setManual(true)}>
          <Plus size={15} />
          Add an event
        </button>
      </section>
      <div className="events-tabs" role="tablist" aria-label="Event views">
        {[
          ["discover", "Explore events"],
          ["saved", "My shortlist"],
          ["sources", "Event sources"],
        ].map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => switchTab(key)}
          >
            {label}
            {key === "saved" && !!data?.stats.shortlisted && (
              <span>{data.stats.shortlisted}</span>
            )}
          </button>
        ))}
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button onClick={refresh}>Retry</button>
        </div>
      )}
      {message && (
        <p className="event-notice" role="status">
          <Check size={16} />
          {message}
        </p>
      )}
      {tab !== "sources" && (
        <>
          <div className="event-filters">
            <label className="event-search">
              <Search size={17} />
              <input
                aria-label="Search events"
                placeholder="Event name, city, or keyword"
                value={query}
                onChange={(e) => change(setQuery, e.target.value)}
              />
            </label>
            <select
              aria-label="Event country"
              value={country}
              onChange={(e) => change(setCountry, e.target.value)}
            >
              <option value="">All Europe</option>
              {data?.countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Event type"
              value={kind}
              onChange={(e) => change(setKind, e.target.value)}
            >
              <option value="">Every format</option>
              {["hackathon", "conference", "meetup", "workshop"].map((k) => (
                <option key={k} value={k}>
                  {k[0].toUpperCase() + k.slice(1)}
                </option>
              ))}
            </select>
            <select
              aria-label="Event topic"
              value={topic}
              onChange={(e) => change(setTopic, e.target.value)}
            >
              <option value="">All your interests</option>
              {topics.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
            {tab === "saved" && (
              <select
                aria-label="Attendance filter"
                value={planFilter}
                onChange={(e) => change(setPlanFilter, e.target.value)}
              >
                <option value="">All saved events</option>
                <option value="saved">Shortlisted</option>
                <option value="registered">Registered</option>
                <option value="attended">Attended</option>
                <option value="due">Follow-ups due</option>
                <option value="dismissed">Dismissed</option>
              </select>
            )}
            {tab !== "saved" && (
              <select
                aria-label="Event dates"
                value={days}
                onChange={(e) => change(setDays, e.target.value)}
              >
                <option value="7">Next 7 days</option>
                <option value="30">Next 30 days</option>
                <option value="90">Next 3 months</option>
                <option value="365">Next 12 months</option>
              </select>
            )}
          </div>
          <div className="events-list-heading">
            <span>
              {loading
                ? "Updating…"
                : `${data?.total ?? 0} ${tab === "saved" ? "saved events" : "matching events"}`}
              <small> · Published prices; travel extra</small>
            </span>
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={free}
                  onChange={(e) => {
                    setFree(e.target.checked);
                    setPage(1);
                  }}
                />{" "}
                Free entry only
              </label>
              <select
                aria-label="Sort events"
                value={sort}
                onChange={(e) => change(setSort, e.target.value)}
              >
                <option value="soon">Soonest first</option>
                <option value="match">Best match first</option>
              </select>
            </div>
          </div>
          <div className="event-grid" aria-busy={loading}>
            {data?.events.map((e) => (
              <article className="card event-card" key={e.id}>
                <div className="event-card-top">
                  <span className={`event-kind ${e.kind}`}>
                    {e.kind === "hackathon" ? "⌘ " : ""}
                    {e.kind}
                  </span>
                  <span className="event-score">{e.score} match</span>
                </div>
                <button className="event-title" onClick={() => setSelected(e)}>
                  {e.title}
                </button>
                <div className="event-meta">
                  <span>
                    <CalendarDays size={15} />
                    {schedule(e)}
                  </span>
                  <span>
                    <MapPin size={15} />
                    {e.city}, {EUROPE[e.country] ?? e.country}
                    {e.format === "hybrid" ? " · Hybrid" : ""}
                  </span>
                </div>
                <div className="event-topics">
                  {e.topics.slice(0, 3).map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                <p className="event-reason">
                  {e.reasons[0] ?? "Engineering community"}
                  {e.country === "DE" ? " · Germany priority" : ""}
                </p>
                {/student/i.test(e.eligibility) && (
                  <p className="event-caution">
                    Student eligibility needs review
                  </p>
                )}
                {e.status !== "listed" && (
                  <p className="event-caution">{e.status}</p>
                )}
                {e.plan?.followUpAt && !e.plan.followUpDone && (
                  <p className="event-caution">
                    Follow up: {date(e.plan.followUpAt, "UTC")}
                  </p>
                )}
                <div className="event-card-bottom">
                  <span className={e.free ? "event-free" : ""}>{e.cost}</span>
                  <button
                    className="secondary"
                    onClick={() => (e.plan ? setSelected(e) : save(e))}
                  >
                    <Bookmark size={14} />
                    {e.plan
                      ? e.plan.status[0].toUpperCase() + e.plan.status.slice(1)
                      : "Shortlist"}
                  </button>
                </div>
                <div className="event-source-line">
                  {[...new Set(e.listings.map((l) => l.source.name))].join(
                    " · ",
                  )}
                </div>
              </article>
            ))}
          </div>
          {!loading && data?.total === 0 && (
            <div className="card event-empty">
              <CalendarDays size={32} />
              <h3>
                {tab === "saved"
                  ? "Make room for a few good conversations."
                  : "No events match these filters yet."}
              </h3>
              <p>
                {tab === "saved"
                  ? "Shortlist events to plan attendance and keep networking notes."
                  : "Try another topic or country. Sources refresh independently on their schedules."}
              </p>
              <button
                className="secondary"
                onClick={() => switchTab("discover")}
              >
                Explore events
              </button>
            </div>
          )}
          {!!data && data.total > 24 && (
            <div className="event-pagination">
              <button
                className="secondary"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <span>
                Page {page} of {Math.ceil(data.total / 24)}
              </span>
              <button
                className="secondary"
                disabled={page * 24 >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          )}
          <p className="events-footnote">
            Dates and prices come from source listings. Open the organizer page
            to confirm the venue, participation requirements and availability
            before booking travel.
          </p>
        </>
      )}
      {tab === "sources" && data && (
        <EventSources
          sources={data.sources}
          refresh={refresh}
          report={setError}
        />
      )}
      {selected && (
        <EventDetail
          event={selected}
          close={() => setSelected(null)}
          saved={() => {
            refresh();
            setMessage("Event plan saved.");
          }}
        />
      )}
      {manual && (
        <ManualEvent
          close={() => setManual(false)}
          saved={() => {
            setManual(false);
            switchTab("saved");
            refresh();
            setMessage("Event added to your shortlist.");
          }}
        />
      )}
    </div>
  );
}
function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const dialog = ref.current;
    dialog?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="event-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close();
        }
      }}
    >
      <div className="event-dialog-heading">
        <span>{title}</span>
        <button
          className="icon-button"
          aria-label="Close event dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function EventDetail({
  event: e,
  close,
  saved,
}: {
  event: Event;
  close: () => void;
  saved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false);
  return (
    <Dialog title="Your event plan" close={close}>
      <div className="event-detail">
        <span className="event-kind">{e.kind}</span>
        <h2>{e.title}</h2>
        <p className="muted">{schedule(e)}</p>
        <p>
          <MapPin size={15} /> {e.city}, {EUROPE[e.country]} · {e.cost}
        </p>
        <div className="event-detail-actions">
          <a className="primary" href={e.url} target="_blank" rel="noreferrer">
            Organizer & registration
            <ArrowUpRight size={16} />
          </a>
          <a className="secondary" href={`/api/events/${e.id}/calendar`}>
            <CalendarDays size={16} />
            Calendar file
          </a>
        </div>
        <p className="event-disclosure">
          Opening the organizer page or downloading a calendar file does not
          register you.
        </p>
        <h3>Why it fits</h3>
        <ul>
          {e.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        {e.description && <p>{e.description}</p>}
        <p className="event-caution">{e.eligibility}</p>
        <p className="muted">
          Last seen {date(e.lastSeenAt)}.{" "}
          {e.status === "listed"
            ? "Attendance details need organizer confirmation."
            : `Source status: ${e.status}.`}
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            setSuccess(false);
            const f = new FormData(event.currentTarget);
            try {
              await mutate(`/api/events/${e.id}`, {
                status: f.get("status"),
                notes: f.get("notes"),
                contactsMet: Number(f.get("contactsMet")),
                followUpAt: f.get("followUpAt") || null,
                followUpDone: f.has("followUpDone"),
              });
              saved();
              setSuccess(true);
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h3>Attendance & networking</h3>
          <div className="field-pair">
            <label className="field">
              Your status
              <select name="status" defaultValue={e.plan?.status ?? "saved"}>
                <option value="saved">Shortlisted</option>
                <option value="registered">Registered (confirmed by me)</option>
                <option value="attended">Attended</option>
                <option value="dismissed">Dismissed</option>
              </select>
            </label>
            <label className="field">
              People met
              <input
                name="contactsMet"
                type="number"
                min="0"
                max="10000"
                defaultValue={e.plan?.contactsMet ?? 0}
              />
            </label>
          </div>
          <label className="field">
            Notes, people to meet & conversation ideas
            <textarea
              name="notes"
              rows={4}
              maxLength={10000}
              defaultValue={e.plan?.notes ?? ""}
              placeholder="Who would you like to meet? What could you build together?"
            />
          </label>
          <div className="field-pair">
            <label className="field">
              Follow-up date
              <input
                name="followUpAt"
                type="date"
                defaultValue={e.plan?.followUpAt?.slice(0, 10) ?? ""}
              />
            </label>
            <label className="check-field">
              <input
                name="followUpDone"
                type="checkbox"
                defaultChecked={e.plan?.followUpDone ?? false}
              />
              Follow-up completed
            </label>
          </div>
          {error && (
            <p className="danger" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="event-notice" role="status">
              Saved. Your networking stats have been updated.
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save event plan"}
          </button>
        </form>
        <p className="events-footnote">
          Sources:{" "}
          {e.listings.map((l, i) => (
            <a
              key={i}
              href={l.source.url || undefined}
              target="_blank"
              rel="noreferrer"
            >
              {i > 0 ? " · " : ""}
              {l.source.name}
            </a>
          ))}
        </p>
      </div>
    </Dialog>
  );
}
function EventSources({
  sources,
  refresh,
  report,
}: {
  sources: Source[];
  refresh: () => void;
  report: (s: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  async function update(id: string, body: unknown) {
    setBusy(id);
    try {
      await mutate("/api/events/sources", { id, ...(body as object) });
      refresh();
    } catch (e) {
      report((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="events-sources">
      <div className="card event-coverage">
        <Globe2 size={24} />
        <div>
          <h2>Broad discovery, transparent coverage.</h2>
          <p>
            Conference indexes refresh daily. European hackathons and eight Luma
            city pages refresh every 6 hours; MLH every 12 hours. Luma public
            pages expose a limited selection. A source failure preserves
            existing events.
          </p>
          <p>
            Automatic updates run while your local worker is running. Every row
            shows its last result and next scheduled check.
          </p>
        </div>
      </div>
      <div className="event-source-grid">
        {sources.map((s) => (
          <section className="card event-source-card" key={s.id}>
            <div className="event-source-heading">
              <h3>{s.name}</h3>
              <span
                className={`event-source-state ${s.lastError ? "failed" : ""}`}
              >
                {s.lastError
                  ? "Needs attention"
                  : !s.enabled
                    ? "Paused"
                    : s.runs[0]?.status === "partial"
                      ? "Limited coverage"
                      : s.lastSuccessAt
                        ? "Connected"
                        : "Awaiting first fetch"}
              </span>
            </div>
            <p>{s.scope}</p>
            <p className="muted">
              {s._count.listings} matched listings stored · Last success:{" "}
              {s.lastSuccessAt
                ? new Date(s.lastSuccessAt).toLocaleString("en-GB")
                : "Never"}
            </p>
            {s.lastError && <p className="danger">{s.lastError}</p>}
            {s.runs[0]?.message && (
              <p className="event-source-note">{s.runs[0].message}</p>
            )}
            <small>
              {s.runs[0]
                ? `Last run: ${s.runs[0].fetched} read, ${s.runs[0].matched} matched, ${s.runs[0].added} added.`
                : "No runs yet."}
            </small>
            {s.kind !== "manual" && (
              <>
                <div className="event-source-controls">
                  <label className="check-field">
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      disabled={busy === s.id}
                      onChange={(e) =>
                        update(s.id, { enabled: e.target.checked })
                      }
                    />
                    Enabled
                  </label>
                  <select
                    aria-label={`Refresh interval for ${s.name}`}
                    value={s.intervalMinutes}
                    disabled={busy === s.id}
                    onChange={(e) =>
                      update(s.id, { intervalMinutes: Number(e.target.value) })
                    }
                  >
                    {[60, 360, 720, 1440, 10080].map((n) => (
                      <option value={n} key={n}>
                        {n === 10080 ? "Weekly" : `Every ${n / 60}h`}
                      </option>
                    ))}
                  </select>
                  <button
                    className="secondary"
                    disabled={!s.enabled || busy === s.id}
                    onClick={() => update(s.id, { refresh: true })}
                  >
                    <RefreshCw size={14} />
                    Refresh
                  </button>
                </div>
                <small>
                  {s.enabled
                    ? `Next check: ${new Date(s.nextRunAt).toLocaleString("en-GB")}`
                    : "Refresh paused"}
                </small>
              </>
            )}
          </section>
        ))}
      </div>
      <section className="card event-coverage-notes">
        <h3>Other platforms</h3>
        <p>
          Save any European event using “Add an event”. These platforms are
          available for manual discovery; they are not connected to an automatic
          feed:
        </p>
        <ul>
          <li>
            <a href="https://www.meetup.com/" target="_blank" rel="noreferrer">
              Meetup
            </a>
            : broad API access requires Meetup Pro and an approved OAuth client.
          </li>
          <li>
            <a
              href="https://www.eventbrite.com/"
              target="_blank"
              rel="noreferrer"
            >
              Eventbrite
            </a>
            : the public event-search API was discontinued; access is scoped to
            authorized organizers or approved partners.
          </li>
          <li>
            <a
              href="https://devpost.com/hackathons"
              target="_blank"
              rel="noreferrer"
            >
              Devpost
            </a>
            ,{" "}
            <a
              href="https://devfolio.co/hackathons"
              target="_blank"
              rel="noreferrer"
            >
              Devfolio
            </a>
            ,{" "}
            <a
              href="https://dorahacks.io/hackathon"
              target="_blank"
              rel="noreferrer"
            >
              DoraHacks
            </a>
            ,{" "}
            <a
              href="https://ethglobal.com/events"
              target="_blank"
              rel="noreferrer"
            >
              ETHGlobal
            </a>
            ,{" "}
            <a href="https://foss.events" target="_blank" rel="noreferrer">
              FOSS.events
            </a>{" "}
            and{" "}
            <a href="https://sessionize.com" target="_blank" rel="noreferrer">
              Sessionize
            </a>
            : additional discovery sources; direct adapters are not yet
            implemented.
          </li>
        </ul>
      </section>
    </div>
  );
}
function ManualEvent({
  close,
  saved,
}: {
  close: () => void;
  saved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Dialog title="Add an event from any platform" close={close}>
      <form
        className="event-detail"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const fields = Object.fromEntries(new FormData(e.currentTarget));
          try {
            await mutate("/api/events", fields, "POST");
            saved();
          } catch (error) {
            setError((error as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          Copy the organizer’s published details. Dates are stored as all-day
          events until an exact schedule is available.
        </p>
        <label className="field">
          Event name
          <input name="title" required minLength={3} maxLength={250} />
        </label>
        <label className="field">
          Organizer or listing URL
          <input name="url" type="url" required placeholder="https://…" />
        </label>
        <div className="field-pair">
          <label className="field">
            City
            <input name="city" required />
          </label>
          <label className="field">
            Country
            <select name="country" defaultValue="DE">
              {Object.entries(EUROPE)
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <div className="field-pair">
          <label className="field">
            Start date
            <input name="startsAt" type="date" required />
          </label>
          <label className="field">
            Last day (inclusive)
            <input name="endsAt" type="date" required />
          </label>
        </div>
        <div className="field-pair">
          <label className="field">
            Type
            <select name="kind">
              <option value="meetup">Meetup</option>
              <option value="hackathon">Hackathon</option>
              <option value="conference">Conference</option>
              <option value="workshop">Workshop</option>
            </select>
          </label>
          <label className="field">
            Published price
            <input
              name="cost"
              defaultValue="Price not published"
              maxLength={100}
            />
          </label>
        </div>
        <label className="field">
          Description
          <textarea name="description" rows={3} maxLength={10000} />
        </label>
        {error && (
          <p className="danger" role="alert">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save to shortlist"}
        </button>
      </form>
    </Dialog>
  );
}
