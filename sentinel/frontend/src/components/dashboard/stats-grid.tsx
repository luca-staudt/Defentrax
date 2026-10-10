import { countSeverity } from "@/lib/alerts";
import type { DashboardStats } from "@/lib/types";
import { SecurityPostureGauge, ThreatTimelineChart } from "@/components/ui/telemetry-chart";

function StatCard({
  label,
  value,
  sublabel,
  icon,
}: {
  label: string;
  value: string | number;
  sublabel: string;
  icon: string;
}) {
  return (
    <div className="col-12 col-sm-6 col-lg">
      <div className="card card-animate dx-stat-card dx-stat-primary h-100">
        <div className="card-body">
          <div className="d-flex align-items-center">
            <div className="flex-grow-1 overflow-hidden">
              <p className="text-uppercase fw-medium text-muted text-truncate mb-0">{label}</p>
            </div>
            <div className="avatar-sm flex-shrink-0">
              <span className="avatar-title bg-primary-subtle text-primary rounded fs-3">
                <i className={icon}></i>
              </span>
            </div>
          </div>
          <div className="mt-4">
            <h4 className="fs-22 fw-semibold ff-secondary mb-2">
              <span className="counter-value">{value}</span>
            </h4>
            <span className="text-muted">{sublabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function StatsGrid({ stats }: { stats: DashboardStats }) {
  const criticalCount = countSeverity(stats.alerts_by_severity, "critical");
  const coverage =
    stats.servers_total > 0 ? `${Math.round((stats.agents_active / stats.servers_total) * 100)}%` : "0%";

  return (
    <>
      <div className="row g-4 mb-4 dx-stats-row">
        <StatCard
          label="Monitored Servers"
          value={stats.servers_total}
          sublabel={`${stats.agents_active} active agent${stats.agents_active === 1 ? "" : "s"}`}
          icon="ri-server-line"
        />
        <StatCard
          label="Open Alerts"
          value={stats.alerts_open}
          sublabel={criticalCount > 0 ? `${criticalCount} critical` : "No critical threats"}
          icon="ri-alarm-warning-line"
        />
        <StatCard
          label="24h Event Volume"
          value={stats.events_last_24h.toLocaleString()}
          sublabel="Stream throughput"
          icon="ri-pulse-line"
        />
        <StatCard
          label="Coverage Ratio"
          value={coverage}
          sublabel={`${stats.agents_active} of ${stats.servers_total} online`}
          icon="ri-shield-check-line"
        />
      </div>
      <div className="row g-4">
        <div className="col-xl-8">
          <ThreatTimelineChart eventsTotal={stats.events_last_24h} alertsCount={stats.alerts_open} />
        </div>
        <div className="col-xl-4">
          <SecurityPostureGauge alertsOpen={stats.alerts_open} criticalAlerts={criticalCount} />
        </div>
      </div>
    </>
  );
}
