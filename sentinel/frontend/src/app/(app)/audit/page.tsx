"use client";

import { FormEvent, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { Modal } from "@/components/ui/modal";
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
  const [selected, setSelected] = useState<AuditLog | null>(null);
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

  return (
    <>
      <PageHeader title="Audit logs" subtitle="Who did what, when, and where — attributed to the acting admin account" />

      <div className="card">
        <div className="card-body">
          <form
            className="row g-2"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              setOffset(0);
              void auditQuery.reload();
            }}
          >
            <div className="col-md-3">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search action / entity / email…" className="form-control" />
            </div>
            <div className="col-md-2">
              <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="Exact action" className="form-control" />
            </div>
            <div className="col-md-2">
              <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Actor email" className="form-control" />
            </div>
            <div className="col-md-2">
              <input type="datetime-local" value={since} onChange={(e) => setSince(e.target.value)} className="form-control" aria-label="Since" />
            </div>
            <div className="col-md-2">
              <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className="form-control" aria-label="Until" />
            </div>
            <div className="col-md-1">
              <button type="submit" className="btn btn-primary w-100">
                Apply
              </button>
            </div>
          </form>
        </div>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <EmptyState title="Cannot load audit logs" description={error} />
      ) : rows.length === 0 ? (
        <EmptyState title="No audit logs" description="No entries match these filters." />
      ) : (
        <div className="card">
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Where</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="text-muted text-nowrap">{row.created_at}</td>
                      <td>
                        <div>{row.actor_email || "—"}</div>
                        <div className="text-muted fs-12">{row.actor_type}</div>
                      </td>
                      <td>
                        <code>{row.action}</code>
                      </td>
                      <td>
                        <div>{row.entity_type}</div>
                        <div className="text-muted fs-12">{row.entity_id || "—"}</div>
                      </td>
                      <td className="text-muted">{row.ip_address || "—"}</td>
                      <td className="text-end">
                        <button type="button" className="btn btn-sm btn-light" onClick={() => setSelected(row)}>
                          Details
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
        <button type="button" disabled={offset === 0 || loading} className="btn btn-light" onClick={() => setOffset(Math.max(0, offset - limit))}>
          Previous
        </button>
        <span className="text-muted">
          {total === 0 ? "0" : `${offset + 1}–${Math.min(offset + limit, total)} of ${total}`}
        </span>
        <button type="button" disabled={offset + limit >= total || loading} className="btn btn-light" onClick={() => setOffset(offset + limit)}>
          Next
        </button>
      </div>

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title="Audit detail" subtitle={selected?.action}>
        {selected ? (
          <dl className="row mb-0">
            <dt className="col-sm-3">When</dt>
            <dd className="col-sm-9">{selected.created_at}</dd>
            <dt className="col-sm-3">Actor</dt>
            <dd className="col-sm-9">
              {selected.actor_email || "—"} ({selected.actor_type})
            </dd>
            <dt className="col-sm-3">Entity</dt>
            <dd className="col-sm-9">
              {selected.entity_type}
              {selected.entity_id ? <span className="d-block text-muted fs-12">{selected.entity_id}</span> : null}
            </dd>
            <dt className="col-sm-3">IP</dt>
            <dd className="col-sm-9">{selected.ip_address || "—"}</dd>
            <dt className="col-sm-3">User agent</dt>
            <dd className="col-sm-9 text-break">{selected.user_agent || "—"}</dd>
            <dt className="col-sm-3">Metadata</dt>
            <dd className="col-sm-9">
              <pre className="bg-light p-3 rounded mb-0">{JSON.stringify(selected.metadata ?? {}, null, 2)}</pre>
            </dd>
          </dl>
        ) : null}
      </Modal>
    </>
  );
}
