import type { DashboardStats } from "@/lib/types";
import { ThreatTimelineChart, SecurityPostureGauge } from "@/components/ui/telemetry-chart";
import { ServerIcon, AlertTriangleIcon, ActivityIcon, ShieldCheckIcon } from "@/components/ui/icons";

function StatCard({
  label,
  value,
  sublabel,
  icon,
}: {
  label: string;
  value: string | number;
  sublabel: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-[#0c1017] p-5 transition hover:border-zinc-700">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-zinc-400">{label}</p>
          <p className="mt-2 text-3xl font-bold text-white">{value}</p>
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300">
          {icon}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-zinc-800/80 pt-2 text-xs text-zinc-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        {sublabel}
      </div>
    </div>
  );
}

export function StatsGrid({ stats }: { stats: DashboardStats }) {
  const criticalCount = (stats.alerts_by_severity?.CRITICAL || stats.alerts_by_severity?.critical || 0);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Monitored Servers"
          value={stats.servers_total}
          sublabel={`${stats.agents_active} active agent${stats.agents_active === 1 ? "" : "s"}`}
          icon={<ServerIcon className="h-4 w-4" />}
        />
        <StatCard
          label="Open Alerts"
          value={stats.alerts_open}
          sublabel={criticalCount > 0 ? `${criticalCount} critical` : "No critical threats"}
          icon={<AlertTriangleIcon className="h-4 w-4" />}
        />
        <StatCard
          label="24h Event Volume"
          value={stats.events_last_24h.toLocaleString()}
          sublabel="Stream throughput"
          icon={<ActivityIcon className="h-4 w-4" />}
        />
        <StatCard
          label="Coverage Ratio"
          value={stats.servers_total > 0 ? `${Math.round((stats.agents_active / stats.servers_total) * 100)}%` : "0%"}
          sublabel={`${stats.agents_active} of ${stats.servers_total} online`}
          icon={<ShieldCheckIcon className="h-4 w-4" />}
        />
      </div>

      {/* Real-time Telemetry & Dynamic Posture Calculation */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ThreatTimelineChart
            eventsTotal={stats.events_last_24h}
            alertsCount={stats.alerts_open}
          />
        </div>
        <div>
          <SecurityPostureGauge
            alertsOpen={stats.alerts_open}
            criticalAlerts={criticalCount}
          />
        </div>
      </div>
    </div>
  );
}
