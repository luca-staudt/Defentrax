"use client";

import { useState } from "react";
import Link from "next/link";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api/client";
import { canSeePage } from "@/lib/pages";
import { useQuery } from "@/lib/panel/use-query";
import type { Alert, DashboardStats } from "@/lib/types";

export default function DashboardPage() {
  const { user } = useAuth();
  const canAlerts = canSeePage(user, "alerts");
  const canAlertDetail = canSeePage(user, "alert_detail");
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const statsQuery = useQuery("stats", () => apiFetch<DashboardStats>("/dashboard/stats"));
  const alertsQuery = useQuery(
    canAlerts ? "alerts?limit=8&status=OPEN" : null,
    () => apiFetch<{ alerts: Alert[] }>("/alerts?limit=8&status=OPEN"),
    { refreshMs: 15000 },
  );
  const stats = statsQuery.data ?? null;
  const alerts = alertsQuery.data?.alerts || [];
  const error = statsQuery.error;
  const loading = statsQuery.loading;

  return (
    <>
      <PageHeader
        title="Security Overview"
        subtitle="Continuous threat evaluation and telemetry across monitored infrastructure"
        actions={
          canAlerts ? (
            <Link href="/alerts" className="btn btn-primary">
              All alerts
            </Link>
          ) : null
        }
      />

      {error ? <div className="alert alert-danger">{error}</div> : null}
      {loading ? <LoadingBlock label="Loading dashboard..." /> : stats ? <StatsGrid stats={stats} /> : null}

      {canAlerts ? (
        <div className="row">
          <div className="col-12">
            <div className="card">
              <div className="card-header align-items-center d-flex">
                <h4 className="card-title mb-0 flex-grow-1">Active alerts</h4>
                <span className="text-muted">Showing {alerts.length}</span>
              </div>
              <div className="card-body">
                {alerts.length === 0 ? (
                  <EmptyState title="No open alerts" description="No open alerts match the current detection rules." />
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover align-middle mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>Alert</th>
                          <th>Status</th>
                          <th>Severity</th>
                          <th>Last seen</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {alerts.map((alert) => (
                          <tr key={alert.id}>
                            <td>
                              <div className="fw-medium">{alert.title}</div>
                              <div className="text-muted fs-12">#{alert.id}</div>
                            </td>
                            <td>
                              <StatusBadge status={alert.status} />
                            </td>
                            <td>
                              <SeverityBadge severity={alert.severity} />
                            </td>
                            <td className="text-muted">{new Date(alert.last_seen_at || Date.now()).toLocaleString()}</td>
                            <td className="text-end">
                              <button type="button" className="btn btn-sm btn-light me-1" onClick={() => setSelectedAlert(alert)}>
                                Inspect
                              </button>
                              {canAlertDetail ? (
                                <Link href={`/alerts/${alert.id}`} className="btn btn-sm btn-primary">
                                  Open
                                </Link>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        isOpen={!!selectedAlert}
        onClose={() => setSelectedAlert(null)}
        title={selectedAlert ? `Alert #${selectedAlert.id}` : "Alert"}
        subtitle={selectedAlert?.title}
      >
        {selectedAlert ? (
          <>
            <div className="row g-3 mb-3">
              <div className="col-md-6">
                <p className="text-muted mb-1">Severity</p>
                <SeverityBadge severity={selectedAlert.severity} />
              </div>
              <div className="col-md-6">
                <p className="text-muted mb-1">Status</p>
                <StatusBadge status={selectedAlert.status} />
              </div>
              <div className="col-md-6">
                <p className="text-muted mb-1">Events</p>
                <span>{selectedAlert.event_count ?? 1}</span>
              </div>
              <div className="col-md-6">
                <p className="text-muted mb-1">Rule</p>
                <span>{selectedAlert.rule_id || "Detection rule"}</span>
              </div>
            </div>
            <pre className="bg-light p-3 rounded mb-3" style={{ maxHeight: 280, overflow: "auto" }}>
              {JSON.stringify(selectedAlert, null, 2)}
            </pre>
            <div className="text-end">
              <button type="button" className="btn btn-light me-2" onClick={() => setSelectedAlert(null)}>
                Close
              </button>
              {canAlertDetail ? (
                <Link href={`/alerts/${selectedAlert.id}`} className="btn btn-primary">
                  Open full record
                </Link>
              ) : null}
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}
