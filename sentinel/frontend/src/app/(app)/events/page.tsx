"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { formatAlertTimeShort } from "@/lib/alerts";
import { apiFetch } from "@/lib/api/client";
import { useAuth } from "@/context/auth-context";
import { canSeePage } from "@/lib/pages";
import type { EventRow } from "@/lib/types";

const SEVERITY_FILTERS = ["", "critical", "high", "medium", "low", "info"] as const;

export default function EventsPage() {
  const { user } = useAuth();
  const canServer = canSeePage(user, "server_detail");

  const [events, setEvents] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [severity, setSeverity] = useState("");
  const [source, setSource] = useState("");
  const [sourceDraft, setSourceDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inspect, setInspect] = useState<EventRow | null>(null);
  const [ready, setReady] = useState(false);
  const limit = 40;

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q") || "";
    if (initial) {
      setQ(initial);
      setQDraft(initial);
    }
    setReady(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (q) params.set("q", q);
      if (severity) params.set("severity", severity);
      if (source) params.set("source", source);
      const res = await apiFetch<{ events: EventRow[]; total: number }>(`/events?${params}`);
      setEvents(res.events || []);
      setTotal(res.total || 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [offset, q, severity, source]);

  useEffect(() => {
    if (!ready) return;
    void load();
  }, [load, ready]);

  function applyFilters(e?: FormEvent) {
    e?.preventDefault();
    setOffset(0);
    setQ(qDraft.trim());
    setSource(sourceDraft.trim());
  }

  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + limit, total);

  return (
    <>
      <PageHeader
        title="Events"
        subtitle="Ingested telemetry from agents — search, filter, and inspect rows"
        actions={<span className="badge bg-secondary-subtle text-secondary">{total.toLocaleString()} total</span>}
      />

      <div className="card">
        <div className="card-body">
          <form onSubmit={applyFilters} className="row g-2 align-items-center">
            <div className="col-lg-5">
              <input value={qDraft} onChange={(e) => setQDraft(e.target.value)} placeholder="Search message…" className="form-control" />
            </div>
            <div className="col-lg-3">
              <input
                value={sourceDraft}
                onChange={(e) => setSourceDraft(e.target.value)}
                placeholder="Source (e.g. auth, docker)"
                className="form-control"
              />
            </div>
            <div className="col-lg-2">
              <button type="submit" className="btn btn-primary w-100">
                Apply
              </button>
            </div>
            <div className="col-12 d-flex flex-wrap gap-2">
              {SEVERITY_FILTERS.map((sev) => (
                <button
                  key={sev || "all"}
                  type="button"
                  onClick={() => {
                    setSeverity(sev);
                    setOffset(0);
                  }}
                  className={`btn btn-sm ${severity === sev ? "btn-primary" : "btn-light"}`}
                >
                  {sev ? sev.toUpperCase() : "ALL"}
                </button>
              ))}
            </div>
          </form>
        </div>
      </div>

      {loading ? (
        <LoadingBlock label="Loading events…" />
      ) : error ? (
        <div className="alert alert-danger">{error}</div>
      ) : events.length === 0 ? (
        <EmptyState
          title="No events match"
          description={q || severity || source ? "Try clearing filters or broadening your search." : "Ingest events via enrolled agents, or seed data in development."}
          action={
            q || severity || source ? (
              <button
                type="button"
                className="btn btn-light"
                onClick={() => {
                  setQ("");
                  setQDraft("");
                  setSource("");
                  setSourceDraft("");
                  setSeverity("");
                  setOffset(0);
                }}
              >
                Clear filters
              </button>
            ) : null
          }
        />
      ) : (
        <div className="card">
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Received</th>
                    <th>Severity</th>
                    <th>Source</th>
                    <th>Category</th>
                    <th>Host</th>
                    <th>Server</th>
                    <th>Message</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id}>
                      <td className="text-muted text-nowrap">{formatAlertTimeShort(ev.received_at)}</td>
                      <td>
                        <SeverityBadge severity={ev.severity} />
                      </td>
                      <td>{ev.source || "—"}</td>
                      <td className="text-muted">{ev.category || "—"}</td>
                      <td className="text-muted">{ev.host || "—"}</td>
                      <td>
                        {canServer && ev.server_id ? (
                          <Link href={`/servers/${ev.server_id}`} title={ev.server_id}>
                            {ev.server_id.slice(0, 8)}…
                          </Link>
                        ) : (
                          <span title={ev.server_id}>{ev.server_id ? `${ev.server_id.slice(0, 8)}…` : "—"}</span>
                        )}
                      </td>
                      <td style={{ maxWidth: 360 }}>
                        <span className="d-inline-block text-truncate" style={{ maxWidth: 360 }}>
                          {ev.message}
                        </span>
                      </td>
                      <td className="text-end">
                        <button type="button" className="btn btn-sm btn-light" onClick={() => setInspect(ev)}>
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center">
        <button type="button" disabled={offset === 0 || loading} onClick={() => setOffset((o) => Math.max(0, o - limit))} className="btn btn-light">
          Previous
        </button>
        <span className="text-muted">
          {rangeStart}–{rangeEnd} of {total.toLocaleString()}
        </span>
        <button type="button" disabled={offset + limit >= total || loading} onClick={() => setOffset((o) => o + limit)} className="btn btn-light">
          Next
        </button>
      </div>

      <Modal
        isOpen={!!inspect}
        onClose={() => setInspect(null)}
        title="Event detail"
        subtitle={inspect ? `${inspect.source || "unknown"} · ${inspect.category || "—"}` : undefined}
        footer={
          inspect ? (
            <div className="d-flex justify-content-between w-100">
              <span className="text-muted">Occurred {formatAlertTimeShort(inspect.occurred_at)}</span>
              {canServer && inspect.server_id ? (
                <Link href={`/servers/${inspect.server_id}`} className="btn btn-primary btn-sm">
                  Open server
                </Link>
              ) : null}
            </div>
          ) : null
        }
      >
        {inspect ? (
          <div className="row g-3">
            <Field label="Severity">
              <SeverityBadge severity={inspect.severity} />
            </Field>
            <Field label="Source">{inspect.source || "—"}</Field>
            <Field label="Category">{inspect.category || "—"}</Field>
            <Field label="Host">{inspect.host || "—"}</Field>
            <Field label="Received">{formatAlertTimeShort(inspect.received_at)}</Field>
            <Field label="Occurred">{formatAlertTimeShort(inspect.occurred_at)}</Field>
            <div className="col-12">
              <p className="text-muted mb-1">Message</p>
              <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                {inspect.message}
              </p>
            </div>
            <Field label="Event ID">
              <span className="text-break">{inspect.id}</span>
            </Field>
            <Field label="Server ID">
              <span className="text-break">{inspect.server_id || "—"}</span>
            </Field>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="col-md-4">
      <div className="border rounded p-3 h-100">
        <span className="text-muted text-uppercase fs-12 d-block mb-1">{label}</span>
        {children}
      </div>
    </div>
  );
}
