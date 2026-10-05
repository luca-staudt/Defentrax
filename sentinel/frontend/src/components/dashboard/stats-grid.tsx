import type { DashboardStats } from "@/lib/types";

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-gradient-to-br from-zinc-950 to-zinc-900/80 p-5 shadow-lg shadow-black/40">
      <p className="text-xs uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="font-display mt-2 text-3xl font-semibold text-white">{value}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function BarChart({
  title,
  data,
}: {
  title: string;
  data: Record<string, number>;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-5">
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      <div className="mt-4 space-y-3">
        {entries.length === 0 ? (
          <p className="text-sm text-zinc-600">No data yet</p>
        ) : (
          entries.map(([k, v]) => (
            <div key={k}>
              <div className="mb-1 flex justify-between text-xs text-zinc-400">
                <span className="uppercase">{k}</span>
                <span>{v}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-900">
                <div
                  className="h-full rounded-full bg-brand-500"
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open alerts" value={stats.alerts_open} />
        <StatCard label="Events (24h)" value={stats.events_last_24h} />
        <StatCard label="Servers" value={stats.servers_total} />
        <StatCard label="Active agents" value={stats.agents_active} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BarChart title="Open alerts by severity" data={stats.alerts_by_severity} />
        <BarChart title="Events by severity (24h)" data={stats.events_by_severity_24h} />
      </div>
    </div>
  );
}
