"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CoverageRadial, SeverityLine } from "@/components/dashboard/analytics-charts";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { PageHeader } from "@/components/ui/page-header";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/context/auth-context";
import { useI18n } from "@/lib/i18n";
import { countSeverity, formatAlertTime } from "@/lib/alerts";
import { apiFetch } from "@/lib/api/client";
import { canSeePage } from "@/lib/pages";
import { useQuery } from "@/lib/panel/use-query";
import type { Alert, DashboardStats } from "@/lib/types";

export default function DashboardPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canAlerts = canSeePage(user, "alerts");
  const canAlertDetail = canSeePage(user, "alert_detail");
  const statsQuery = useQuery("stats", () => apiFetch<DashboardStats>("/dashboard/stats"));
  const alertsQuery = useQuery(
    canAlerts ? "alerts?limit=8&status=OPEN" : null,
    () => apiFetch<{ alerts: Alert[] }>("/alerts?limit=8&status=OPEN"),
    { refreshMs: 15000 },
  );
  const stats = statsQuery.data ?? null;
  const alerts = alertsQuery.data?.alerts || [];

  const critical = countSeverity(stats?.alerts_by_severity, "critical");
  const coverage = stats && stats.servers_total > 0 ? Math.round((stats.agents_active / stats.servers_total) * 100) : 0;

  return (
    <>
      <PageHeader
        title={t("dash.title")}
        subtitle={t("dash.subtitle")}
        actions={
          canAlerts ? (
            <Link href="/alerts" className="btn btn-primary">
              {t("dash.queue")}
            </Link>
          ) : null
        }
      />

      {statsQuery.error ? <div className="alert alert-danger">{statsQuery.error}</div> : null}
      {statsQuery.loading ? <LoadingBlock label={t("dash.loading")} /> : null}

      {stats ? (
        <>
          <div className="row">
            <StatWidget
              label={t("dash.open")}
              value={stats.alerts_open}
              hint={critical > 0 ? `${critical} ${t("dash.critical")}` : t("dash.noneCritical")}
              icon="ri-alarm-warning-line"
              tone={critical > 0 ? "danger" : stats.alerts_open > 0 ? "warning" : "success"}
            />
            <StatWidget
              label={t("dash.silent")}
              value={stats.hosts_silent ?? 0}
              hint={t("dash.silentHint")}
              icon="ri-wifi-off-line"
              tone={(stats.hosts_silent ?? 0) > 0 ? "warning" : "success"}
            />
            <StatWidget
              label={t("dash.events")}
              value={stats.events_last_24h}
              hint={t("dash.received")}
              icon="ri-pulse-line"
              tone="info"
            />
            <StatWidget
              label={t("dash.servers")}
              value={stats.servers_total}
              hint={`${stats.agents_active} ${t("dash.agents")}`}
              icon="ri-server-line"
              tone="primary"
            />
            <StatWidget
              label={t("dash.coverage")}
              value={coverage}
              suffix="%"
              hint={t("dash.coverageHint")}
              icon="ri-shield-check-line"
              tone={coverage >= 80 ? "success" : coverage > 0 ? "warning" : "secondary"}
            />
          </div>

          <div className="row">
            <div className="col-xl-8">
              <div className="card card-height-100">
                <div className="card-header align-items-center d-flex">
                  <h4 className="card-title mb-0 flex-grow-1">{t("dash.shape")}</h4>
                  <span className="text-muted">{t("dash.shapeHint")}</span>
                </div>
                <div className="card-body">
                  <SeverityLine alerts={stats.alerts_by_severity} events={stats.events_by_severity_24h} />
                </div>
              </div>
            </div>
            <div className="col-xl-4">
              <div className="card card-height-100">
                <div className="card-header align-items-center d-flex">
                  <h4 className="card-title mb-0 flex-grow-1">{t("dash.coverageTitle")}</h4>
                </div>
                <div className="card-body">
                  <CoverageRadial active={stats.agents_active} total={stats.servers_total} />
                </div>
              </div>
            </div>
          </div>

          {canAlerts ? (
            <RecentAlerts
              alerts={alerts}
              loading={alertsQuery.loading}
              error={alertsQuery.error}
              canAlertDetail={canAlertDetail}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}

function RecentAlerts({
  alerts,
  loading,
  error,
  canAlertDetail,
}: {
  alerts: Alert[];
  loading: boolean;
  error: string | null;
  canAlertDetail: boolean;
}) {
  const { t } = useI18n();
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (loading) return <LoadingBlock label={t("dash.loadingAlerts")} />;
  if (alerts.length === 0) {
    return <EmptyState title={t("dash.clear")} description={t("dash.clearHint")} />;
  }

  return (
    <div className="card card-height-100">
      <div className="card-header align-items-center d-flex">
        <h4 className="card-title mb-0 flex-grow-1">{t("dash.recent")}</h4>
        <Link href="/alerts" className="btn btn-soft-primary btn-sm">
          {t("dash.viewAll")}
        </Link>
      </div>
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
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => (
                <tr key={alert.id}>
                  <td>
                    {canAlertDetail ? (
                      <Link href={`/alerts/${alert.id}`} className="fw-medium">
                        {alert.title}
                      </Link>
                    ) : (
                      <span className="fw-medium">{alert.title}</span>
                    )}
                  </td>
                  <td>
                    <SeverityBadge severity={alert.severity} />
                  </td>
                  <td>
                    <StatusBadge status={alert.status} />
                  </td>
                  <td>{alert.event_count ?? 1}</td>
                  <td className="text-muted">{formatAlertTime(alert.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatWidget({
  label,
  value,
  hint,
  icon,
  tone,
  suffix,
}: {
  label: string;
  value: number;
  hint: string;
  icon: string;
  tone: "primary" | "success" | "info" | "warning" | "danger" | "secondary";
  suffix?: string;
}) {
  return (
    <div className="col-6 col-xl">
      <div className="card card-animate">
        <div className="card-body">
          <div className="d-flex align-items-center">
            <div className="flex-grow-1 overflow-hidden">
              <p className="text-uppercase fw-medium text-muted text-truncate mb-0">{label}</p>
            </div>
          </div>
          <div className="d-flex align-items-end justify-content-between mt-4">
            <div>
              <h4 className="fs-22 fw-semibold ff-secondary mb-3">
                <Counter value={value} />
                {suffix ? <span>{suffix}</span> : null}
              </h4>
              <span className="text-muted">{hint}</span>
            </div>
            <div className="avatar-sm flex-shrink-0">
              <span className={`avatar-title bg-${tone}-subtle text-${tone} rounded fs-3`}>
                <i className={icon}></i>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Counter({ value }: { value: number }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const duration = 650;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setShown(Math.round(value * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className="counter-value">{shown.toLocaleString()}</span>;
}
