"use client";

import { useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/ui/page-header";
import { alertActionLabel, formatAlertTime, isAlertActive, nextAlertStatuses } from "@/lib/alerts";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { copyText } from "@/lib/clipboard";
import { useAuth } from "@/context/auth-context";
import { hasPermission } from "@/lib/permissions";
import { canSeePage } from "@/lib/pages";
import { invalidateQueries } from "@/lib/panel/cache";
import { useQuery } from "@/lib/panel/use-query";
import type { Alert } from "@/lib/types";

const STATUS_FILTERS = ["ALL", "OPEN", "ACKNOWLEDGED", "INVESTIGATING", "RESOLVED"] as const;
const SEVERITY_FILTERS = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;

export default function AlertsPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, "alerts", "write");
  const canServer = canSeePage(user, "server_detail");
  const canDetail = canSeePage(user, "alert_detail");

  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const alertKey = `alerts?status=${selectedStatus}&severity=${selectedSeverity}`;
  const alertsQuery = useQuery(
    alertKey,
    () => {
      const params = new URLSearchParams({ limit: "100" });
      if (selectedStatus !== "ALL") params.set("status", selectedStatus);
      if (selectedSeverity !== "ALL") params.set("severity", selectedSeverity.toLowerCase());
      return apiFetch<{ alerts: Alert[]; total: number }>(`/alerts?${params}`);
    },
    { refreshMs: 15000 },
  );
  const alerts = alertsQuery.data?.alerts || [];
  const total = alertsQuery.data?.total ?? alerts.length;

  const filteredAlerts = alerts.filter((alert) => {
    if (search === "") return true;
    const q = search.toLowerCase();
    return (
      alert.title.toLowerCase().includes(q) ||
      (alert.description || "").toLowerCase().includes(q) ||
      (alert.rule_id && alert.rule_id.toLowerCase().includes(q)) ||
      (alert.server_id && alert.server_id.toLowerCase().includes(q)) ||
      (alert.source_ip && alert.source_ip.toLowerCase().includes(q))
    );
  });
  const selected = filteredAlerts.find((alert) => alert.id === selectedId) ?? filteredAlerts[0] ?? null;
  const activeCount = filteredAlerts.filter((alert) => isAlertActive(alert.status)).length;

  async function patchAlert(alert: Alert, status: string) {
    if (!canWrite || actionBusy) return;
    setActionBusy(alert.id);
    setActionError(null);
    try {
      await apiFetch(`/alerts/${alert.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      invalidateQueries(["stats", "alert:"]);
      await alertsQuery.reload();
    } catch (e) {
      setActionError(e instanceof ApiRequestError ? e.message : e instanceof Error ? e.message : "Failed to update alert");
    } finally {
      setActionBusy(null);
    }
  }

  async function copyJson(alert: Alert) {
    const result = await copyText(JSON.stringify(alert, null, 2));
    if (result.ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <>
      <PageHeader
        title="Alerts"
        subtitle="Work one detection at a time. Filters stay on the API, the search narrows this page."
        actions={
          <span className="text-muted">
            {activeCount} active · {total} loaded
          </span>
        }
      />

      <div className="card">
        <div className="card-body">
          <div className="row g-2">
            <div className="col-lg-6">
              <input
                className="form-control"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Title, rule, server, or source IP"
              />
            </div>
            <div className="col-md-3">
              <select className="form-select" value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
                {STATUS_FILTERS.map((status) => (
                  <option key={status} value={status}>
                    Status: {status}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <select className="form-select" value={selectedSeverity} onChange={(event) => setSelectedSeverity(event.target.value)}>
                {SEVERITY_FILTERS.map((severity) => (
                  <option key={severity} value={severity}>
                    Severity: {severity}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {actionError ? <div className="alert alert-danger">{actionError}</div> : null}
      {alertsQuery.loading ? <LoadingBlock label="Loading alerts…" /> : null}
      {alertsQuery.error ? <div className="alert alert-danger">{alertsQuery.error}</div> : null}

      {!alertsQuery.loading && !alertsQuery.error && filteredAlerts.length === 0 ? (
        <EmptyState
          title={alerts.length === 0 ? "No alerts yet" : "Nothing in this view"}
          description="Clear the search or widen the status and severity."
          action={
            <button
              type="button"
              className="btn btn-light"
              onClick={() => {
                setSelectedStatus("ALL");
                setSelectedSeverity("ALL");
                setSearch("");
              }}
            >
              Reset
            </button>
          }
        />
      ) : null}

      {filteredAlerts.length > 0 ? (
        <div className="row">
          <div className="col-xl-7">
            <div className="dx-log">
              {filteredAlerts.map((alert) => (
                <button key={alert.id} type="button" className={selected?.id === alert.id ? "is-on" : ""} onClick={() => setSelectedId(alert.id)}>
                  <span className="d-flex justify-content-between gap-2">
                    <span className="fw-medium">{alert.title}</span>
                    <SeverityBadge severity={alert.severity} />
                  </span>
                  <span className="d-block text-muted fs-12 mt-1">
                    {alert.status} · {alert.event_count || 1} hits · {formatAlertTime(alert.last_seen_at)}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className="col-xl-5">
            {selected ? (
              <div className="card dx-detail">
                <div className="card-body">
                  <div className="d-flex gap-2 mb-2">
                    <StatusBadge status={selected.status} />
                    <SeverityBadge severity={selected.severity} />
                  </div>
                  <h4>{selected.title}</h4>
                  <p className="text-muted">{selected.description || "No description."}</p>
                  <dl className="row">
                    <dt className="col-4 text-muted">Server</dt>
                    <dd className="col-8 text-break">
                      {canServer ? <Link href={`/servers/${selected.server_id}`}>{selected.server_id}</Link> : selected.server_id}
                    </dd>
                    <dt className="col-4 text-muted">Rule</dt>
                    <dd className="col-8">{selected.rule_id || "—"}</dd>
                    <dt className="col-4 text-muted">Source IP</dt>
                    <dd className="col-8">{selected.source_ip || "—"}</dd>
                    <dt className="col-4 text-muted">First seen</dt>
                    <dd className="col-8">{formatAlertTime(selected.first_seen_at)}</dd>
                    <dt className="col-4 text-muted">Last seen</dt>
                    <dd className="col-8">{formatAlertTime(selected.last_seen_at)}</dd>
                  </dl>
                  <p className="text-muted fs-12">
                    Review the host around {formatAlertTime(selected.first_seen_at)}, then acknowledge while you look and resolve when it is closed.
                  </p>
                  <div className="d-flex flex-wrap gap-2">
                    {canWrite
                      ? nextAlertStatuses(selected.status).map((status) => (
                          <button
                            key={status}
                            type="button"
                            className={status === "RESOLVED" || status === "OPEN" ? "btn btn-primary btn-sm" : "btn btn-light btn-sm"}
                            disabled={actionBusy === selected.id}
                            onClick={() => void patchAlert(selected, status)}
                          >
                            {alertActionLabel(status)}
                          </button>
                        ))
                      : null}
                    <button type="button" className="btn btn-light btn-sm" onClick={() => void copyJson(selected)}>
                      {copied ? "Copied" : "Copy JSON"}
                    </button>
                    {canDetail ? (
                      <Link href={`/alerts/${selected.id}`} className="btn btn-primary btn-sm">
                        Full record
                      </Link>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
