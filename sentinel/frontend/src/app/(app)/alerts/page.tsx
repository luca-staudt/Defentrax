"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { Modal } from "@/components/ui/modal";
import { SearchIcon, FilterIcon, CopyIcon } from "@/components/ui/icons";
import {
  alertActionLabel,
  formatAlertTime,
  formatAlertTimeShort,
  isAlertActive,
  nextAlertStatuses,
} from "@/lib/alerts";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { copyText } from "@/lib/clipboard";
import { useAuth } from "@/context/auth-context";
import { hasPermission } from "@/lib/permissions";
import { canSeePage } from "@/lib/pages";
import type { Alert } from "@/lib/types";

const STATUS_FILTERS = ["ALL", "OPEN", "ACKNOWLEDGED", "INVESTIGATING", "RESOLVED"] as const;
const SEVERITY_FILTERS = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;

export default function AlertsPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, "alerts", "write");
  const canServer = canSeePage(user, "server_detail");

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("ALL");
  const [inspectAlert, setInspectAlert] = useState<Alert | null>(null);
  const [modalTab, setModalTab] = useState<"overview" | "raw" | "remediation">("overview");
  const [copied, setCopied] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (selectedStatus !== "ALL") params.set("status", selectedStatus);
      if (selectedSeverity !== "ALL") {
        params.set("severity", selectedSeverity.toLowerCase());
      }
      const res = await apiFetch<{ alerts: Alert[]; total: number }>(
        `/alerts?${params}`,
      );
      setAlerts(res.alerts || []);
      setTotal(res.total ?? (res.alerts || []).length);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [selectedStatus, selectedSeverity]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredAlerts = alerts.filter((a) => {
    if (search === "") return true;
    const q = search.toLowerCase();
    return (
      a.title.toLowerCase().includes(q) ||
      (a.description || "").toLowerCase().includes(q) ||
      (a.rule_id && a.rule_id.toLowerCase().includes(q)) ||
      (a.server_id && a.server_id.toLowerCase().includes(q)) ||
      (a.source_ip && a.source_ip.toLowerCase().includes(q))
    );
  });

  const activeCount = filteredAlerts.filter((a) => isAlertActive(a.status)).length;

  async function handleCopy(payload: string) {
    const result = await copyText(payload);
    if (result.ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  async function patchAlert(alert: Alert, status: string) {
    if (!canWrite || actionBusy) return;
    setActionBusy(alert.id);
    setActionError(null);
    try {
      await apiFetch(`/alerts/${alert.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
      if (inspectAlert?.id === alert.id) {
        const res = await apiFetch<{ alert: Alert }>(`/alerts/${alert.id}`);
        setInspectAlert(res.alert);
      }
    } catch (e) {
      setActionError(
        e instanceof ApiRequestError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Failed to update alert",
      );
    } finally {
      setActionBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white flex flex-wrap items-center gap-2">
            Alerts
            <span className="rounded-md border border-sky-500/30 bg-sky-950/40 px-2.5 py-0.5 font-mono text-xs text-sky-400">
              {activeCount} active
            </span>
            <span className="rounded-md border border-zinc-700 bg-zinc-900/60 px-2.5 py-0.5 font-mono text-xs text-zinc-400">
              {total} total
            </span>
          </h1>
          <p className="mt-1 font-mono text-xs text-zinc-400">
            Detection matches across enrolled servers — acknowledge, investigate, or resolve
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by title, rule, server, or source IP…"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 py-2.5 pl-10 pr-4 font-mono text-xs text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/50 p-1">
            {STATUS_FILTERS.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setSelectedStatus(st)}
                className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
                  selectedStatus === st
                    ? "bg-sky-500 text-black"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {st === "ACKNOWLEDGED" ? "ACK" : st === "INVESTIGATING" ? "INV" : st}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/50 p-1">
            <FilterIcon className="ml-1 h-3.5 w-3.5 text-zinc-500" />
            {SEVERITY_FILTERS.map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSelectedSeverity(sev)}
                className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold transition ${
                  selectedSeverity === sev
                    ? "border border-sky-500/40 bg-zinc-800 text-sky-400"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>
      </div>

      {actionError ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 font-mono text-xs text-rose-300">
          {actionError}
        </div>
      ) : null}

      {loading ? (
        <LoadingBlock label="Loading alerts…" />
      ) : error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 font-mono text-xs text-rose-300">
          {error}
        </div>
      ) : filteredAlerts.length === 0 ? (
        <EmptyState
          title={alerts.length === 0 ? "No alerts yet" : "No alerts match"}
          description={
            alerts.length === 0
              ? "When detection rules fire, incidents will appear here."
              : "Try clearing status or severity filters, or broaden your search."
          }
          action={
            selectedStatus !== "ALL" || selectedSeverity !== "ALL" || search ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedStatus("ALL");
                  setSelectedSeverity("ALL");
                  setSearch("");
                }}
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white"
              >
                Clear filters
              </button>
            ) : null
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/40">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-zinc-800/80 bg-zinc-950/60 text-[11px] uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Server</th>
                  <th className="px-4 py-3">Hits</th>
                  <th className="px-4 py-3">First / Last</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredAlerts.map((alert) => {
                  const quick = nextAlertStatuses(alert.status);
                  const resolveTarget = quick.includes("RESOLVED")
                    ? "RESOLVED"
                    : quick.includes("OPEN")
                      ? "OPEN"
                      : null;
                  return (
                    <tr key={alert.id} className="transition-colors hover:bg-sky-950/15">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <SeverityBadge severity={alert.severity} />
                      </td>
                      <td className="px-4 py-3 min-w-[14rem]">
                        <div className="font-semibold text-white">{alert.title}</div>
                        <div className="mt-0.5 max-w-md truncate text-[11px] text-zinc-400">
                          {alert.description}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusBadge status={alert.status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {canServer ? (
                          <Link
                            href={`/servers/${alert.server_id}`}
                            className="text-sky-400 hover:text-sky-300"
                            title={alert.server_id}
                          >
                            {alert.server_id.slice(0, 8)}…
                          </Link>
                        ) : (
                          <span className="text-zinc-400" title={alert.server_id}>
                            {alert.server_id.slice(0, 8)}…
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-zinc-300">
                        {alert.event_count || 1}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-[11px] text-zinc-400">
                        <div>{formatAlertTimeShort(alert.first_seen_at)}</div>
                        <div className="text-zinc-500">
                          {formatAlertTimeShort(alert.last_seen_at)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                          {canWrite && resolveTarget ? (
                            <button
                              type="button"
                              disabled={actionBusy === alert.id}
                              onClick={() => void patchAlert(alert, resolveTarget)}
                              className="rounded-md border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-50"
                            >
                              {actionBusy === alert.id
                                ? "…"
                                : alertActionLabel(resolveTarget)}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              setInspectAlert(alert);
                              setModalTab("overview");
                            }}
                            className="rounded-md border border-sky-500/30 bg-sky-950/40 px-2.5 py-1 text-[11px] font-semibold text-sky-400 transition hover:bg-sky-500 hover:text-black"
                          >
                            Inspect
                          </button>
                          <Link
                            href={`/alerts/${alert.id}`}
                            className="rounded-md border border-zinc-700 bg-zinc-900/80 px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                          >
                            Details
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {inspectAlert ? (
        <Modal
          isOpen={true}
          onClose={() => setInspectAlert(null)}
          title={inspectAlert.title}
          subtitle={`Server ${inspectAlert.server_id.slice(0, 8)}… · Rule ${inspectAlert.rule_id || "—"}`}
          maxWidth="max-w-3xl"
          footer={
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-zinc-500">
                Opened {formatAlertTime(inspectAlert.opened_at)}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {canWrite
                  ? nextAlertStatuses(inspectAlert.status).map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={actionBusy === inspectAlert.id}
                        onClick={() => void patchAlert(inspectAlert, s)}
                        className={
                          s === "RESOLVED" || s === "OPEN"
                            ? "rounded-lg bg-brand-500 px-3 py-1.5 font-mono text-xs font-semibold text-black hover:bg-brand-400 disabled:opacity-50"
                            : "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
                        }
                      >
                        {alertActionLabel(s)}
                      </button>
                    ))
                  : null}
                <button
                  type="button"
                  onClick={() =>
                    void handleCopy(JSON.stringify(inspectAlert, null, 2))
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-300 transition hover:border-sky-500 hover:text-white"
                >
                  <CopyIcon className="h-3.5 w-3.5 text-sky-400" />
                  {copied ? "Copied" : "Copy JSON"}
                </button>
                <Link
                  href={`/alerts/${inspectAlert.id}`}
                  className="rounded-lg bg-sky-500 px-4 py-1.5 font-mono text-xs font-semibold text-black transition hover:bg-sky-400"
                >
                  Open detail
                </Link>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/70 p-1">
              {[
                { id: "overview" as const, label: "Overview" },
                { id: "raw" as const, label: "Raw JSON" },
                { id: "remediation" as const, label: "Response" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setModalTab(tab.id)}
                  className={`flex-1 rounded-md py-1.5 text-center font-mono text-xs font-semibold transition ${
                    modalTab === tab.id
                      ? "bg-sky-500 text-black"
                      : "text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {modalTab === "overview" && (
              <div className="space-y-4 font-mono text-xs">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="Severity">
                    <SeverityBadge severity={inspectAlert.severity} />
                  </Stat>
                  <Stat label="Status">
                    <StatusBadge status={inspectAlert.status} />
                  </Stat>
                  <Stat label="Hits">
                    <span className="font-display text-lg font-bold text-sky-400">
                      {inspectAlert.event_count || 1}
                    </span>
                  </Stat>
                  <Stat label="Rule">
                    <span className="truncate text-white">
                      {inspectAlert.rule_id || "—"}
                    </span>
                  </Stat>
                </div>

                <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-4">
                  <span className="mb-1 block text-[10px] uppercase text-zinc-500">
                    Summary
                  </span>
                  <p className="font-sans text-sm leading-relaxed text-zinc-200">
                    {inspectAlert.description || "No description."}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Stat label="Server">
                    {canServer ? (
                      <Link
                        href={`/servers/${inspectAlert.server_id}`}
                        className="break-all text-[11px] text-sky-400 hover:text-sky-300"
                      >
                        {inspectAlert.server_id}
                      </Link>
                    ) : (
                      <span className="break-all text-[11px] text-zinc-300">
                        {inspectAlert.server_id}
                      </span>
                    )}
                  </Stat>
                  <Stat label="Alert ID">
                    <span className="break-all text-[11px] text-zinc-300">
                      {inspectAlert.id}
                    </span>
                  </Stat>
                  <Stat label="First seen">
                    <span className="text-zinc-300">
                      {formatAlertTime(inspectAlert.first_seen_at)}
                    </span>
                  </Stat>
                  <Stat label="Last seen">
                    <span className="text-zinc-300">
                      {formatAlertTime(inspectAlert.last_seen_at)}
                    </span>
                  </Stat>
                </div>
              </div>
            )}

            {modalTab === "raw" && (
              <pre className="max-h-80 overflow-auto rounded-lg border border-zinc-800 bg-[#04070d] p-4 font-mono text-xs text-sky-300">
                {JSON.stringify(inspectAlert, null, 2)}
              </pre>
            )}

            {modalTab === "remediation" && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-4 font-mono text-xs">
                <h5 className="font-semibold text-amber-400">Suggested next steps</h5>
                <ol className="mt-2 list-decimal space-y-1 pl-4 font-sans text-xs leading-relaxed text-zinc-300">
                  <li>
                    Review processes and auth activity on server{" "}
                    <span className="font-mono">{inspectAlert.server_id.slice(0, 8)}…</span>{" "}
                    around {formatAlertTime(inspectAlert.first_seen_at)}.
                  </li>
                  <li>Correlate related events under Events filtered by this host.</li>
                  <li>
                    Acknowledge while investigating, then mark resolved with notes when closed.
                  </li>
                </ol>
              </div>
            )}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3">
      <span className="mb-1 block text-[10px] uppercase text-zinc-500">{label}</span>
      <div className="mt-1">{children}</div>
    </div>
  );
}
