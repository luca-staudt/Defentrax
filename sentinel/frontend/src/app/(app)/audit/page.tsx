"use client";

import { FormEvent, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@/lib/panel/use-query";
import type { AuditLog } from "@/lib/types";

export default function AuditLogsPage() {
  const { t } = useI18n();
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
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  return (
    <>
      <PageHeader title={t("audit.title")} subtitle={t("audit.subtitle")} />

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
              <input className="form-control" value={q} onChange={(event) => setQ(event.target.value)} placeholder={t("audit.search")} />
            </div>
            <div className="col-md-2">
              <input className="form-control" value={action} onChange={(event) => setAction(event.target.value)} placeholder={t("audit.action")} />
            </div>
            <div className="col-md-2">
              <input className="form-control" value={user} onChange={(event) => setUser(event.target.value)} placeholder={t("audit.actor")} />
            </div>
            <div className="col-md-2">
              <input className="form-control" type="datetime-local" value={since} onChange={(event) => setSince(event.target.value)} aria-label={t("audit.since")} />
            </div>
            <div className="col-md-2">
              <input className="form-control" type="datetime-local" value={until} onChange={(event) => setUntil(event.target.value)} aria-label={t("audit.until")} />
            </div>
            <div className="col-md-1">
              <button type="submit" className="btn btn-primary w-100">
                {t("audit.go")}
              </button>
            </div>
          </div>
        </div>
      </form>

      {loading ? <LoadingBlock /> : null}
      {error ? <EmptyState title={t("audit.cannot")} description={error} /> : null}
      {!loading && !error && rows.length === 0 ? <EmptyState title={t("audit.none")} description={t("audit.noneHint")} /> : null}

      {rows.length > 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>{t("audit.action")}</th>
                    <th>{t("audit.actorLabel")}</th>
                    <th>{t("audit.entity")}</th>
                    <th>{t("audit.when")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <code className="fw-medium">{row.action}</code>
                      </td>
                      <td className="text-muted">{row.actor_email || row.actor_type}</td>
                      <td className="text-muted">{row.entity_type}</td>
                      <td className="text-muted text-nowrap">{row.created_at}</td>
                      <td className="text-end">
                        <button
                          type="button"
                          className="btn btn-soft-primary btn-sm"
                          onClick={() => setSelectedId(row.id)}
                          aria-label={t("common.open")}
                        >
                          <i className="ri-eye-line align-middle me-1"></i>
                          {t("common.open")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="d-flex justify-content-between align-items-center mt-3">
              <button type="button" className="btn btn-light" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - limit))}>
                {t("common.previous")}
              </button>
              <span className="text-muted">{total === 0 ? "0" : `${offset + 1}–${Math.min(offset + limit, total)} ${t("common.of")} ${total}`}</span>
              <button type="button" className="btn btn-light" disabled={offset + limit >= total || loading} onClick={() => setOffset(offset + limit)}>
                {t("common.next")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        isOpen={!!selected}
        onClose={() => setSelectedId(null)}
        size="xl"
        title={selected?.action || t("audit.title")}
        subtitle={selected ? selected.created_at : undefined}
        footer={
          <button type="button" className="btn btn-light" onClick={() => setSelectedId(null)}>
            {t("common.close")}
          </button>
        }
      >
        {selected ? (
          <>
            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <div className="border rounded p-3 h-100">
                  <p className="text-muted text-uppercase fs-11 mb-1">{t("audit.actorLabel")}</p>
                  <p className="mb-0 fw-medium">{selected.actor_email || "—"}</p>
                  <p className="text-muted fs-12 mb-0">{selected.actor_type}</p>
                </div>
              </div>
              <div className="col-md-6">
                <div className="border rounded p-3 h-100">
                  <p className="text-muted text-uppercase fs-11 mb-1">{t("audit.entity")}</p>
                  <p className="mb-0 fw-medium">{selected.entity_type}</p>
                  {selected.entity_id ? <p className="text-muted fs-12 mb-0 text-break">{selected.entity_id}</p> : null}
                </div>
              </div>
              <div className="col-md-6">
                <div className="border rounded p-3 h-100">
                  <p className="text-muted text-uppercase fs-11 mb-1">{t("audit.ip")}</p>
                  <p className="mb-0">{selected.ip_address || "—"}</p>
                </div>
              </div>
              <div className="col-md-6">
                <div className="border rounded p-3 h-100">
                  <p className="text-muted text-uppercase fs-11 mb-1">{t("audit.when")}</p>
                  <p className="mb-0">{selected.created_at}</p>
                </div>
              </div>
            </div>
            <p className="text-muted text-uppercase fs-11 mb-2">{t("audit.agent")}</p>
            <p className="text-break mb-3">{selected.user_agent || "—"}</p>
            <p className="text-muted text-uppercase fs-11 mb-2">{t("audit.metadata")}</p>
            <pre className="bg-light-subtle border rounded p-3 mb-0 dx-audit-json">{JSON.stringify(selected.metadata ?? {}, null, 2)}</pre>
          </>
        ) : null}
      </Modal>
    </>
  );
}
