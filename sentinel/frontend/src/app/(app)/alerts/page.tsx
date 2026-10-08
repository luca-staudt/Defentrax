"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { alertActionLabel, formatAlertTime, formatAlertTimeShort, isAlertActive, nextAlertStatuses } from "@/lib/alerts";
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

  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("ALL");
  const [inspectAlert, setInspectAlert] = useState<Alert | null>(null);
  const [modalTab, setModalTab] = useState<"overview" | "raw" | "remediation">("overview");
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
  const loading = alertsQuery.loading;
  const error = alertsQuery.error;

  const filteredAlerts = alerts.filter((a) => {
    if (search === "") return true;
    const q = search.toLowerCase();
    return (
      a.title.toLowerCase().includes(q) ||
      (a.description || "").toLowerCase().includes(q) ||
      (a.rule_id && a.rule_id.toLowerCase().includes(q)) ||
      (a.server_id && a.server_id.toLowerCase().includes(q)) ||
      (a.source_ip && a.source_ip.toLowerCase().includes(q))
    );
  });

  const activeCount = filteredAlerts.filter((a) => isAlertActive(a.status)).length;

  async function handleCopy(payload: string) {
    const result = await copyText(payload);
    if (result.ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

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
      if (inspectAlert?.id === alert.id) {
        const res = await apiFetch<{ alert: Alert }>(`/alerts/${alert.id}`);
        setInspectAlert(res.alert);
      }
    } catch (e) {
      setActionError(e instanceof ApiRequestError ? e.message : e instanceof Error ? e.message : "Failed to update alert");
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Alerts"
        subtitle="Detection matches across enrolled servers — acknowledge, investigate, or resolve"
        actions={
          <div className="d-flex gap-2">
            <span className="badge bg-primary-subtle text-primary">{activeCount} active</span>
            <span className="badge bg-secondary-subtle text-secondary">{total} total</span>
          </div>
        }
      />

      <div className="card">
        <div className="card-body">
          <div className="row g-3">
            <div className="col-lg-4">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by title, rule, server, or source IP…"
                className="form-control"
              />
            </div>
            <div className="col-lg-8">
              <div className="d-flex flex-wrap gap-2">
                {STATUS_FILTERS.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSelectedStatus(st)}
                    className={`btn btn-sm ${selectedStatus === st ? "btn-primary" : "btn-light"}`}
                  >
                    {st === "ACKNOWLEDGED" ? "ACK" : st === "INVESTIGATING" ? "INV" : st}
                  </button>
                ))}
                <span className="vr mx-1" />
                {SEVERITY_FILTERS.map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setSelectedSeverity(sev)}
                    className={`btn btn-sm ${selectedSeverity === sev ? "btn-soft-primary" : "btn-light"}`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {actionError ? <div className="alert alert-danger">{actionError}</div> : null}

      {loading ? (
        <LoadingBlock label="Loading alerts…" />
      ) : error ? (
        <div className="alert alert-danger">{error}</div>
      ) : filteredAlerts.length === 0 ? (
        <EmptyState
          title={alerts.length === 0 ? "No alerts yet" : "No alerts match"}
          description={
            alerts.length === 0
              ? "When detection rules fire, incidents will appear here."
              : "Try clearing status or severity filters, or broaden your search."
          }
          action={
            selectedStatus !== "ALL" || selectedSeverity !== "ALL" || search ? (
              <button
                type="button"
                className="btn btn-light"
                onClick={() => {
                  setSelectedStatus("ALL");
                  setSelectedSeverity("ALL");
                  setSearch("");
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
                    <th>Severity</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Server</th>
                    <th>Hits</th>
                    <th>First / Last</th>
                    <th className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAlerts.map((alert) => {
                    const quick = nextAlertStatuses(alert.status);
                    const resolveTarget = quick.includes("RESOLVED") ? "RESOLVED" : quick.includes("OPEN") ? "OPEN" : null;
                    return (
                      <tr key={alert.id}>
                        <td>
                          <SeverityBadge severity={alert.severity} />
                        </td>
                        <td>
                          <div className="fw-medium">{alert.title}</div>
                          <div className="text-muted text-truncate" style={{ maxWidth: 360 }}>
                            {alert.description}
                          </div>
                        </td>
                        <td>
                          <StatusBadge status={alert.status} />
                        </td>
                        <td>
                          {canServer ? (
                            <Link href={`/servers/${alert.server_id}`} title={alert.server_id}>
                              {alert.server_id.slice(0, 8)}…
                            </Link>
                          ) : (
                            <span title={alert.server_id}>{alert.server_id.slice(0, 8)}…</span>
                          )}
                        </td>
                        <td>{alert.event_count || 1}</td>
                        <td className="text-muted fs-12">
                          <div>{formatAlertTimeShort(alert.first_seen_at)}</div>
                          <div>{formatAlertTimeShort(alert.last_seen_at)}</div>
                        </td>
                        <td className="text-end">
                          {canWrite && resolveTarget ? (
                            <button
                              type="button"
                              disabled={actionBusy === alert.id}
                              onClick={() => void patchAlert(alert, resolveTarget)}
                              className="btn btn-sm btn-success me-1"
                            >
                              {actionBusy === alert.id ? "…" : alertActionLabel(resolveTarget)}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn btn-sm btn-light me-1"
                            onClick={() => {
                              setInspectAlert(alert);
                              setModalTab("overview");
                            }}
                          >
                            Inspect
                          </button>
                          <Link href={`/alerts/${alert.id}`} className="btn btn-sm btn-primary">
                            Details
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={!!inspectAlert}
        onClose={() => setInspectAlert(null)}
        title={inspectAlert?.title || "Alert"}
        subtitle={inspectAlert ? `Server ${inspectAlert.server_id.slice(0, 8)}… · Rule ${inspectAlert.rule_id || "—"}` : undefined}
        footer={
          inspectAlert ? (
            <div className="d-flex flex-wrap justify-content-between w-100 gap-2">
              <span className="text-muted">Opened {formatAlertTime(inspectAlert.opened_at)}</span>
              <div className="d-flex flex-wrap gap-2">
                {canWrite
                  ? nextAlertStatuses(inspectAlert.status).map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={actionBusy === inspectAlert.id}
                        onClick={() => void patchAlert(inspectAlert, s)}
                        className={s === "RESOLVED" || s === "OPEN" ? "btn btn-primary btn-sm" : "btn btn-light btn-sm"}
                      >
                        {alertActionLabel(s)}
                      </button>
                    ))
                  : null}
                <button type="button" className="btn btn-light btn-sm" onClick={() => void handleCopy(JSON.stringify(inspectAlert, null, 2))}>
                  {copied ? "Copied" : "Copy JSON"}
                </button>
                <Link href={`/alerts/${inspectAlert.id}`} className="btn btn-primary btn-sm">
                  Open detail
                </Link>
              </div>
            </div>
          ) : null
        }
      >
        {inspectAlert ? (
          <>
            <ul className="nav nav-tabs nav-tabs-custom mb-3">
              {(
                [
                  ["overview", "Overview"],
                  ["raw", "Raw JSON"],
                  ["remediation", "Response"],
                ] as const
              ).map(([id, label]) => (
                <li className="nav-item" key={id}>
                  <button type="button" className={`nav-link ${modalTab === id ? "active" : ""}`} onClick={() => setModalTab(id)}>
                    {label}
                  </button>
                </li>
              ))}
            </ul>
            {modalTab === "overview" ? (
              <div className="row g-3">
                <Stat label="Severity">
                  <SeverityBadge severity={inspectAlert.severity} />
                </Stat>
                <Stat label="Status">
                  <StatusBadge status={inspectAlert.status} />
                </Stat>
                <Stat label="Hits">
                  <span className="fs-16">{inspectAlert.event_count || 1}</span>
                </Stat>
                <Stat label="Rule">
                  <span>{inspectAlert.rule_id || "—"}</span>
                </Stat>
                <div className="col-12">
                  <p className="text-muted mb-1">Summary</p>
                  <p className="mb-0">{inspectAlert.description || "No description."}</p>
                </div>
                <Stat label="Server">
                  {canServer ? (
                    <Link href={`/servers/${inspectAlert.server_id}`} className="text-break">
                      {inspectAlert.server_id}
                    </Link>
                  ) : (
                    <span className="text-break">{inspectAlert.server_id}</span>
                  )}
                </Stat>
                <Stat label="Alert ID">
                  <span className="text-break">{inspectAlert.id}</span>
                </Stat>
                <Stat label="First seen">{formatAlertTime(inspectAlert.first_seen_at)}</Stat>
                <Stat label="Last seen">{formatAlertTime(inspectAlert.last_seen_at)}</Stat>
              </div>
            ) : null}
            {modalTab === "raw" ? (
              <pre className="bg-light p-3 rounded mb-0" style={{ maxHeight: 320, overflow: "auto" }}>
                {JSON.stringify(inspectAlert, null, 2)}
              </pre>
            ) : null}
            {modalTab === "remediation" ? (
              <div className="alert alert-warning mb-0">
                <h6>Suggested next steps</h6>
                <ol className="mb-0">
                  <li>
                    Review processes and auth activity on server {inspectAlert.server_id.slice(0, 8)}… around{" "}
                    {formatAlertTime(inspectAlert.first_seen_at)}.
                  </li>
                  <li>Correlate related events under Events filtered by this host.</li>
                  <li>Acknowledge while investigating, then mark resolved with notes when closed.</li>
                </ol>
              </div>
            ) : null}
          </>
        ) : null}
      </Modal>
    </>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="col-md-6 col-xl-3">
      <div className="border rounded p-3 h-100">
        <span className="text-muted text-uppercase fs-12 d-block mb-1">{label}</span>
        {children}
      </div>
    </div>
  );
}
