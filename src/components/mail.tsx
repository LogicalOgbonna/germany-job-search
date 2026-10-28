"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CalendarPlus,
  Check,
  ExternalLink,
  Mail,
  Undo2,
  Unlink,
} from "lucide-react";
import { mailCategories, type MailCategory } from "@/lib/mail/types";

type ReviewItem = {
  id: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  receivedAt: string;
  category: MailCategory;
  confidence: string;
  evidenceQuote: string | null;
  company: string | null;
  role: string | null;
  reason: string;
  threadId: string;
  // An interview the email offers, read when it was fetched. Dates are ISO strings.
  interview?: OfferedInterview | null;
  candidates: {
    applicationId: string;
    company: string;
    title: string;
    status: string;
  }[];
};
type OfferedInterview = {
  startsAt: string | null;
  endsAt: string | null;
  timezone: string | null;
  meetingUrl: string | null;
  eventUrl: string | null;
  rescheduleUrl: string | null;
  interviewers: { name: string; role?: string }[];
  title: string | null;
  provider: string;
  cancelled: boolean;
};
type ActionItem = {
  applicationId: string;
  jobId: string;
  company: string;
  title: string;
  status: string;
  nextStep: string;
  nextStepDueAt: string | null;
};
type Connection = {
  connected: boolean;
  email: string | null;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  live: boolean;
  pendingProposals: number;
};
export type MailOverview = {
  connection: Connection;
  review: ReviewItem[];
  actions: ActionItem[];
};
export type MailEntry = {
  id: string;
  subject: string;
  fromName: string;
  fromAddress: string;
  receivedAt: string;
  category: MailCategory;
  state: string;
  evidenceQuote: string | null;
  threadId: string;
  undoable: boolean;
  unlinkable: boolean;
};

const labels: Record<MailCategory, string> = {
  confirmation: "Receipt confirmed",
  rejection: "Rejection",
  assessment: "Assessment",
  interview: "Interview",
  offer: "Offer",
  recruiter_question: "Recruiter question",
  notice: "Notice, nothing to do",
  unrelated: "Not about an application",
};
const passive = (category: MailCategory) =>
  category === "notice" || category === "unrelated";
const gmail = (threadId: string) =>
  `https://mail.google.com/mail/u/0/#all/${threadId}`;
const sender = (mail: { fromName: string; fromAddress: string }) =>
  mail.fromName ? `${mail.fromName} <${mail.fromAddress}>` : mail.fromAddress;
const berlinDay = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
const fullDate = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;
function ago(value: string) {
  const mins = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).valueOf()) / 60000),
  );
  return mins < 1
    ? "just now"
    : mins < 60
      ? `${mins}m ago`
      : mins < 1440
        ? `${Math.floor(mins / 60)}h ago`
        : `${Math.floor(mins / 1440)}d ago`;
}
// Whole calendar days in Berlin between today and the deadline.
export function dueText(value: string | null): {
  text: string;
  soon: boolean;
} | null {
  if (!value) return null;
  const days = Math.round(
    (Date.parse(berlinDay(new Date(value))) -
      Date.parse(berlinDay(new Date()))) /
      86400000,
  );
  return {
    text:
      days < 0
        ? `overdue by ${plural(-days, "day")}`
        : days === 0
          ? "due today"
          : days === 1
            ? "due tomorrow"
            : `due in ${days} days`,
    soon: days <= 1,
  };
}
const capital = (text: string) => text[0].toUpperCase() + text.slice(1);
const providers: Record<string, string> = {
  recruitee: "Recruitee",
  calendly: "Calendly",
  "google-calendar": "Google Calendar",
  greenhouse: "Greenhouse",
  ashby: "Ashby",
  lever: "Lever",
  goodtime: "GoodTime",
  ics: "a calendar invitation",
};
// "Thu 22 Oct 2026, 10:15 to 10:45" in `zone`.
function offeredTime(offer: OfferedInterview, zone: string): string {
  const clock = (value: string) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: zone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(value));
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(offer.startsAt!));
  return `${day}, ${clock(offer.startsAt!)}${offer.endsAt ? ` to ${clock(offer.endsAt)}` : ""}`;
}
function validZone(zone: string | null): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

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

// Reloads whenever `revision` changes. Keeps the last answer when a reload fails.
export function useMailOverview(revision: number) {
  const [mail, setMail] = useState<MailOverview | null>(null);
  useEffect(() => {
    let active = true;
    request<MailOverview>("/api/mail")
      .then((data) => {
        if (active) setMail(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [revision]);
  return mail;
}

export function ActionNeeded({
  actions,
  onOpen,
  notify,
}: {
  actions: ActionItem[];
  onOpen: (jobId: string) => void;
  notify: (message: string) => void;
}) {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  if (!actions.length) return null;
  const far = Number.MAX_SAFE_INTEGER;
  const time = (item: ActionItem) =>
    item.nextStepDueAt ? new Date(item.nextStepDueAt).valueOf() : far;
  const sorted = [...actions].sort((a, b) => time(a) - time(b));
  async function done(item: ActionItem) {
    setBusy(item.applicationId);
    setError("");
    try {
      await request("/api/mail", "POST", {
        action: "done",
        applicationId: item.applicationId,
      });
      notify("Next step marked as done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="card mail-card" aria-label="Action needed">
      <div className="section-heading">
        <div>
          <h2>
            Action needed <span className="count-pill">{sorted.length}</span>
          </h2>
          <p>
            Next steps employers asked for by email, soonest deadline first.
          </p>
        </div>
      </div>
      {error && (
        <div className="error-banner mail-error" role="alert">
          {error}
        </div>
      )}
      {sorted.map((item) => {
        const due = dueText(item.nextStepDueAt);
        return (
          <div className="mail-row" key={item.applicationId}>
            <div className="mail-row-main">
              <div className="mail-row-title">
                <h3>{item.company}</h3>
                <span className="status-label">
                  {item.status.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mail-meta">{item.title}</p>
              <p className="mail-step">{item.nextStep}</p>
            </div>
            <div className="mail-row-side">
              <span
                className={`tag ${due?.soon ? "warning" : "subtle"}`}
                title={
                  item.nextStepDueAt ? fullDate(item.nextStepDueAt) : undefined
                }
              >
                {due ? capital(due.text) : "No deadline"}
              </span>
              <button
                className="text-button"
                onClick={() => onOpen(item.jobId)}
                aria-label={`Open the card for ${item.company}`}
              >
                Open card <ArrowUpRight size={13} />
              </button>
              <button
                className="secondary"
                disabled={busy === item.applicationId}
                onClick={() => done(item)}
                aria-label={`Mark the next step for ${item.company} as done`}
              >
                <Check size={14} />
                Done
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function MailReview({
  review,
  notify,
}: {
  review: ReviewItem[];
  notify: (message: string) => void;
}) {
  const [all, setAll] = useState(false);
  if (!review.length) return null;
  const shown = all ? review : review.slice(0, 10);
  return (
    <section className="card mail-card" aria-label="Needs review">
      <div className="section-heading">
        <div>
          <h2>
            Needs review <span className="count-pill">{review.length}</span>
          </h2>
          <p>
            Emails Jobdesk could not file on its own. Confirm the guess, correct
            it, or mark the email as not relevant.
          </p>
        </div>
      </div>
      {shown.map((item) => (
        <ReviewRow key={item.id} item={item} notify={notify} />
      ))}
      {review.length > shown.length && (
        <div className="mail-row">
          <button className="text-button" onClick={() => setAll(true)}>
            Show {review.length - shown.length} more
          </button>
        </div>
      )}
    </section>
  );
}

function ReviewRow({
  item,
  notify,
}: {
  item: ReviewItem;
  notify: (message: string) => void;
}) {
  const [category, setCategory] = useState(item.category),
    [chosen, setChosen] = useState(
      item.candidates.length === 1
        ? item.candidates[0].applicationId
        : item.candidates.length
          ? ""
          : "new",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [added, setAdded] = useState<{ id: string; created: boolean } | null>(null);
  const filed = passive(category);
  // The candidates are matched again on every load, so a remembered choice can disappear.
  const target =
    ["new", "none"].includes(chosen) ||
    item.candidates.some((card) => card.applicationId === chosen)
      ? chosen
      : "";
  async function send(body: object, message: string) {
    setBusy(true);
    setError("");
    try {
      await request(`/api/mail/${item.id}`, "PATCH", body);
      notify(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      setBusy(false);
    }
  }
  // The email stays in review afterwards; it is still to be filed.
  async function addInterview() {
    setBusy(true);
    setError("");
    try {
      const done = await request<{ interviewId: string; created: boolean }>(
        `/api/mail/${item.id}`,
        "PATCH",
        { action: "add-interview", applicationId: target },
      );
      setAdded({ id: done.interviewId, created: done.created });
      notify(done.created ? "Interview added" : "Interview updated");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  const offer = item.interview ?? null;
  const zone = validZone(offer?.timezone ?? null)
    ? offer!.timezone!
    : "Europe/Berlin";
  const card = !filed && target !== "" && target !== "new" && target !== "none";
  return (
    <div className="mail-row">
      <div className="mail-row-main">
        <div className="mail-row-title">
          <h3>{item.subject || "(no subject)"}</h3>
        </div>
        <p className="mail-meta">
          {sender(item)} · {fullDate(item.receivedAt)}
        </p>
        <p className="mail-guess">
          <span className="tag subtle">
            Jobdesk’s guess: {labels[item.category]} · {item.confidence}{" "}
            confidence
          </span>
          {(item.company || item.role) && (
            <span>{[item.company, item.role].filter(Boolean).join(" · ")}</span>
          )}
        </p>
        {item.reason && <p className="mail-meta">Why: {item.reason}</p>}
        {item.evidenceQuote && (
          <blockquote className="mail-quote">{item.evidenceQuote}</blockquote>
        )}
        {offer && (
          <div className="mail-interview">
            <p>
              <strong>
                {offer.cancelled
                  ? "This email cancels an interview"
                  : "This email offers an interview"}
              </strong>
              {offer.title && ` · ${offer.title}`}
              {providers[offer.provider] &&
                ` · read from ${providers[offer.provider]}`}
            </p>
            <p>
              {offer.startsAt
                ? `${offeredTime(offer, zone)} (${zone})`
                : "No time stated"}
              {offer.startsAt && zone !== "Europe/Berlin" && (
                <span className="mail-meta">
                  {" "}
                  · {offeredTime(offer, "Europe/Berlin")} in Berlin
                </span>
              )}
            </p>
            {offer.interviewers.length > 0 && (
              <p className="mail-meta">
                With{" "}
                {offer.interviewers
                  .map((person) =>
                    person.role
                      ? `${person.name} (${person.role})`
                      : person.name,
                  )
                  .join(", ")}
              </p>
            )}
            <div className="mail-controls">
              {offer.meetingUrl && (
                <a
                  className="mail-link"
                  href={offer.meetingUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Meeting link <ExternalLink size={12} />
                </a>
              )}
              {offer.eventUrl && (
                <a
                  className="mail-link"
                  href={offer.eventUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Event <ExternalLink size={12} />
                </a>
              )}
              {offer.rescheduleUrl && (
                <a
                  className="mail-link"
                  href={offer.rescheduleUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Reschedule <ExternalLink size={12} />
                </a>
              )}
              <button
                className="secondary"
                disabled={busy || !card}
                onClick={addInterview}
              >
                <CalendarPlus size={14} />
                Add as interview
              </button>
              {!card && (
                <span className="mail-meta">
                  Choose the application it belongs to first.
                </span>
              )}
            </div>
          </div>
        )}
        {added && (
          <p className="mail-meta mail-added" role="status">
            {added.created ? "Interview added." : "Interview updated."}{" "}
            <a className="mail-link" href={`?view=interview&id=${added.id}`}>
              Open the interview <ArrowUpRight size={12} />
            </a>
          </p>
        )}
        {error && (
          <p className="danger mail-meta" role="alert">
            {error}
          </p>
        )}
        <div className="mail-controls">
          <select
            aria-label="Category"
            value={category}
            disabled={busy}
            onChange={(e) => setCategory(e.target.value as MailCategory)}
          >
            {mailCategories.map((key) => (
              <option key={key} value={key}>
                {labels[key]}
              </option>
            ))}
          </select>
          <select
            aria-label="Application"
            value={filed ? "none" : target}
            disabled={busy || filed}
            onChange={(e) => setChosen(e.target.value)}
          >
            {!filed && target === "" && (
              <option value="" disabled>
                Choose the application
              </option>
            )}
            {item.candidates.map((card) => (
              <option key={card.applicationId} value={card.applicationId}>
                {card.company} · {card.title} (
                {card.status.replaceAll("_", " ")})
              </option>
            ))}
            <option value="new">New card from this email</option>
            <option value="none">No application</option>
          </select>
          <button
            className="primary"
            disabled={busy || (!filed && target === "")}
            onClick={() =>
              send(
                {
                  action: "resolve",
                  category,
                  applicationId: filed || target === "none" ? null : target,
                },
                "Email filed",
              )
            }
          >
            <Check size={14} />
            Confirm
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              send({ action: "ignore" }, "Email marked as not relevant")
            }
          >
            Not relevant
          </button>
          <a
            className="mail-link"
            href={gmail(item.threadId)}
            target="_blank"
            rel="noreferrer"
          >
            Open in Gmail <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  );
}

export function MailConnection({
  connection,
}: {
  connection: Connection | null;
}) {
  if (!connection) return null;
  const { connected, email, lastCheckedAt, lastError, live } = connection;
  const pending = connection.pendingProposals;
  const address = email ?? "your Gmail account";
  return (
    <section className="card mail-card" aria-label="Email updates">
      <div className="source-row mail-connection">
        <span className="company-logo logo-4">
          <Mail size={18} />
        </span>
        <div className="source-name">
          <strong>Email updates · Gmail, read-only</strong>
          {!connected ? (
            <span>
              Not connected. Run <code>npm run mail:connect</code>
            </span>
          ) : pending > 0 ? (
            <span>
              {pending === 1
                ? "1 proposed change is waiting."
                : `${pending} proposed changes are waiting.`}{" "}
              Read <code>.context/mail-backfill-report.md</code>, then run{" "}
              <code>npm run mail:backfill -- --apply</code> (or{" "}
              <code>-- --discard</code> to throw them away).
            </span>
          ) : !live ? (
            <span>
              Connected as {address}. Mail checks are off until you import your
              history: run <code>npm run mail:backfill</code>, read its report,
              then run <code>npm run mail:backfill -- --apply</code>. No card
              changes before that.
            </span>
          ) : (
            <span>
              Connected as {address}. Checked every 10 minutes while Jobdesk is
              running.
            </span>
          )}
          {connected && lastError && (
            <small className="danger">{lastError}</small>
          )}
        </div>
        <div className="source-health">
          <span
            className={`tag ${!connected ? "subtle" : lastError ? "warning" : "positive"}`}
          >
            {!connected
              ? "Not connected"
              : lastError
                ? "Needs attention"
                : "Connected"}
          </span>
          {connected && (
            <small>
              {lastCheckedAt
                ? `Last check ${ago(lastCheckedAt)}`
                : "Not checked yet"}
            </small>
          )}
        </div>
      </div>
    </section>
  );
}

export function MailTimeline({
  mail,
  onChanged,
}: {
  mail: MailEntry[];
  onChanged: (message: string) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  if (!mail.length) return null;
  async function send(
    entry: MailEntry,
    action: "undo" | "unlink",
    message: string,
  ) {
    setBusy(entry.id);
    setError("");
    try {
      await request(`/api/mail/${entry.id}`, "PATCH", { action });
      await onChanged(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="mail-timeline">
      <h3 className="history-heading">Emails</h3>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {mail.map((entry) => (
        <div className="history-event" key={entry.id}>
          <span className="small-dot" />
          <div className="mail-row-main">
            <strong>{labels[entry.category]}</strong>
            <small>{fullDate(entry.receivedAt)}</small>
            <small>
              {entry.state === "applied"
                ? "Changed this card"
                : entry.state === "attached"
                  ? "On file"
                  : entry.state.replace("_", " ")}
            </small>
            <p className="mail-subject">{entry.subject || "(no subject)"}</p>
            <p>{sender(entry)}</p>
            {entry.evidenceQuote && (
              <blockquote className="mail-quote">
                {entry.evidenceQuote}
              </blockquote>
            )}
            <div className="mail-controls">
              <a
                className="mail-link"
                href={gmail(entry.threadId)}
                target="_blank"
                rel="noreferrer"
              >
                Open in Gmail <ExternalLink size={12} />
              </a>
              {entry.undoable && (
                <button
                  className="text-button"
                  disabled={busy === entry.id}
                  onClick={() =>
                    send(
                      entry,
                      "undo",
                      "Change undone. The email is back under Needs review.",
                    )
                  }
                >
                  <Undo2 size={13} />
                  Undo this change
                </button>
              )}
              {entry.unlinkable && (
                <button
                  className="text-button"
                  disabled={busy === entry.id}
                  title="This email belongs to another application. Send it back to Needs review."
                  onClick={() =>
                    send(
                      entry,
                      "unlink",
                      "Email unlinked. It is back under Needs review.",
                    )
                  }
                >
                  <Unlink size={13} />
                  Unlink
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
