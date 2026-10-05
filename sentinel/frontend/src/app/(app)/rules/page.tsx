"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import type { Rule } from "@/lib/types";

export default function RulesPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, "rules", "write");
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch<{ rules: Rule[] }>("/rules");
        setRules(res.rules || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggleRule(id: string, enabled: boolean) {
    if (!canWrite) return;
    await apiFetch(`/rules/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !enabled }),
    });
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r)),
    );
  }

  if (loading) return <LoadingBlock />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-white">Detection rules</h1>
        <p className="text-sm text-zinc-500">Read-only view; enable/disable when permitted</p>
      </header>
      {rules.length === 0 ? (
        <EmptyState title="No rules loaded" description="Bootstrap detection rules on the API." />
      ) : (
        <ul className="space-y-3">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="flex flex-col gap-3 rounded-xl border border-zinc-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium text-zinc-100">{rule.name}</p>
                <p className="text-sm text-zinc-500">{rule.description}</p>
                <p className="mt-1 text-xs text-zinc-600">{rule.rule_id}</p>
              </div>
              <div className="flex items-center gap-3">
                <SeverityBadge severity={rule.severity} />
                {canWrite ? (
                  <button
                    type="button"
                    onClick={() => void toggleRule(rule.id, rule.enabled)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                      rule.enabled
                        ? "bg-emerald-500/20 text-emerald-200"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {rule.enabled ? "Enabled" : "Disabled"}
                  </button>
                ) : (
                  <span className="text-xs text-zinc-500">{rule.enabled ? "Enabled" : "Disabled"}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
