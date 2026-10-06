"use client";

import { useEffect, useState } from "react";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api/client";
import { canSeePage } from "@/lib/pages";
import type { Alert, DashboardStats } from "@/lib/types";
import { connectAlertSocket } from "@/lib/ws";
import Link from "next/link";

export default function DashboardPage() {
  const { user } = useAuth();
  const canAlerts = canSeePage(user, "alerts");
  const canAlertDetail = canSeePage(user, "alert_detail");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);

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

  return (
    <div className="space-y-8">
      {/* Top Banner / Heading */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs text-sky-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            LIVE SECURITY COMMAND CENTER
          </div>
          <h1 className="font-display mt-1 text-2xl font-bold tracking-tight text-white md:text-3xl">
            Security Overview
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            Continuous threat evaluation & telemetry ingestion across monitored infrastructure
          </p>
        </div>

        {canAlerts && (
          <Link
            href="/alerts"
            className="inline-flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-2 text-xs font-semibold text-sky-300 shadow-lg shadow-sky-500/10 transition hover:bg-sky-500/20 hover:text-white"
          >
            <span>All Alerts Console</span>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </Link>
        )}
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/20 p-4 text-xs font-mono text-rose-300">
          Telemetry stream connection error: {error}
        </div>
      ) : null}

      {loading ? (
        <LoadingBlock label="Syncing Defentrax SIEM Telemetry..." />
      ) : stats ? (
        <StatsGrid stats={stats} />
      ) : null}

      {/* Real-time Alert Queue */}
      {canAlerts && (
        <div className="rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#090e1a]/80 to-[#040812]/80 p-6 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4">
            <div>
              <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                Active Incident Stream
              </h2>
              <p className="text-xs text-zinc-400">Most recent high-priority security alerts</p>
            </div>
            <span className="font-mono text-xs text-zinc-400">
              Showing top {alerts.length}
            </span>
          </div>

          <div className="mt-4 divide-y divide-zinc-800/50">
            {alerts.length === 0 ? (
              <EmptyState
                title="No Open Security Incidents"
                description="Infrastructure state is nominal. No open alerts detected by Defentrax rules."
              />
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="group flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-zinc-900/30 px-2 rounded-xl"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm text-zinc-100 group-hover:text-sky-300 transition-colors">
                        {alert.title}
                      </p>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs font-mono text-zinc-500">
                      <span>ID: #{alert.id}</span>
                      <span>•</span>
                      <span>Last seen: {new Date(alert.last_seen_at || Date.now()).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <StatusBadge status={alert.status} />
                    <SeverityBadge severity={alert.severity} />

                    {/* Quick Inspect Button */}
                    <button
                      type="button"
                      onClick={() => setSelectedAlert(alert)}
                      className="rounded-lg border border-zinc-800 px-2.5 py-1 text-xs font-mono text-zinc-400 hover:border-sky-500/50 hover:bg-sky-500/10 hover:text-sky-300 transition"
                    >
                      Inspect
                    </button>

                    {canAlertDetail && (
                      <Link
                        href={`/alerts/${alert.id}`}
                        className="rounded-lg border border-zinc-800 p-1.5 text-zinc-400 hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-300 transition"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Incident Quick Inspect Modal */}
      {selectedAlert && (
        <Modal
          isOpen={!!selectedAlert}
          onClose={() => setSelectedAlert(null)}
          title={`Incident Inspection #${selectedAlert.id}`}
          subtitle={selectedAlert.title}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 font-mono text-xs">
              <div>
                <span className="text-zinc-500 block uppercase">Severity</span>
                <div className="mt-1">
                  <SeverityBadge severity={selectedAlert.severity} />
                </div>
              </div>
              <div>
                <span className="text-zinc-500 block uppercase">Status</span>
                <div className="mt-1">
                  <StatusBadge status={selectedAlert.status} />
                </div>
              </div>
              <div>
                <span className="text-zinc-500 block uppercase">Trigger Count</span>
                <span className="mt-1 block text-zinc-200 font-bold">{selectedAlert.event_count ?? 1} events</span>
              </div>
              <div>
                <span className="text-zinc-500 block uppercase">Rule Trigger</span>
                <span className="mt-1 block text-sky-400 truncate">{selectedAlert.rule_id || "Detection rule"}</span>
              </div>
            </div>

            <div>
              <h4 className="font-mono text-xs font-semibold text-zinc-400 uppercase">Alert Payload Data</h4>
              <pre className="mt-2 overflow-x-auto rounded-xl border border-zinc-800 bg-black/60 p-4 font-mono text-xs text-sky-200">
                {JSON.stringify(selectedAlert, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedAlert(null)}
                className="rounded-xl border border-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-900"
              >
                Close
              </button>
              {canAlertDetail && (
                <Link
                  href={`/alerts/${selectedAlert.id}`}
                  className="rounded-xl border border-sky-500/40 bg-sky-500/20 px-4 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/30"
                >
                  Open Full Incident Record
                </Link>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
