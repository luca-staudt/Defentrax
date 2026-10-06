"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { SearchIcon, FilterIcon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";
import { formatAlertTimeShort } from "@/lib/alerts";
import { apiFetch } from "@/lib/api/client";
import { useAuth } from "@/context/auth-context";
import { canSeePage } from "@/lib/pages";
import type { EventRow } from "@/lib/types";

const SEVERITY_FILTERS = ["", "critical", "high", "medium", "low", "info"] as const;

export default function EventsPage() {
  const { user } = useAuth();
  const canServer = canSeePage(user, "server_detail");

  const [events, setEvents] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [severity, setSeverity] = useState("");
  const [source, setSource] = useState("");
  const [sourceDraft, setSourceDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inspect, setInspect] = useState<EventRow | null>(null);
  const limit = 40;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (q) params.set("q", q);
      if (severity) params.set("severity", severity);
      if (source) params.set("source", source);
      const res = await apiFetch<{ events: EventRow[]; total: number }>(
        `/events?${params}`,
      );
      setEvents(res.events || []);
      setTotal(res.total || 0);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load events");
    } finally {
      setLoading(false);
    }
  }, [offset, q, severity, source]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyFilters(e?: FormEvent) {
    e?.preventDefault();
    setOffset(0);
    setQ(qDraft.trim());
    setSource(sourceDraft.trim());
  }

  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + limit, total);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white flex flex-wrap items-center gap-2">
            Events
            <span className="rounded-md border border-zinc-700 bg-zinc-900/60 px-2.5 py-0.5 font-mono text-xs text-zinc-400">
              {total.toLocaleString()} total
            </span>
          </h1>
          <p className="mt-1 font-mono text-xs text-zinc-400">
            Ingested telemetry from agents — search, filter, and inspect rows
          </p>
        </div>
      </header>

      <form
        onSubmit={applyFilters}
        className="flex flex-col gap-3 rounded-xl border border-zinc-800/80 bg-zinc-950/50 p-4"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              placeholder="Search message…"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950/70 py-2.5 pl-10 pr-4 font-mono text-xs text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500/40"
            />
          </div>
          <input
            value={sourceDraft}
            onChange={(e) => setSourceDraft(e.target.value)}
            placeholder="Source (e.g. auth, docker)"
            className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2.5 font-mono text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-sky-500 lg:w-56"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-brand-400"
          >
            Apply
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-950/50 p-1 w-fit">
          <FilterIcon className="ml-1 h-3.5 w-3.5 text-zinc-500" />
          {SEVERITY_FILTERS.map((sev) => (
            <button
              key={sev || "all"}
              type="button"
              onClick={() => {
                setSeverity(sev);
                setOffset(0);
              }}
              className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-semibold transition ${
                severity === sev
                  ? "bg-sky-500 text-black"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {sev ? sev.toUpperCase() : "ALL"}
            </button>
          ))}
        </div>
      </form>

      {loading ? (
        <LoadingBlock label="Loading events…" />
      ) : error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 font-mono text-xs text-rose-300">
          {error}
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          title="No events match"
          description={
            q || severity || source
              ? "Try clearing filters or broadening your search."
              : "Ingest events via enrolled agents, or seed data in development."
          }
          action={
            q || severity || source ? (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  setQDraft("");
                  setSource("");
                  setSourceDraft("");
                  setSeverity("");
                  setOffset(0);
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
                  <th className="px-4 py-3">Received</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Host</th>
                  <th className="px-4 py-3">Server</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3 text-right"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {events.map((ev) => (
                  <tr key={ev.id} className="align-top transition-colors hover:bg-sky-950/15">
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                      {formatAlertTimeShort(ev.received_at)}
                    </td>
                    <td className="px-4 py-3">
                      <SeverityBadge severity={ev.severity} />
                    </td>
                    <td className="px-4 py-3 text-zinc-300">{ev.source || "—"}</td>
                    <td className="px-4 py-3 text-zinc-500">{ev.category || "—"}</td>
                    <td className="px-4 py-3 text-zinc-400">{ev.host || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {canServer && ev.server_id ? (
                        <Link
                          href={`/servers/${ev.server_id}`}
                          className="text-sky-400 hover:text-sky-300"
                          title={ev.server_id}
                        >
                          {ev.server_id.slice(0, 8)}…
                        </Link>
                      ) : (
                        <span className="text-zinc-500" title={ev.server_id}>
                          {ev.server_id ? `${ev.server_id.slice(0, 8)}…` : "—"}
                        </span>
                      )}
                    </td>
                    <td className="max-w-xl px-4 py-3 text-zinc-200">
                      <p className="line-clamp-2 font-sans text-sm leading-snug">
                        {ev.message}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setInspect(ev)}
                        className="rounded-md border border-sky-500/30 bg-sky-950/40 px-2.5 py-1 text-[11px] font-semibold text-sky-400 transition hover:bg-sky-500 hover:text-black"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <button
          type="button"
          disabled={offset === 0 || loading}
          onClick={() => setOffset((o) => Math.max(0, o - limit))}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 disabled:opacity-40 hover:border-zinc-500"
        >
          Previous
        </button>
        <span className="font-mono text-xs text-zinc-500">
          {rangeStart}–{rangeEnd} of {total.toLocaleString()}
        </span>
        <button
          type="button"
          disabled={offset + limit >= total || loading}
          onClick={() => setOffset((o) => o + limit)}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 disabled:opacity-40 hover:border-zinc-500"
        >
          Next
        </button>
      </div>

      {inspect ? (
        <Modal
          isOpen={true}
          onClose={() => setInspect(null)}
          title="Event detail"
          subtitle={`${inspect.source || "unknown"} · ${inspect.category || "—"}`}
          maxWidth="max-w-2xl"
          footer={
            <div className="flex w-full items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-zinc-500">
                Occurred {formatAlertTimeShort(inspect.occurred_at)}
              </span>
              {canServer && inspect.server_id ? (
                <Link
                  href={`/servers/${inspect.server_id}`}
                  className="rounded-lg bg-sky-500 px-3 py-1.5 font-mono text-xs font-semibold text-black hover:bg-sky-400"
                >
                  Open server
                </Link>
              ) : null}
            </div>
          }
        >
          <div className="space-y-3 font-mono text-xs">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Severity">
                <SeverityBadge severity={inspect.severity} />
              </Field>
              <Field label="Source">
                <span className="text-zinc-200">{inspect.source || "—"}</span>
              </Field>
              <Field label="Category">
                <span className="text-zinc-200">{inspect.category || "—"}</span>
              </Field>
              <Field label="Host">
                <span className="text-zinc-200">{inspect.host || "—"}</span>
              </Field>
              <Field label="Received">
                <span className="text-zinc-200">
                  {formatAlertTimeShort(inspect.received_at)}
                </span>
              </Field>
              <Field label="Occurred">
                <span className="text-zinc-200">
                  {formatAlertTimeShort(inspect.occurred_at)}
                </span>
              </Field>
            </div>
            <Field label="Message">
              <p className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-200">
                {inspect.message}
              </p>
            </Field>
            <Field label="Event ID">
              <span className="break-all text-zinc-400">{inspect.id}</span>
            </Field>
            <Field label="Server ID">
              <span className="break-all text-zinc-400">
                {inspect.server_id || "—"}
              </span>
            </Field>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3">
      <span className="mb-1 block text-[10px] uppercase text-zinc-500">{label}</span>
      {children}
    </div>
  );
}
