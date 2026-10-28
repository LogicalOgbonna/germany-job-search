"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
export default function ManualJob({
  onSaved,
}: {
  onSaved: (id: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="manual-job">
      <button className="secondary" onClick={() => setOpen(!open)}>
        <Plus size={15} />
        Save a job from another board
      </button>
      {open && (
        <section className="card manual-job-form">
          <div className="section-heading">
            <div>
              <h2>Bring an opportunity into your workspace</h2>
              <p>
                Paste the employer’s details. Saving a link does not verify that
                the role is still open.
              </p>
            </div>
            <button
              className="icon-button"
              aria-label="Close save job form"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const fields = new FormData(e.currentTarget);
              const body = Object.fromEntries(fields.entries());
              try {
                const r = await fetch("/api/jobs/new", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ...body,
                    remote: fields.has("remote"),
                  }),
                });
                const data = await r.json();
                if (!r.ok) throw new Error(data.error);
                setOpen(false);
                onSaved(data.id);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="field-pair">
              <label className="field">
                Job title
                <input name="title" required minLength={2} maxLength={250} />
              </label>
              <label className="field">
                Company
                <input name="company" required maxLength={150} />
              </label>
            </div>
            <div className="field-pair">
              <label className="field">
                Application URL
                <input
                  name="applyUrl"
                  type="url"
                  required
                  placeholder="https://…"
                />
              </label>
              <label className="field">
                Location
                <input
                  name="location"
                  required
                  maxLength={500}
                  placeholder="e.g. Berlin, Germany"
                />
              </label>
            </div>
            <label className="check-field">
              <input name="remote" type="checkbox" />
              The listing describes this role as remote
            </label>
            <label className="field">
              Job description
              <textarea
                name="description"
                required
                minLength={20}
                maxLength={100000}
                rows={6}
              />
            </label>
            {error && (
              <p className="danger" role="alert">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? "Saving…" : "Save opportunity"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
