"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Modal } from "@/components/ui/modal";
import { SearchIcon, FilterIcon, CopyIcon } from "@/components/ui/icons";
import { apiFetch } from "@/lib/api/client";
import type { Alert } from "@/lib/types";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("ALL");
  const [inspectAlert, setInspectAlert] = useState<Alert | null>(null);
  const [modalTab, setModalTab] = useState<"overview" | "raw" | "remediation">("overview");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const query = selectedStatus === "ALL" ? "" : `?status=${selectedStatus}`;
        const res = await apiFetch<{ alerts: Alert[] }>(`/alerts${query}`);
        if (!cancelled) {
          setAlerts(res.alerts || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load alerts");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedStatus]);

  const filteredAlerts = alerts.filter((a) => {
    const matchesSearch =
      search === "" ||
      a.title.toLowerCase().includes(search.toLowerCase()) ||
      (a.rule_id && a.rule_id.toLowerCase().includes(search.toLowerCase())) ||
      (a.server_id && a.server_id.toLowerCase().includes(search.toLowerCase()));

    const matchesSeverity =
      selectedSeverity === "ALL" || a.severity?.toUpperCase() === selectedSeverity;

    return matchesSearch && matchesSeverity;
  });

  const handleCopy = (payload: string) => {
    navigator.clipboard.writeText(payload);
    setCopiedId(payload);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            Security Incidents & Alerts
            <span className="rounded-full border border-sky-500/30 bg-sky-950/40 px-2.5 py-0.5 font-mono text-xs text-sky-400">
              {filteredAlerts.length} Active
            </span>
          </h1>
          <p className="font-mono text-xs text-zinc-400 mt-1">Real-time threat detections across endpoints</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 p-4 shadow-xl backdrop-blur-md md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by title, rule ID, or server..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 py-2.5 pl-10 pr-4 font-mono text-xs text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-950/50 p-1">
            {["ALL", "OPEN", "RESOLVED"].map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                className={`rounded-lg px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
                  selectedStatus === st
                    ? "bg-sky-500 text-black shadow-[0_0_10px_rgba(0,163,255,0.4)]"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-950/50 p-1">
            <FilterIcon className="ml-1 h-3.5 w-3.5 text-zinc-500" />
            {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((sev) => (
              <button
                key={sev}
                onClick={() => setSelectedSeverity(sev)}
                className={`rounded-lg px-2 py-0.5 font-mono text-[10px] font-semibold transition ${
                  selectedSeverity === sev
                    ? "bg-zinc-800 text-sky-400 border border-sky-500/40"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Table Content */}
      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 font-mono text-xs text-rose-300">
          {error}
        </div>
      ) : filteredAlerts.length === 0 ? (
        <EmptyState
          title="No alerts match the criteria"
          description="Everything is currently quiet or your filters exclude all events."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 shadow-xl backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-zinc-800/80 bg-zinc-950/60 text-[11px] uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="px-5 py-3.5">Severity</th>
                  <th className="px-5 py-3.5">Title / Incident</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Hits</th>
                  <th className="px-5 py-3.5">First / Last Seen</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredAlerts.map((alert) => (
                  <tr key={alert.id} className="transition-colors hover:bg-sky-950/20">
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <SeverityBadge severity={alert.severity} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-white">{alert.title}</div>
                      <div className="text-[11px] text-zinc-400 truncate max-w-md">{alert.description}</div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <StatusBadge status={alert.status} />
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-zinc-300">
                      {alert.event_count || 1}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-[11px] text-zinc-400">
                      <div>{alert.first_seen_at ? new Date(alert.first_seen_at).toLocaleTimeString() : "-"}</div>
                      <div className="text-zinc-500">{alert.last_seen_at ? new Date(alert.last_seen_at).toLocaleTimeString() : "-"}</div>
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap space-x-2">
                      <button
                        onClick={() => {
                          setInspectAlert(alert);
                          setModalTab("overview");
                        }}
                        className="rounded-lg border border-sky-500/30 bg-sky-950/40 px-2.5 py-1 text-sky-400 transition hover:bg-sky-500 hover:text-black font-semibold text-[11px]"
                      >
                        Inspect
                      </button>
                      <Link
                        href={`/alerts/${alert.id}`}
                        className="rounded-lg border border-zinc-700 bg-zinc-900/80 px-2.5 py-1 text-zinc-300 transition hover:border-zinc-500 hover:text-white text-[11px]"
                      >
                        Details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* High-Tech HUD Forensics Modal */}
      {inspectAlert && (
        <Modal
          isOpen={true}
          onClose={() => setInspectAlert(null)}
          title={inspectAlert.title}
          subtitle={`Incident Target: ${inspectAlert.server_id} | Rule: ${inspectAlert.rule_id || "ANOMALY"}`}
          maxWidth="max-w-3xl"
          footer={
            <div className="flex w-full items-center justify-between">
              <span className="font-mono text-[11px] text-zinc-500">
                Created: {inspectAlert.opened_at ? new Date(inspectAlert.opened_at).toLocaleString() : "Real-time"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(JSON.stringify(inspectAlert, null, 2))}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-300 transition hover:border-sky-500 hover:text-white"
                >
                  <CopyIcon className="h-3.5 w-3.5 text-sky-400" />
                  {copiedId ? "Copied JSON!" : "Copy Payload"}
                </button>
                <Link
                  href={`/alerts/${inspectAlert.id}`}
                  className="rounded-lg bg-sky-500 px-4 py-1.5 font-mono text-xs font-semibold text-black transition hover:bg-sky-400 shadow-[0_0_12px_rgba(0,163,255,0.4)]"
                >
                  Open Incident Console
                </Link>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Modal Segmented Navigation Tabs */}
            <div className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-950/70 p-1">
              {[
                { id: "overview", label: "Incident Forensics" },
                { id: "raw", label: "Raw JSON Telemetry" },
                { id: "remediation", label: "Response Playbook" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setModalTab(tab.id as any)}
                  className={`flex-1 rounded-lg py-1.5 text-center font-mono text-xs font-semibold transition ${
                    modalTab === tab.id
                      ? "bg-sky-500 text-black shadow-[0_0_8px_rgba(0,163,255,0.4)]"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {modalTab === "overview" && (
              <div className="space-y-4 font-mono text-xs">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3">
                    <span className="text-[10px] uppercase text-zinc-500 block">Severity Level</span>
                    <div className="mt-1">
                      <SeverityBadge severity={inspectAlert.severity} />
                    </div>
                  </div>
                  <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3">
                    <span className="text-[10px] uppercase text-zinc-500 block">Lifecycle State</span>
                    <div className="mt-1">
                      <StatusBadge status={inspectAlert.status} />
                    </div>
                  </div>
                  <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3">
                    <span className="text-[10px] uppercase text-zinc-500 block">Event Hit Count</span>
                    <span className="mt-1 block font-display text-lg font-bold text-sky-400">
                      {inspectAlert.event_count || 1}
                    </span>
                  </div>
                  <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3">
                    <span className="text-[10px] uppercase text-zinc-500 block">Anomaly Rule ID</span>
                    <span className="mt-1 block font-mono text-xs font-medium text-white truncate">
                      {inspectAlert.rule_id || "CUSTOM"}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4">
                  <span className="text-[10px] uppercase text-zinc-500 block mb-1">Incident Summary</span>
                  <p className="text-zinc-200 leading-relaxed font-sans text-sm">
                    {inspectAlert.description || "Endpoint detection alert triggered by anomalous system activity."}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3">
                    <span className="text-[10px] uppercase text-zinc-500 block">Target Server ID</span>
                    <span className="mt-1 block text-zinc-300 font-mono text-[11px] break-all">{inspectAlert.server_id}</span>
                  </div>
                  <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3">
                    <span className="text-[10px] uppercase text-zinc-500 block">Alert Entity ID</span>
                    <span className="mt-1 block text-zinc-300 font-mono text-[11px] break-all">{inspectAlert.id}</span>
                  </div>
                </div>
              </div>
            )}

            {modalTab === "raw" && (
              <div className="relative">
                <pre className="max-h-80 overflow-auto rounded-xl border border-zinc-800 bg-[#04070d] p-4 font-mono text-xs text-sky-300 scrollbar-thin">
                  {JSON.stringify(inspectAlert, null, 2)}
                </pre>
              </div>
            )}

            {modalTab === "remediation" && (
              <div className="space-y-3 font-mono text-xs">
                <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
                  <h5 className="font-semibold text-amber-400 flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    Recommended Containment Strategy
                  </h5>
                  <p className="mt-2 text-zinc-300 font-sans text-xs leading-relaxed">
                    1. Verify the process binary checksum and originating PID on server {inspectAlert.server_id}.<br />
                    2. Check recent authentication events around {inspectAlert.first_seen_at ? new Date(inspectAlert.first_seen_at).toLocaleTimeString() : "detection time"}.<br />
                    3. If unauthorized activity is confirmed, isolate the host agent and revoke session tokens.
                  </p>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
