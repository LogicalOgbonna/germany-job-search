"use client";
import { useEffect, useRef, useState } from "react";
import { referralStatuses, type Drafts } from "@/lib/referrals/domain";
type Contact = {
  id: string;
  name: string;
  title: string;
  email: string;
  linkedin: string;
  sourceUrl: string;
  sourceKind: string;
  sourceNote: string;
  emailStatus: string;
  employmentReviewed: boolean;
  status: string;
  notes: string;
  followUpAt: string | null;
  contactedAt: string | null;
  createdAt: string;
  drafts: Drafts;
  elsewhere: { status: string; job: { title: string; company: string } }[];
};
type Data = {
  contacts: Contact[];
  search: { domain: string; lastRunAt: string | null; report: string } | null;
};
async function api(url: string, method = "GET", body?: unknown) {
  const r = await fetch(url, {
    method,
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}
export default function Referrals({
  jobId,
  company,
  title,
}: {
  jobId: string;
  company: string;
  title: string;
}) {
  const [data, setData] = useState<Data | null>(null),
    [domain, setDomain] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false),
    [filter, setFilter] = useState("all");
  const domainEdited = useRef(false);
  const load = async () => {
    const d: Data = await api(`/api/jobs/${jobId}/referrals`);
    setData(d);
    return d;
  };
  useEffect(() => {
    let active = true;
    api(`/api/jobs/${jobId}/referrals`)
      .then((d: Data) => {
        if (active) {
          setData(d);
          if (!domainEdited.current) setDomain(d.search?.domain ?? "");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [jobId]);
  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };
  const contacts = data?.contacts ?? [];
  const due = (c: Contact) =>
    c.followUpAt &&
    new Date(c.followUpAt) <= new Date() &&
    !["declined", "do_not_contact", "referred"].includes(c.status);
  const query = `site:linkedin.com/in/ "${company.replaceAll('"', "")}" ("engineer" OR "engineering manager" OR "recruiter")`;
  return (
    <section className="referral-panel">
      <div>
        <h3>Find a way into the team</h3>
        <p className="muted">
          Engineers and engineering managers first, then recruiters. Every draft
          uses your verified experience and this specific role.
        </p>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <p role="status" className="referral-notice">
          {notice}
        </p>
      )}
      <div className="referral-stats">
        <span>
          <strong>{contacts.length}</strong> contacts
        </span>
        <span>
          <strong>{contacts.filter((c) => c.contactedAt).length}</strong>{" "}
          approached
        </span>
        <span>
          <strong>
            {contacts.filter((c) => c.status === "referred").length}
          </strong>{" "}
          referred
        </span>
        <span>
          <strong>{contacts.filter(due).length}</strong> follow-ups due
        </span>
      </div>
      <div className="card referral-box">
        <label className="field">
          Confirmed employer website
          <input
            aria-label="Employer website"
            value={domain}
            onChange={(e) => {
              domainEdited.current = true;
              setDomain(e.target.value);
            }}
            placeholder="company.com"
          />
        </label>
        <p className="muted">
          Use {company}'s own domain. Discovery checks the job description and
          up to four public company pages for published work emails and LinkedIn
          profile links. Names and current employment still need your review.
        </p>
        <div className="referral-actions">
          <button
            className="primary"
            disabled={busy || !domain.trim()}
            onClick={() =>
              act(
                () =>
                  api(`/api/jobs/${jobId}/referrals`, "POST", {
                    action: "discover",
                    domain,
                  }),
                "Public-source scan finished. Check the source report and review any contacts found.",
              )
            }
          >
            {busy ? "Working…" : "Discover public contacts"}
          </button>
          <a
            className="secondary"
            target="_blank"
            rel="noreferrer"
            href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(company + " engineering")}`}
          >
            Search LinkedIn
          </a>
          <a
            className="secondary"
            target="_blank"
            rel="noreferrer"
            href={`https://www.google.com/search?q=${encodeURIComponent(query)}`}
          >
            Search public profiles
          </a>
          <button className="secondary" onClick={() => setAdding(!adding)}>
            Add a contact
          </button>
        </div>
        <p className="muted">
          LinkedIn search opens in your browser. Jobdesk does not scrape
          signed-in profiles or guess email addresses. No paid provider is
          required.
        </p>
        {data?.search?.lastRunAt && (
          <details>
            <summary>
              Source report · {new Date(data.search.lastRunAt).toLocaleString()}
            </summary>
            <p className="referral-source">{data.search.report}</p>
          </details>
        )}
      </div>
      {adding && (
        <form
          className="card referral-box"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fields = Object.fromEntries(new FormData(form));
            void act(async () => {
              await api(`/api/jobs/${jobId}/referrals`, "POST", {
                action: "add",
                domain,
                contact: fields,
              });
              setAdding(false);
            }, "Contact saved. Review the source and tailor the drafts before sending.");
          }}
        >
          <h4>Add a professional contact</h4>
          <div className="field-pair">
            <label className="field">
              Name
              <input name="name" required maxLength={160} />
            </label>
            <label className="field">
              Job title
              <input
                name="title"
                maxLength={300}
                placeholder="Engineering Manager"
              />
            </label>
          </div>
          <label className="field">
            LinkedIn profile URL
            <input
              name="linkedin"
              type="url"
              placeholder="https://www.linkedin.com/in/…"
            />
          </label>
          <label className="field">
            Published work email (optional)
            <input
              name="email"
              type="email"
              placeholder="Only an address published or shared for professional contact"
            />
          </label>
          <label className="field">
            Professional source URL
            <input
              name="sourceUrl"
              type="url"
              required
              placeholder="Page showing this person's role or work contact"
            />
          </label>
          <label className="field">
            Source context
            <textarea
              name="sourceNote"
              rows={3}
              placeholder="Paste relevant public profile or team-page context here"
              maxLength={3000}
            />
          </label>
          <button className="primary" disabled={busy}>
            Save contact
          </button>
        </form>
      )}
      <label className="field">
        Show contacts
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All contacts</option>
          <option value="due">Follow-ups due</option>
          {referralStatuses.map((s) => (
            <option key={s} value={s}>
              {s.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      {!data && <p>Loading contacts…</p>}
      {data && !contacts.length && (
        <div className="referral-empty">
          No contacts saved for {title} yet. Discover public contacts or add
          someone from LinkedIn using their profile as the source.
        </div>
      )}
      {contacts
        .filter(
          (c) =>
            filter === "all" ||
            (filter === "due" ? due(c) : c.status === filter),
        )
        .map((c) => (
          <ContactCard
            key={c.id + JSON.stringify(c)}
            contact={c}
            busy={busy}
            save={(body) =>
              act(
                () => api(`/api/referrals/${c.id}`, "PATCH", body),
                "Contact and draft changes saved.",
              )
            }
            remove={() =>
              act(
                () => api(`/api/referrals/${c.id}`, "DELETE"),
                "Contact removed.",
              )
            }
          />
        ))}
    </section>
  );
}
function ContactCard({
  contact: c,
  busy,
  save,
  remove,
}: {
  contact: Contact;
  busy: boolean;
  save: (body: unknown) => Promise<void>;
  remove: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState(c.drafts),
    [kind, setKind] = useState<keyof Drafts>("referral"),
    [name, setName] = useState(c.name),
    [title, setTitle] = useState(c.title),
    [reviewed, setReviewed] = useState(c.employmentReviewed),
    [status, setStatus] = useState(c.status),
    [notes, setNotes] = useState(c.notes),
    [followUp, setFollowUp] = useState(c.followUpAt?.slice(0, 10) ?? ""),
    [copied, setCopied] = useState("");
  const blocked =
    status === "do_not_contact" ||
    c.elsewhere.some((o) => o.status === "do_not_contact");
  return (
    <article className="card referral-box">
      <div className="referral-heading">
        <div>
          <h4>{c.name}</h4>
          <p>{c.title || "Title needs checking"}</p>
        </div>
        <span className="status-label">{c.status.replaceAll("_", " ")}</span>
      </div>
      <p className="muted">
        {c.email ? `${c.email} · ${c.emailStatus}` : "No work email found"}
      </p>
      <div className="referral-actions">
        <a href={c.sourceUrl} target="_blank" rel="noreferrer">
          View source · {c.sourceKind}
        </a>
        {c.linkedin && (
          <a href={c.linkedin} target="_blank" rel="noreferrer">
            LinkedIn profile ↗
          </a>
        )}
      </div>
      {c.sourceNote && (
        <details>
          <summary>
            Source context · collected{" "}
            {new Date(c.createdAt).toLocaleDateString()}
          </summary>
          <p className="referral-source">{c.sourceNote}</p>
        </details>
      )}
      {c.elsewhere.length > 0 && (
        <p className="referral-warning">
          Also saved for:{" "}
          {c.elsewhere
            .map(
              (o) =>
                `${o.job.title} at ${o.job.company} (${o.status.replaceAll("_", " ")})`,
            )
            .join("; ")}
          . Check existing conversations before approaching again.
        </p>
      )}
      {blocked && (
        <p className="referral-warning">
          Do not contact. Message copying and email composing are disabled for
          this record.
        </p>
      )}
      <div className="field-pair">
        <label className="field">
          Contact name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Contact title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
      </div>
      <label className="check-field">
        <input
          type="checkbox"
          checked={reviewed}
          onChange={(e) => setReviewed(e.target.checked)}
        />
        I checked their current employer and relevance to this role.
      </label>
      <label className="field">
        Message template
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as keyof Drafts);
            setCopied("");
          }}
        >
          <option value="connection">LinkedIn connection note</option>
          <option value="referral">Referral request</option>
          <option value="email">Work email</option>
          <option value="followUp">Follow-up after your first message</option>
        </select>
      </label>
      {kind === "email" && (
        <label className="field">
          Email subject
          <input
            value={drafts.subject}
            onChange={(e) => setDrafts({ ...drafts, subject: e.target.value })}
          />
        </label>
      )}
      <label className="field">
        Editable message
        <textarea
          rows={kind === "connection" ? 4 : 11}
          value={drafts[kind]}
          onChange={(e) => setDrafts({ ...drafts, [kind]: e.target.value })}
        />
      </label>
      <p className="muted">
        {drafts[kind].length} characters
        {kind === "connection"
          ? " · Check your LinkedIn account's note limit"
          : ""}
        . Review the greeting and claims before sending. Follow-ups assume you
        already sent an initial note.
      </p>
      <div className="referral-actions">
        <button
          className="secondary"
          disabled={blocked || !reviewed}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(drafts[kind]);
              setCopied("Copied. Nothing was sent or marked contacted.");
            } catch {
              setCopied(
                "Clipboard unavailable. Select the message text to copy it.",
              );
            }
          }}
        >
          Copy message
        </button>
        {c.email && !blocked && reviewed && (
          <a
            className="secondary"
            href={`mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(drafts.subject)}&body=${encodeURIComponent(drafts.email)}`}
          >
            Open email draft
          </a>
        )}
        <span role="status">{copied}</span>
      </div>
      <div className="field-pair">
        <label className="field">
          Outreach status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {referralStatuses.map((s) => (
              <option key={s} value={s}>
                {s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Follow-up date
          <input
            type="date"
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
          />
        </label>
      </div>
      <label className="field">
        Conversation notes
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <p className="muted">
        Record “contacted” only after you send a message yourself. Contact and
        referral counts are separate from job applications.
      </p>
      <div className="referral-actions">
        <button
          className="primary"
          disabled={busy || !name.trim()}
          onClick={() =>
            save({
              name,
              title,
              employmentReviewed: reviewed,
              status,
              notes,
              followUpAt: followUp
                ? new Date(`${followUp}T12:00:00Z`).toISOString()
                : null,
              drafts,
            })
          }
        >
          Save changes
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            if (window.confirm("Remove this contact and its saved drafts?"))
              void remove();
          }}
        >
          Remove contact
        </button>
      </div>
    </article>
  );
}
