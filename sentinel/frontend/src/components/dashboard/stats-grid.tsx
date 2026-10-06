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
        return { bg: "bg-rose-500", text: "text-rose-400" };
      case "HIGH":
        return { bg: "bg-amber-500", text: "text-amber-400" };
      case "MEDIUM":
        return { bg: "bg-yellow-400", text: "text-yellow-300" };
      case "LOW":
        return { bg: "bg-sky-400", text: "text-sky-300" };
      default:
        return { bg: "bg-zinc-500", text: "text-zinc-400" };
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 p-5 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
        <h4 className="font-display text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
          Alert Severity Distribution
        </h4>
        <span className="font-mono text-xs text-zinc-400">Total: {total}</span>
      </div>

      <div className="mt-4 space-y-3">
        {entries.length === 0 ? (
          <p className="text-xs text-zinc-500 font-mono">No active alerts recorded</p>
        ) : (
          entries.map(([k, v]) => {
            const pct = total > 0 ? Math.round((v / total) * 100) : 0;
            const style = getSeverityStyle(k);
            return (
              <div key={k} className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className={}>{k}</span>
                  <span className="text-zinc-400">
                    {v} <span className="text-zinc-600">({pct}%)</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-900 border border-zinc-800">
                  <div
                    className={}
                    style={{ width:  }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function RulesBarChart({ title, data }: { title: string; data: Record<string, number> }) {
  const entries = Object.entries(data);
  const max = Math.max(...entries.map(([, v]) => v), 1);

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 p-5 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
        <h4 className="font-display text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-sky-400" />
          {title}
        </h4>
        <span className="font-mono text-xs text-zinc-400">{entries.length} Status Groups</span>
      </div>

      <div className="mt-4 space-y-3">
        {entries.length === 0 ? (
          <p className="text-xs text-zinc-500 font-mono">No alert status distribution data</p>
        ) : (
          entries.map(([k, v]) => (
            <div key={k} className="space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="truncate max-w-[200px] text-zinc-300 font-medium">{k}</span>
                <span className="text-sky-400 font-semibold">{v}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-900 border border-zinc-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-500"
                  style={{ width:  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function StatsGrid({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open Incidents"
          value={stats.alerts_open ?? 0}
          sublabel="Requiring active response"
          icon={<AlertTriangleIcon className="h-5 w-5 text-rose-400" />}
        />
        <StatCard
          label="Events (24h)"
          value={stats.events_last_24h ?? 0}
          sublabel="Ingested in the last 24 hours"
          icon={<ShieldCheckIcon className="h-5 w-5 text-sky-400" />}
        />
        <StatCard
          label="Connected Nodes"
          value={stats.servers_total ?? 0}
          sublabel="Agent heartbeat nominal"
          icon={<ServerIcon className="h-5 w-5 text-emerald-400" />}
        />
        <StatCard
          label="Active Agents"
          value={stats.agents_active ?? 0}
          sublabel="Active agent heartbeats"
          icon={<ActivityIcon className="h-5 w-5 text-amber-400" />}
        />
      </div>

      {/* Advanced Telemetry Section: 24h Area Chart + Posture Gauge */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ThreatTimelineChart />
        </div>
        <div>
          <SecurityPostureGauge />
        </div>
      </div>

      {/* Telemetry Breakdown: Severity + Status */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SeverityBreakdownChart data={stats.alerts_by_severity || {}} />
        <RulesBarChart title="Alerts by Status" data={stats.alerts_by_status || {}} />
      </div>
    </div>
  );
}
