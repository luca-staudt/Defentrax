import type { DashboardStats } from "@/lib/types";

function StatCard({
  label,
  value,
  hint,
  icon,
  glowColor = "sky",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  glowColor?: "sky" | "rose" | "emerald" | "amber";
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 p-5 shadow-xl backdrop-blur-md transition-all hover:border-sky-500/40">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">{label}</p>
          <p className="font-display mt-2 text-3xl font-bold tracking-tight text-white">{value}</p>
        </div>
        {icon ? (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-950/40 text-sky-400">
            {icon}
          </div>
        ) : null}
      </div>
      {hint ? (
        <div className="mt-3 flex items-center gap-1.5 border-t border-zinc-800/50 pt-2 text-[11px] font-mono text-zinc-400">
          <span className="h-1 w-1 rounded-full bg-sky-400" />
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function SeverityBreakdownChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data);
  const total = entries.reduce((acc, [, v]) => acc + v, 0);

  const getSeverityColor = (sev: string) => {
    switch (sev.toUpperCase()) {
      case "CRITICAL":
        return "bg-rose-500 text-rose-400 border-rose-500/30";
      case "HIGH":
        return "bg-amber-500 text-amber-400 border-amber-500/30";
      case "MEDIUM":
        return "bg-yellow-400 text-yellow-300 border-yellow-500/30";
      case "LOW":
        return "bg-sky-400 text-sky-300 border-sky-500/30";
      default:
        return "bg-zinc-500 text-zinc-400 border-zinc-700/30";
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#090e1a]/80 to-[#040812]/80 p-5 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
        <h4 className="font-display text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
          Severity Distribution
        </h4>
        <span className="font-mono text-xs text-zinc-400">Total: {total}</span>
      </div>

      <div className="mt-4 space-y-3">
        {entries.length === 0 ? (
          <p className="text-xs text-zinc-500 font-mono">No telemetry data recorded</p>
        ) : (
          entries.map(([k, v]) => {
            const pct = total > 0 ? Math.round((v / total) * 100) : 0;
            const colorClass = getSeverityColor(k);
            return (
              <div key={k} className="space-y-1">
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-zinc-300 font-medium uppercase">{k}</span>
                  <span className="text-zinc-400">
                    {v} <span className="text-zinc-600">({pct}%)</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-900 border border-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${colorClass.split(" ")[0]}`}
                    style={{ width: `${pct}%` }}
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

function RulesBarChart({
  title,
  data,
}: {
  title: string;
  data: Record<string, number>;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div className="rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#090e1a]/80 to-[#040812]/80 p-5 shadow-xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-zinc-800/60 pb-3">
        <h4 className="font-display text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-sky-400" />
          {title}
        </h4>
        <span className="font-mono text-xs text-zinc-400">{entries.length} Active Rules</span>
      </div>

      <div className="mt-4 space-y-3">
        {entries.length === 0 ? (
          <p className="text-xs text-zinc-500 font-mono">No triggered detection rules</p>
        ) : (
          entries.slice(0, 5).map(([k, v]) => (
            <div key={k} className="space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="truncate max-w-[200px] text-zinc-300 font-medium">{k}</span>
                <span className="text-sky-400 font-semibold">{v} triggers</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-900 border border-zinc-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400 transition-all duration-500 shadow-[0_0_8px_rgba(56,189,248,0.5)]"
                  style={{ width: `${(v / max) * 100}%` }}
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
      {/* 4 Cyber Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Open Incidents"
          value={stats.open_alerts ?? 0}
          hint="Requiring active response"
          icon={
            <svg className="h-5 w-5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
        <StatCard
          label="Total Alerts (24h)"
          value={stats.total_alerts ?? 0}
          hint="Processed by Defentrax rules"
          icon={
            <svg className="h-5 w-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          }
        />
        <StatCard
          label="Connected Nodes"
          value={stats.server_count ?? stats.servers_count ?? 0}
          hint="Agent heartbeat nominal"
          icon={
            <svg className="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          }
        />
        <StatCard
          label="Security Events"
          value={stats.event_count ?? stats.events_count ?? 0}
          hint="Ingested telemetry buffer"
          icon={
            <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
      </div>

      {/* Cyber Telemetry Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SeverityBreakdownChart data={stats.alerts_by_severity || {}} />
        <RulesBarChart title="Top Triggered Detection Rules" data={stats.alerts_by_rule || {}} />
      </div>
    </div>
  );
}
