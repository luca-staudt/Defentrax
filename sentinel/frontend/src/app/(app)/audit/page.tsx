"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { apiFetch } from "@/lib/api/client";
import type { AuditLog } from "@/lib/types";

const inputClass =
  "rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand-500/60";

export default function AuditLogsPage() {
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [user, setUser] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const limit = 30;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (q.trim()) params.set("q", q.trim());
      if (action.trim()) params.set("action", action.trim());
      if (user.trim()) params.set("user", user.trim());
      if (since) {
        const d = new Date(since);
        if (!Number.isNaN(d.getTime())) params.set("since", d.toISOString());
      }
      if (until) {
        const d = new Date(until);
        if (!Number.isNaN(d.getTime())) params.set("until", d.toISOString());
      }
      const res = await apiFetch<{
        audit_logs: AuditLog[];
        total: number;
      }>(`/audit-logs?${params}`);
      setRows(res.audit_logs || []);
      setTotal(res.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit logs");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [offset, q, action, user, since, until]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-white">
          Audit logs
        </h1>
        <p className="text-sm text-zinc-500">
          Who did what, when, and where — admin activity trail
        </p>
      </header>

      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setOffset(0);
          void load();
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search action / entity / email…"
          className={`${inputClass} min-w-[200px] flex-1`}
        />
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Exact action"
          className={inputClass}
        />
        <input
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="Actor email"
          className={inputClass}
        />
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          Since
          <input
            type="datetime-local"
            value={since}
            onChange={(e) => setSince(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          Until
          <input
            type="datetime-local"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className={inputClass}
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-black"
        >
          Apply
        </button>
      </form>

      {loading ? (
        <LoadingBlock />
      ) : error ? (
        <EmptyState title="Cannot load audit logs" description={error} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No audit logs"
          description="No entries match these filters."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-900/80 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Who</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Where</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {rows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-zinc-900/40">
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-500">
                    {row.created_at}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    <div>{row.actor_email || "—"}</div>
                    <div className="text-xs text-zinc-600">{row.actor_type}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-brand-200">
                    {row.action}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    <div>{row.entity_type}</div>
                    <div className="font-mono text-xs text-zinc-600">
                      {row.entity_id || "—"}
                    </div>
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-3 text-zinc-500">
                    {row.ip_address || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-brand-500/50"
                      onClick={() => setSelected(row)}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between text-sm">
        <button
          type="button"
          disabled={offset === 0 || loading}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 disabled:opacity-40"
          onClick={() => setOffset(Math.max(0, offset - limit))}
        >
          Previous
        </button>
        <span className="text-zinc-500">
          {total === 0
            ? "0"
            : `${offset + 1}–${Math.min(offset + limit, total)} of ${total}`}
        </span>
        <button
          type="button"
          disabled={offset + limit >= total || loading}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-300 disabled:opacity-40"
          onClick={() => setOffset(offset + limit)}
        >
          Next
        </button>
      </div>

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-detail-title"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="audit-detail-title"
                  className="font-display text-lg font-semibold text-white"
                >
                  Audit detail
                </h2>
                <p className="mt-1 font-mono text-xs text-brand-200">
                  {selected.action}
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-zinc-500">When</dt>
                <dd className="text-zinc-200">{selected.created_at}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-zinc-500">Actor</dt>
                <dd className="text-zinc-200">
                  {selected.actor_email || "—"} ({selected.actor_type})
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-zinc-500">Entity</dt>
                <dd className="text-zinc-200">
                  {selected.entity_type}
                  {selected.entity_id ? (
                    <span className="mt-0.5 block font-mono text-xs text-zinc-500">
                      {selected.entity_id}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-zinc-500">IP</dt>
                <dd className="text-zinc-200">{selected.ip_address || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase text-zinc-500">User agent</dt>
                <dd className="break-all text-zinc-400">
                  {selected.user_agent || "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="mb-1 text-xs uppercase text-zinc-500">
                  Metadata
                </dt>
                <dd>
                  <pre className="overflow-x-auto rounded-lg bg-black/50 p-3 text-xs text-zinc-300">
                    {JSON.stringify(selected.metadata ?? {}, null, 2)}
                  </pre>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}
    </div>
  );
}
