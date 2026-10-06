"use client";

import { useEffect, useState } from "react";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api/client";
import { canSeePage } from "@/lib/pages";
import type { Alert, DashboardStats } from "@/lib/types";
import { connectAlertSocket } from "@/lib/ws";
import Link from "next/link";

function AlertRow({ alert }: { alert: Alert }) {
  return (
    <>
      <div>
        <p className="font-medium text-zinc-100">{alert.title}</p>
        <p className="text-xs text-zinc-500">{alert.last_seen_at}</p>
      </div>
      <div className="flex gap-2">
        <StatusBadge status={alert.status} />
        <SeverityBadge severity={alert.severity} />
      </div>
    </>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const canAlerts = canSeePage(user, "alerts");
  const canAlertDetail = canSeePage(user, "alert_detail");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await apiFetch<DashboardStats>("/dashboard/stats");
        if (cancelled) return;
        setStats(s);
        if (canAlerts) {
          const a = await apiFetch<{ alerts: Alert[] }>("/alerts?limit=8&status=OPEN");
          if (!cancelled) setAlerts(a.alerts || []);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canAlerts]);

  useEffect(() => {
    if (!user || !canAlerts) return;
    return connectAlertSocket(user, () => {
      void apiFetch<DashboardStats>("/dashboard/stats").then(setStats).catch(() => undefined);
      void apiFetch<{ alerts: Alert[] }>("/alerts?limit=8&status=OPEN")
        .then((r) => setAlerts(r.alerts || []))
        .catch(() => undefined);
    });
  }, [user, canAlerts]);

  if (loading) return <LoadingBlock label="Loading dashboard…" />;
  if (error || !stats) {
    return <EmptyState title="Dashboard unavailable" description={error || undefined} />;
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl font-semibold text-white">Security overview</h1>
        <p className="mt-1 text-sm text-zinc-500">Live metrics from your Sentinel control plane</p>
      </header>
      <StatsGrid stats={stats} />
      {canAlerts ? (
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-400">Open alerts</h2>
          {canAlerts ? (
            <Link href="/alerts" className="text-sm text-brand-400 hover:text-brand-300">
              View all
            </Link>
          ) : null}
        </div>
        {alerts.length === 0 ? (
          <EmptyState title="No open alerts" description="Detection is quiet — or ingest more events." />
        ) : (
          <ul className="divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800">
            {alerts.map((a) => (
              <li key={a.id}>
                {canAlertDetail ? (
                  <Link
                    href={`/alerts/${a.id}`}
                    className="flex flex-col gap-2 px-4 py-3 transition hover:bg-zinc-900/60 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <AlertRow alert={a} />
                  </Link>
                ) : (
                  <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <AlertRow alert={a} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      ) : null}
    </div>
  );
}
