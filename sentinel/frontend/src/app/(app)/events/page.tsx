"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { PageHeader } from "@/components/ui/page-header";
import { formatAlertTimeShort } from "@/lib/alerts";
import { apiFetch } from "@/lib/api/client";
import { useAuth } from "@/context/auth-context";
import { canSeePage } from "@/lib/pages";
import { useQuery } from "@/lib/panel/use-query";
import type { EventRow } from "@/lib/types";

const SEVERITY_FILTERS = ["", "critical", "high", "medium", "low", "info"] as const;

export default function EventsPage() {
  const { user } = useAuth();
  const canServer = canSeePage(user, "server_detail");

  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [severity, setSeverity] = useState("");
  const [source, setSource] = useState("");
  const [sourceDraft, setSourceDraft] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const eventKey = ready ? `events?q=${q}&severity=${severity}&source=${source}&offset=${offset}` : null;
  const eventsQuery = useQuery(
    eventKey,
    () => {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (q) params.set("q", q);
      if (severity) params.set("severity", severity);
      if (source) params.set("source", source);
      return apiFetch<{ events: EventRow[]; total: number }>(`/events?${params}`);
    },
    { refreshMs: 15000 },
  );
  const events = eventsQuery.data?.events || [];
  const total = eventsQuery.data?.total || 0;
  const loading = !ready || eventsQuery.loading;
  const error = eventsQuery.error;
  const selected = events.find((event) => event.id === selectedId) ?? events[0] ?? null;
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + limit, total);

  function applyFilters(event?: FormEvent) {
    event?.preventDefault();
    setOffset(0);
    setQ(qDraft.trim());
    setSource(sourceDraft.trim());
  }

  return (
    <>
      <PageHeader title="Events" subtitle="Search the telemetry the agents already sent." actions={<span className="text-muted">{total.toLocaleString()} rows</span>} />

      <form className="card" onSubmit={applyFilters}>
        <div className="card-body">
          <div className="row g-2">
            <div className="col-lg-5">
              <input className="form-control" value={qDraft} onChange={(event) => setQDraft(event.target.value)} placeholder="Message" />
            </div>
            <div className="col-lg-3">
              <input className="form-control" value={sourceDraft} onChange={(event) => setSourceDraft(event.target.value)} placeholder="Source" />
            </div>
            <div className="col-lg-2">
              <select
                className="form-select"
                value={severity}
                onChange={(event) => {
                  setSeverity(event.target.value);
                  setOffset(0);
                }}
              >
                {SEVERITY_FILTERS.map((level) => (
                  <option key={level || "all"} value={level}>
                    {level ? level : "All severities"}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-lg-2">
              <button type="submit" className="btn btn-primary w-100">
                Search
              </button>
            </div>
          </div>
        </div>
      </form>

      {loading ? <LoadingBlock label="Loading events…" /> : null}
      {error ? <div className="alert alert-danger">{error}</div> : null}
      {!loading && !error && events.length === 0 ? (
        <EmptyState title="No events" description="Nothing matches this search." />
      ) : null}

      {events.length > 0 ? (
        <div className="row">
          <div className="col-xl-7">
            <div className="dx-log">
              {events.map((event) => (
                <button key={event.id} type="button" className={selected?.id === event.id ? "is-on" : ""} onClick={() => setSelectedId(event.id)}>
                  <span className="d-flex justify-content-between gap-2">
                    <span className="fw-medium text-truncate">{event.message}</span>
                    <SeverityBadge severity={event.severity} />
                  </span>
                  <span className="d-block text-muted fs-12 mt-1">
                    {formatAlertTimeShort(event.received_at)} · {event.source || "unknown"} · {event.host || "—"}
                  </span>
                </button>
              ))}
            </div>
            <div className="d-flex justify-content-between align-items-center mt-3">
              <button type="button" className="btn btn-light" disabled={offset === 0 || loading} onClick={() => setOffset((value) => Math.max(0, value - limit))}>
                Previous
              </button>
              <span className="text-muted">
                {rangeStart}–{rangeEnd} of {total.toLocaleString()}
              </span>
              <button type="button" className="btn btn-light" disabled={offset + limit >= total || loading} onClick={() => setOffset((value) => value + limit)}>
                Next
              </button>
            </div>
          </div>
          <div className="col-xl-5">
            {selected ? (
              <div className="card dx-detail">
                <div className="card-body">
                  <SeverityBadge severity={selected.severity} />
                  <p className="mt-3 mb-3" style={{ whiteSpace: "pre-wrap" }}>
                    {selected.message}
                  </p>
                  <dl className="row mb-0">
                    <dt className="col-4 text-muted">Source</dt>
                    <dd className="col-8">{selected.source || "—"}</dd>
                    <dt className="col-4 text-muted">Category</dt>
                    <dd className="col-8">{selected.category || "—"}</dd>
                    <dt className="col-4 text-muted">Host</dt>
                    <dd className="col-8">{selected.host || "—"}</dd>
                    <dt className="col-4 text-muted">Received</dt>
                    <dd className="col-8">{formatAlertTimeShort(selected.received_at)}</dd>
                    <dt className="col-4 text-muted">Occurred</dt>
                    <dd className="col-8">{formatAlertTimeShort(selected.occurred_at)}</dd>
                    <dt className="col-4 text-muted">Server</dt>
                    <dd className="col-8 text-break">
                      {canServer && selected.server_id ? <Link href={`/servers/${selected.server_id}`}>{selected.server_id}</Link> : selected.server_id || "—"}
                    </dd>
                  </dl>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
