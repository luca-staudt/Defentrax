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
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 p-5 shadow-xl backdrop-blur-md transition-all hover:border-sky-500/40">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">{label}</p>
          <p className="font-display mt-2 text-3xl font-bold tracking-tight text-white">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-950/40 text-sky-400">
          {icon}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5 border-t border-zinc-800/50 pt-2 text-[11px] font-mono text-zinc-400">
        <span className="h-1 w-1 rounded-full bg-sky-400" />
        {sublabel}
      </div>
    </div>
  );
}

function SeverityBreakdownChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data);
  const total = entries.reduce((acc, [, v]) => acc + v, 0);

  const getSeverityStyle = (sev: string) => {
    switch (sev.toUpperCase()) {
      case "CRITICAL":
        return { bg: "bg-rose-500", text: "text-rose-400", border: "border-rose-500/40" };
      case "HIGH":
        return { bg: "bg-amber-500", text: "text-amber-400", border: "border-amber-500/40" };
      case "MEDIUM":
        return { bg: "bg-yellow-400", text: "text-yellow-300", border: "border-yellow-400/40" };
      case "LOW":
        return { bg: "bg-sky-400", text: "text-sky-300", border: "border-sky-400/40" };
      default:
        return { bg: "bg-zinc-500", text: "text-zinc-400", border: "border-zinc-500/40" };
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 p-5 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
        <h4 className="font-display text-sm font-semibold text-white">Alerts by Severity</h4>
        <span className="font-mono text-xs text-zinc-400">Live Breakdown</span>
      </div>
      <div className="mt-4 space-y-3">
        {entries.length === 0 ? (
          <p className="text-center font-mono text-xs text-zinc-500 py-4">No active severity incidents</p>
        ) : (
          entries.map(([sev, count]) => {
            const style = getSeverityStyle(sev);
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={sev} className="space-y-1">
                <div className="flex justify-between font-mono text-xs">
                  <span className={`font-semibold ${style.text}`}>{sev.toUpperCase()}</span>
                  <span className="text-zinc-400">
                    {count} ({pct}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800/80">
                  <div className={`h-full ${style.bg} transition-all duration-500`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export function StatsGrid({ stats }: { stats: DashboardStats }) {
  const criticalCount = (stats.alerts_by_severity?.CRITICAL || stats.alerts_by_severity?.critical || 0);

  return (
    <div className="space-y-6">
      {/* 4 Top KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Monitored Fleet"
          value={stats.servers_total}
          sublabel={`${stats.agents_active} active agent${stats.agents_active === 1 ? "" : "s"}`}
          icon={<ServerIcon className="h-5 w-5" />}
        />
        <StatCard
          label="Open Incidents"
          value={stats.alerts_open}
          sublabel={criticalCount > 0 ? `${criticalCount} critical incident${criticalCount === 1 ? "" : "s"}` : "No critical threats"}
          icon={<AlertTriangleIcon className="h-5 w-5" />}
        />
        <StatCard
          label="24h Event Ingestion"
          value={stats.events_last_24h.toLocaleString()}
          sublabel="Stream throughput"
          icon={<ActivityIcon className="h-5 w-5" />}
        />
        <StatCard
          label="Fleet Agent Ratio"
          value={stats.servers_total > 0 ? `${Math.round((stats.agents_active / stats.servers_total) * 100)}%` : "0%"}
          sublabel={`${stats.agents_active} of ${stats.servers_total} enrolled`}
          icon={<ShieldCheckIcon className="h-5 w-5" />}
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

      {/* Severity Breakdown Section */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SeverityBreakdownChart data={stats.alerts_by_severity || {}} />
        <div className="rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 p-5 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
            <h4 className="font-display text-sm font-semibold text-white">24h Event Volume by Severity</h4>
            <span className="font-mono text-xs text-zinc-400">Stream Telemetry</span>
          </div>
          <div className="mt-4 space-y-3">
            {Object.keys(stats.events_by_severity_24h || {}).length === 0 ? (
              <p className="text-center font-mono text-xs text-zinc-500 py-4">No events registered in past 24h</p>
            ) : (
              Object.entries(stats.events_by_severity_24h).map(([sev, count]) => {
                const total = stats.events_last_24h || 1;
                const pct = Math.min(100, Math.round((count / total) * 100));
                return (
                  <div key={sev} className="space-y-1">
                    <div className="flex justify-between font-mono text-xs">
                      <span className="text-zinc-300 font-medium uppercase">{sev}</span>
                      <span className="text-zinc-400">{count.toLocaleString()} ({pct}%)</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800/80">
                      <div className="h-full bg-sky-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
