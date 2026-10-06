"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { CyberSwitch } from "@/components/ui/cyber-checkbox";
import { SearchIcon, ShieldCheckIcon } from "@/components/ui/icons";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import type { Rule } from "@/lib/types";

export default function RulesPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, "rules", "write");
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch<{ rules: Rule[] }>("/rules");
        setRules(res.rules || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load rules");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggleRule(id: string, enabled: boolean) {
    if (!canWrite) return;
    setBusyId(id);
    try {
      await apiFetch(`/rules/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !enabled }),
      });
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(
    () =>
      rules.filter((r) => {
        const q = search.toLowerCase();
        const matches =
          q === "" ||
          r.name.toLowerCase().includes(q) ||
          r.rule_id.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q);
        const sev = severityFilter === "ALL" || r.severity?.toUpperCase() === severityFilter;
        return matches && sev;
      }),
    [rules, search, severityFilter],
  );

  const enabledCount = rules.filter((r) => r.enabled).length;
  const counts = {
    critical: rules.filter((r) => r.severity?.toUpperCase() === "CRITICAL").length,
    high: rules.filter((r) => r.severity?.toUpperCase() === "HIGH").length,
  };

  if (loading) return <LoadingBlock />;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
            Detection Rules
            <span className="rounded-full border border-sky-500/30 bg-sky-950/40 px-2.5 py-0.5 font-mono text-xs text-sky-400">
              {rules.length} total · {enabledCount} armed
            </span>
          </h1>
          <p className="mt-1 font-mono text-xs text-zinc-400">
            Rule engine gates for endpoint anomaly scoring
          </p>
        </div>
      </header>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "RULES ARMED", value: enabledCount, tone: "text-emerald-400" },
          { label: "CRITICAL RULES", value: counts.critical, tone: "text-rose-400" },
          { label: "HIGH RULES", value: counts.high, tone: "text-amber-400" },
          { label: "TOTAL SIGNATURES", value: rules.length, tone: "text-sky-400" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 p-4 shadow-xl backdrop-blur-md"
          >
            <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">{s.label}</p>
            <p className={`font-display mt-1.5 text-2xl font-bold ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 p-4 shadow-xl backdrop-blur-md sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, ID or description..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 py-2.5 pl-10 pr-4 font-mono text-xs text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-950/50 p-1">
          {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`rounded-lg px-2 py-1 font-mono text-[10px] font-semibold transition ${
                severityFilter === sev
                  ? "bg-zinc-800 text-sky-400 border border-sky-500/40"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 font-mono text-xs text-rose-300">{error}</div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No rules match" description="Adjust your search or severity filter." />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((rule) => (
            <div
              key={rule.id}
              className={`relative overflow-hidden rounded-2xl border p-5 shadow-xl backdrop-blur-md transition-all ${
                rule.enabled
                  ? "border-sky-500/25 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90"
                  : "border-zinc-800/80 bg-zinc-950/60 opacity-70"
              }`}
            >
              {rule.enabled && (
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-sky-400 to-transparent opacity-60" />
              )}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                      rule.enabled
                        ? "border-sky-500/30 bg-sky-950/40 text-sky-400"
                        : "border-zinc-800 bg-zinc-900 text-zinc-600"
                    }`}
                  >
                    <ShieldCheckIcon className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="font-display text-sm font-semibold text-white">{rule.name}</p>
                    <p className="mt-0.5 text-xs leading-snug text-zinc-400">{rule.description}</p>
                    <p className="mt-1.5 font-mono text-[10px] text-zinc-600">{rule.rule_id}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <SeverityBadge severity={rule.severity} />
                  <CyberSwitch
                    checked={rule.enabled}
                    disabled={!canWrite || busyId === rule.id}
                    onChange={() => void toggleRule(rule.id, rule.enabled)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
