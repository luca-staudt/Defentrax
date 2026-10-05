"use client";

import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { apiFetch } from "@/lib/api/client";
import type { EventRow } from "@/lib/types";

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const limit = 30;

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
      const res = await apiFetch<{ events: EventRow[]; total: number }>(`/events?${params}`);
      setEvents(res.events || []);
      setTotal(res.total || 0);
    } finally {
      setLoading(false);
    }
  }, [offset, q, severity, source]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-white">Events</h1>
        <p className="text-sm text-zinc-500">Search and paginate ingested telemetry</p>
      </header>

      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          void load();
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search message…"
          className="min-w-[200px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
        />
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Source"
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
        />
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
        >
          <option value="">All severities</option>
          {["critical", "high", "medium", "low", "info"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-black">
          Apply
        </button>
      </form>

      {loading ? (
        <LoadingBlock />
      ) : events.length === 0 ? (
        <EmptyState title="No events" description="Ingest events via agents or seed data." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-900/80 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Host</th>
                <th className="px-4 py-3">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {events.map((ev) => (
                <tr key={ev.id} className="align-top hover:bg-zinc-900/40">
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-500">{ev.received_at}</td>
                  <td className="px-4 py-3">
                    <SeverityBadge severity={ev.severity} />
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{ev.source}</td>
                  <td className="px-4 py-3 text-zinc-400">{ev.host || "—"}</td>
                  <td className="max-w-xl px-4 py-3 text-zinc-200">{ev.message}</td>
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
