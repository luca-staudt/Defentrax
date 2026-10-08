"use client";

import { useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { PageHeader } from "@/components/ui/page-header";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/context/auth-context";
import { countSeverity, formatAlertTime } from "@/lib/alerts";
import { apiFetch } from "@/lib/api/client";
import { canSeePage } from "@/lib/pages";
import { useQuery } from "@/lib/panel/use-query";
import type { Alert, DashboardStats } from "@/lib/types";

const LEVELS = ["critical", "high", "medium", "low", "info"] as const;

export default function DashboardPage() {
  const { user } = useAuth();
  const canAlerts = canSeePage(user, "alerts");
  const canAlertDetail = canSeePage(user, "alert_detail");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const statsQuery = useQuery("stats", () => apiFetch<DashboardStats>("/dashboard/stats"));
  const alertsQuery = useQuery(
    canAlerts ? "alerts?limit=8&status=OPEN" : null,
    () => apiFetch<{ alerts: Alert[] }>("/alerts?limit=8&status=OPEN"),
    { refreshMs: 15000 },
  );
  const stats = statsQuery.data ?? null;
  const alerts = alertsQuery.data?.alerts || [];
  const selected = alerts.find((alert) => alert.id === selectedId) ?? alerts[0] ?? null;

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="What is open, what came in today, and which hosts are reporting."
        actions={
          canAlerts ? (
            <Link href="/alerts" className="btn btn-primary">
              Work the queue
            </Link>
          ) : null
        }
      />

      {statsQuery.error ? <div className="alert alert-danger">{statsQuery.error}</div> : null}
      {statsQuery.loading ? <LoadingBlock label="Loading overview..." /> : null}

      {stats ? (
        <>
          <div className="row g-3 mb-3">
            <Metric label="Open alerts" value={stats.alerts_open} hint={countSeverity(stats.alerts_by_severity, "critical") > 0 ? `${countSeverity(stats.alerts_by_severity, "critical")} critical` : "None critical"} />
            <Metric label="Events, 24h" value={stats.events_last_24h.toLocaleString()} hint="Received by the API" />
            <Metric label="Servers" value={stats.servers_total} hint={`${stats.agents_active} agents active`} />
            <Metric
              label="Coverage"
              value={stats.servers_total > 0 ? `${Math.round((stats.agents_active / stats.servers_total) * 100)}%` : "0%"}
              hint="Agents reporting against enrolled servers"
            />
          </div>

          <div className="card">
            <div className="card-header">
              <h4 className="card-title mb-0">Open alerts by severity</h4>
            </div>
            <div className="card-body">
              <div className="d-flex flex-wrap gap-2">
                {LEVELS.map((level) => (
                  <span key={level} className="dx-metric" style={{ minWidth: 120 }}>
                    <span className="text-muted text-uppercase fs-12">{level}</span>
                    <strong>{countSeverity(stats.alerts_by_severity, level)}</strong>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}

      {canAlerts ? (
        <div className="row">
          <div className="col-xl-7">
            <div className="card">
              <div className="card-header">
                <h4 className="card-title mb-0">Needs attention</h4>
              </div>
              <div className="card-body">
                {alerts.length === 0 ? (
                  <EmptyState title="Queue is clear" description="No open alerts right now." />
                ) : (
                  <div className="dx-log">
                    {alerts.map((alert) => (
                      <button
                        key={alert.id}
                        type="button"
                        className={selected?.id === alert.id ? "is-on" : ""}
                        onClick={() => setSelectedId(alert.id)}
                      >
                        <span className="d-flex justify-content-between gap-2">
                          <span className="fw-medium">{alert.title}</span>
                          <SeverityBadge severity={alert.severity} />
                        </span>
                        <span className="d-block text-muted fs-12 mt-1">
                          {alert.status} · {formatAlertTime(alert.last_seen_at)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="col-xl-5">
            <div className="card dx-detail">
              <div className="card-header">
                <h4 className="card-title mb-0">Selected alert</h4>
              </div>
              <div className="card-body">
                {!selected ? (
                  <p className="text-muted mb-0">Pick an alert from the queue.</p>
                ) : (
                  <>
                    <h5>{selected.title}</h5>
                    <p className="text-muted">{selected.description || "No description."}</p>
                    <div className="d-flex gap-2 mb-3">
                      <StatusBadge status={selected.status} />
                      <SeverityBadge severity={selected.severity} />
                    </div>
                    <dl className="row mb-3">
                      <dt className="col-4 text-muted">Hits</dt>
                      <dd className="col-8">{selected.event_count ?? 1}</dd>
                      <dt className="col-4 text-muted">Rule</dt>
                      <dd className="col-8">{selected.rule_id || "—"}</dd>
                      <dt className="col-4 text-muted">Last seen</dt>
                      <dd className="col-8">{formatAlertTime(selected.last_seen_at)}</dd>
                    </dl>
                    {canAlertDetail ? (
                      <Link href={`/alerts/${selected.id}`} className="btn btn-primary">
                        Open record
                      </Link>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Metric({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="col-md-6 col-xl-3">
      <div className="dx-metric">
        <span className="text-muted text-uppercase fs-12">{label}</span>
        <strong>{value}</strong>
        <span className="text-muted fs-12">{hint}</span>
      </div>
    </div>
  );
}
