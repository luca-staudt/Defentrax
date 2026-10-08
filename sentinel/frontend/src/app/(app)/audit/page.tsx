"use client";

import { FormEvent, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch } from "@/lib/api/client";
import { useQuery } from "@/lib/panel/use-query";
import type { AuditLog } from "@/lib/types";

export default function AuditLogsPage() {
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [user, setUser] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const limit = 30;

  const auditKey = `audit?q=${q}&action=${action}&user=${user}&since=${since}&until=${until}&offset=${offset}`;
  const auditQuery = useQuery(auditKey, () => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (q.trim()) params.set("q", q.trim());
    if (action.trim()) params.set("action", action.trim());
    if (user.trim()) params.set("user", user.trim());
    if (since) {
      const d = new Date(since);
      if (!Number.isNaN(d.getTime())) params.set("since", d.toISOString());
    }
    if (until) {
      const d = new Date(until);
      if (!Number.isNaN(d.getTime())) params.set("until", d.toISOString());
    }
    return apiFetch<{ audit_logs: AuditLog[]; total: number }>(`/audit-logs?${params}`);
  });
  const rows = auditQuery.data?.audit_logs || [];
  const total = auditQuery.data?.total || 0;
  const loading = auditQuery.loading;
  const error = auditQuery.error;
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null;

  return (
    <>
      <PageHeader title="Audit" subtitle="Every privileged change, with the person who made it." />

      <form
        className="card"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setOffset(0);
          void auditQuery.reload();
        }}
      >
        <div className="card-body">
          <div className="row g-2">
            <div className="col-md-3">
              <input className="form-control" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search" />
            </div>
            <div className="col-md-2">
              <input className="form-control" value={action} onChange={(event) => setAction(event.target.value)} placeholder="Action" />
            </div>
            <div className="col-md-2">
              <input className="form-control" value={user} onChange={(event) => setUser(event.target.value)} placeholder="Actor email" />
            </div>
            <div className="col-md-2">
              <input className="form-control" type="datetime-local" value={since} onChange={(event) => setSince(event.target.value)} aria-label="Since" />
            </div>
            <div className="col-md-2">
              <input className="form-control" type="datetime-local" value={until} onChange={(event) => setUntil(event.target.value)} aria-label="Until" />
            </div>
            <div className="col-md-1">
              <button type="submit" className="btn btn-primary w-100">
                Go
              </button>
            </div>
          </div>
        </div>
      </form>

      {loading ? <LoadingBlock /> : null}
      {error ? <EmptyState title="Cannot load the audit log" description={error} /> : null}
      {!loading && !error && rows.length === 0 ? <EmptyState title="No entries" description="Nothing matches these filters." /> : null}

      {rows.length > 0 ? (
        <div className="row">
          <div className="col-xl-7">
            <div className="dx-log">
              {rows.map((row) => (
                <button key={row.id} type="button" className={selected?.id === row.id ? "is-on" : ""} onClick={() => setSelectedId(row.id)}>
                  <span className="d-flex justify-content-between gap-2">
                    <code>{row.action}</code>
                    <span className="text-muted fs-12">{row.created_at}</span>
                  </span>
                  <span className="d-block text-muted fs-12 mt-1">
                    {row.actor_email || row.actor_type} · {row.entity_type}
                  </span>
                </button>
              ))}
            </div>
            <div className="d-flex justify-content-between align-items-center mt-3">
              <button type="button" className="btn btn-light" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - limit))}>
                Previous
              </button>
              <span className="text-muted">{total === 0 ? "0" : `${offset + 1}–${Math.min(offset + limit, total)} of ${total}`}</span>
              <button type="button" className="btn btn-light" disabled={offset + limit >= total || loading} onClick={() => setOffset(offset + limit)}>
                Next
              </button>
            </div>
          </div>
          <div className="col-xl-5">
            {selected ? (
              <div className="card dx-detail">
                <div className="card-body">
                  <h4 className="mb-3">{selected.action}</h4>
                  <dl className="row">
                    <dt className="col-4 text-muted">When</dt>
                    <dd className="col-8">{selected.created_at}</dd>
                    <dt className="col-4 text-muted">Actor</dt>
                    <dd className="col-8">
                      {selected.actor_email || "—"} <span className="text-muted">({selected.actor_type})</span>
                    </dd>
                    <dt className="col-4 text-muted">Entity</dt>
                    <dd className="col-8 text-break">
                      {selected.entity_type}
                      {selected.entity_id ? <span className="d-block text-muted fs-12">{selected.entity_id}</span> : null}
                    </dd>
                    <dt className="col-4 text-muted">IP</dt>
                    <dd className="col-8">{selected.ip_address || "—"}</dd>
                    <dt className="col-4 text-muted">Agent</dt>
                    <dd className="col-8 text-break">{selected.user_agent || "—"}</dd>
                  </dl>
                  <pre className="bg-light-subtle border rounded p-3 mb-0">{JSON.stringify(selected.metadata ?? {}, null, 2)}</pre>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
