"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { SavedViews } from "@/components/operator/saved-views";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/context/auth-context";
import { formatAlertTime, isAlertActive, nextAlertStatuses } from "@/lib/alerts";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { copyText } from "@/lib/clipboard";
import { actionLabel, severityLabel, statusLabel, useI18n } from "@/lib/i18n";
import { canSeePage } from "@/lib/pages";
import { invalidateQueries } from "@/lib/panel/cache";
import { useQuery } from "@/lib/panel/use-query";
import { hasPermission } from "@/lib/permissions";
import type { Alert, Server } from "@/lib/types";

const STATUS_FILTERS = ["ALL", "OPEN", "ACKNOWLEDGED", "INVESTIGATING", "RESOLVED"] as const;
const SEVERITY_FILTERS = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;

export default function AlertsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canWrite = hasPermission(user, "alerts", "write");
  const canServer = canSeePage(user, "server_detail");
  const canServers = canSeePage(user, "servers");
  const canDetail = canSeePage(user, "alert_detail");

  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("ALL");
  const [serverId, setServerId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const alertKey = `alerts?status=${selectedStatus}&severity=${selectedSeverity}&server=${serverId}`;
  const alertsQuery = useQuery(
    alertKey,
    () => {
      const params = new URLSearchParams({ limit: "100" });
      if (selectedStatus !== "ALL") params.set("status", selectedStatus);
      if (selectedSeverity !== "ALL") params.set("severity", selectedSeverity.toLowerCase());
      if (serverId) params.set("server_id", serverId);
      return apiFetch<{ alerts: Alert[]; total: number }>(`/alerts?${params}`);
    },
    { refreshMs: 15000 },
  );
  const serversQuery = useQuery(canServers ? "servers" : null, () => apiFetch<{ servers: Server[] }>("/servers"));
  const servers = serversQuery.data?.servers || [];
  const applyView = useCallback((query: Record<string, string>) => {
    setSelectedStatus(query.status || "ALL");
    setSelectedSeverity((query.severity || "ALL").toUpperCase());
    setSearch(query.q || "");
    setServerId(query.server_id || "");
    setSelectedId(null);
  }, []);
  const currentView: Record<string, string> = {
    status: selectedStatus,
    severity: selectedSeverity,
    ...(search ? { q: search } : {}),
    ...(serverId ? { server_id: serverId } : {}),
  };
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
  const selected = filteredAlerts.find((alert) => alert.id === selectedId) ?? null;
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
      setActionError(e instanceof ApiRequestError ? e.message : e instanceof Error ? e.message : t("people.updateFailed"));
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
        title={t("alerts.title")}
        subtitle={t("alerts.subtitle")}
        actions={
          <span className="text-muted">
            {activeCount} {t("alerts.active")} · {total} {t("alerts.loaded")}
          </span>
        }
      />

      <div className="card">
        <div className="card-body">
          <div className="mb-3">
            <SavedViews kind="alerts" current={currentView} onApply={applyView} />
          </div>
          <div className="row g-2">
            <div className="col-lg-4">
              <input
                className="form-control"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("alerts.search")}
              />
            </div>
            <div className="col-md-3">
              <select className="form-select" value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
                {STATUS_FILTERS.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(t, status)}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <select className="form-select" value={selectedSeverity} onChange={(event) => setSelectedSeverity(event.target.value)}>
                {SEVERITY_FILTERS.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity === "ALL" ? t("events.allSeverities") : severityLabel(t, severity)}
                  </option>
                ))}
              </select>
            </div>
            {canServers ? (
              <div className="col-md-3">
                <select className="form-select" value={serverId} onChange={(event) => setServerId(event.target.value)}>
                  <option value="">{t("alerts.allServers")}</option>
                  {servers.map((server) => (
                    <option key={server.id} value={server.id}>
                      {server.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {actionError && !selected ? <div className="alert alert-danger">{actionError}</div> : null}
      {alertsQuery.loading ? <LoadingBlock label={t("alerts.loading")} /> : null}
      {alertsQuery.error ? <div className="alert alert-danger">{alertsQuery.error}</div> : null}

      {!alertsQuery.loading && !alertsQuery.error && filteredAlerts.length === 0 ? (
        <EmptyState
          title={alerts.length === 0 ? t("alerts.empty") : t("alerts.filtered")}
          description={t("alerts.filteredHint")}
          action={
            <button
              type="button"
              className="btn btn-light"
              onClick={() => {
                setSelectedStatus("ALL");
                setSelectedSeverity("ALL");
                setSearch("");
                setServerId("");
              }}
            >
              {t("common.reset")}
            </button>
          }
        />
      ) : null}

      {filteredAlerts.length > 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover align-middle table-nowrap mb-0">
                <thead className="table-light">
                  <tr>
                    <th>{t("dash.colAlert")}</th>
                    <th>{t("alerts.severity")}</th>
                    <th>{t("alerts.status")}</th>
                    <th>{t("common.hits")}</th>
                    <th>{t("common.lastSeen")}</th>
                    <th className="text-end">{t("common.open")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAlerts.map((alert) => (
                    <tr key={alert.id}>
                      <td>
                        <button type="button" className="btn btn-link p-0 fw-medium text-start" onClick={() => setSelectedId(alert.id)}>
                          {alert.title}
                        </button>
                      </td>
                      <td>
                        <SeverityBadge severity={alert.severity} />
                      </td>
                      <td>
                        <StatusBadge status={alert.status} />
                      </td>
                      <td>{alert.event_count || 1}</td>
                      <td className="text-muted">{formatAlertTime(alert.last_seen_at)}</td>
                      <td className="text-end">
                        <button
                          type="button"
                          className="btn btn-soft-primary btn-sm"
                          onClick={() => setSelectedId(alert.id)}
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
          </div>
        </div>
      ) : null}

      <Modal
        isOpen={!!selected}
        onClose={() => {
          setSelectedId(null);
          setActionError(null);
        }}
        size="xl"
        title={selected?.title || t("dash.selected")}
        subtitle={selected ? statusLabel(t, selected.status) : undefined}
        footer={
          selected ? (
            <div className="d-flex flex-wrap gap-2 w-100 justify-content-end">
              {canWrite
                ? nextAlertStatuses(selected.status).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={status === "RESOLVED" || status === "OPEN" ? "btn btn-primary btn-sm" : "btn btn-light btn-sm"}
                      disabled={actionBusy === selected.id}
                      onClick={() => void patchAlert(selected, status)}
                    >
                      {actionLabel(t, status)}
                    </button>
                  ))
                : null}
              <button type="button" className="btn btn-light btn-sm" onClick={() => void copyJson(selected)}>
                {copied ? t("alerts.copied") : t("alerts.copy")}
              </button>
              {canDetail ? (
                <Link href={`/alerts/${selected.id}`} className="btn btn-primary btn-sm">
                  {t("alerts.full")}
                </Link>
              ) : null}
              <button type="button" className="btn btn-light btn-sm" onClick={() => setSelectedId(null)}>
                {t("common.close")}
              </button>
            </div>
          ) : null
        }
      >
        {selected ? (
          <>
            <div className="d-flex gap-2 mb-3">
              <StatusBadge status={selected.status} />
              <SeverityBadge severity={selected.severity} />
            </div>
            <p className="text-muted">{selected.description || t("common.noDescription")}</p>
            {actionError ? <div className="alert alert-danger">{actionError}</div> : null}
            <dl className="row mb-0">
              <dt className="col-sm-3 text-muted">{t("common.server")}</dt>
              <dd className="col-sm-9 text-break">
                {canServer ? <Link href={`/servers/${selected.server_id}`}>{selected.server_id}</Link> : selected.server_id}
              </dd>
              <dt className="col-sm-3 text-muted">{t("common.rule")}</dt>
              <dd className="col-sm-9">{selected.rule_id || "—"}</dd>
              <dt className="col-sm-3 text-muted">{t("common.sourceIp")}</dt>
              <dd className="col-sm-9">{selected.source_ip || "—"}</dd>
              <dt className="col-sm-3 text-muted">{t("common.firstSeen")}</dt>
              <dd className="col-sm-9">{formatAlertTime(selected.first_seen_at)}</dd>
              <dt className="col-sm-3 text-muted">{t("common.lastSeen")}</dt>
              <dd className="col-sm-9">{formatAlertTime(selected.last_seen_at)}</dd>
            </dl>
            <p className="text-muted fs-12 mt-3 mb-0">{t("alerts.review")}</p>
          </>
        ) : null}
      </Modal>
    </>
  );
}
