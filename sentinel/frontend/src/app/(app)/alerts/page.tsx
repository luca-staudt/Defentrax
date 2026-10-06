"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api/client";
import { canSeePage } from "@/lib/pages";
import type { Alert } from "@/lib/types";

export default function AlertsPage() {
  const { user } = useAuth();
  const canDetail = canSeePage(user, "alert_detail");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (status) q.set("status", status);
      if (severity) q.set("severity", severity);
      const res = await apiFetch<{ alerts: Alert[]; total: number }>(`/alerts?${q}`);
      setAlerts(res.alerts || []);
      setTotal(res.total || 0);
    } finally {
      setLoading(false);
    }
  }, [offset, severity, status]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-white">Alerts</h1>
        <p className="text-sm text-zinc-500">{total} total</p>
      </header>

      <div className="flex flex-wrap gap-3">
        <select
          value={status}
          onChange={(e) => {
            setOffset(0);
            setStatus(e.target.value);
          }}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {["OPEN", "ACKNOWLEDGED", "INVESTIGATING", "RESOLVED"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={severity}
          onChange={(e) => {
            setOffset(0);
            setSeverity(e.target.value);
          }}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value="">All severities</option>
          {["critical", "high", "medium", "low", "info"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : alerts.length === 0 ? (
        <EmptyState title="No alerts match filters" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-900/80 text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Events</th>
                <th className="px-4 py-3">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {alerts.map((a) => (
                <tr key={a.id} className="hover:bg-zinc-900/50">
                  <td className="px-4 py-3">
                    {canDetail ? (
                      <Link href={`/alerts/${a.id}`} className="font-medium text-brand-300 hover:underline">
                        {a.title}
                      </Link>
                    ) : (
                      <span className="font-medium text-zinc-100">{a.title}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={a.severity} />
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{a.event_count}</td>
                  <td className="px-4 py-3 text-zinc-500">{a.last_seen_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between text-sm">
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => setOffset((o) => Math.max(0, o - limit))}
          className="rounded border border-zinc-700 px-3 py-1 disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-zinc-500">
          {offset + 1}–{Math.min(offset + limit, total)} of {total}
        </span>
        <button
          type="button"
          disabled={offset + limit >= total}
          onClick={() => setOffset((o) => o + limit)}
          className="rounded border border-zinc-700 px-3 py-1 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
