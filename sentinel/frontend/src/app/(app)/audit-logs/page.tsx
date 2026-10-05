"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import { useAuth } from "@/context/auth-context";
import type { AuditLog } from "@/lib/types";

const inputClass =
  "rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand-500/60";

export default function AuditLogsPage() {
  const { user } = useAuth();
  const canRead = hasPermission(user, "audit_logs", "read");

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [actorType, setActorType] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const limit = 30;

  const load = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (action.trim()) params.set("action", action.trim());
      if (actor.trim()) params.set("actor", actor.trim());
      if (actorType) params.set("actor_type", actorType);
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
      setLogs(res.audit_logs || []);
      setTotal(res.total || 0);
    } catch (e) {
      setError(
        e instanceof ApiRequestError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Failed to load audit logs",
      );
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [action, actor, actorType, canRead, offset, since, until]);

  useEffect(() => {
    void load();
  }, [load]);

  function onFilter(e: FormEvent) {
    e.preventDefault();
    setOffset(0);
    void load();
  }

  if (!canRead) {
    return (
      <EmptyState
        title="Access denied"
        description="Viewing admin logs requires audit_logs:read permission."
      />
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-white">
          Admin logs
        </h1>
        <p className="text-sm text-zinc-500">
          Who did what, when, and from where — audit trail for operators
        </p>
      </header>

      <form className="flex flex-wrap gap-3" onSubmit={onFilter}>
        <input
          className={`${inputClass} min-w-[160px] flex-1`}
          value={action}
          onChange={(e) => setAction(e.target.value)}
          placeholder="Action (e.g. server.create)"
        />
        <input
          className={`${inputClass} min-w-[160px]`}
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          placeholder="Actor email or user UUID"
        />
        <select
          className={inputClass}
          value={actorType}
          onChange={(e) => setActorType(e.target.value)}
        >
          <option value="">All actor types</option>
          {["user", "system", "agent", "api_key"].map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          Since
          <input
            type="datetime-local"
            className={inputClass}
            value={since}
            onChange={(e) => setSince(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          Until
          <input
            type="datetime-local"
            className={inputClass}
            value={until}
            onChange={(e) => setUntil(e.target.value)}
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
        <EmptyState title="Cannot load admin logs" description={error} />
      ) : logs.length === 0 ? (
        <EmptyState
          title="No audit entries"
          description="Admin actions will appear here as they happen."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-900/80 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Resource</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {logs.map((row) => (
                <tr key={row.id} className="hover:bg-zinc-900/40">
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-400">
                    {row.created_at}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-zinc-100">
                      {row.actor_email || row.actor_user_id || "—"}
                    </p>
                    <p className="text-xs text-zinc-500">{row.actor_type}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-200">
                    {row.action}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {row.entity_type}
                    {row.entity_id
                      ? ` · ${row.entity_id.slice(0, 8)}…`
                      : ""}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
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

      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>
          {total === 0
            ? "0 entries"
            : `${offset + 1}–${Math.min(offset + limit, total)} of ${total}`}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 disabled:opacity-40"
            disabled={offset === 0 || loading}
            onClick={() => setOffset((o) => Math.max(0, o - limit))}
          >
            Prev
          </button>
          <button
            type="button"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 disabled:opacity-40"
            disabled={offset + limit >= total || loading}
            onClick={() => setOffset((o) => o + limit)}
          >
            Next
          </button>
        </div>
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
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="audit-detail-title"
                  className="font-display text-lg font-semibold text-white"
                >
                  {selected.action}
                </h2>
                <p className="mt-1 text-sm text-zinc-500">{selected.created_at}</p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300"
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-widest text-zinc-500">
                  Actor
                </dt>
                <dd className="mt-1 text-zinc-200">
                  {selected.actor_email || selected.actor_user_id || "—"}{" "}
                  <span className="text-zinc-500">({selected.actor_type})</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-zinc-500">
                  Resource
                </dt>
                <dd className="mt-1 break-all text-zinc-200">
                  {selected.entity_type}
                  {selected.entity_id ? ` / ${selected.entity_id}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-zinc-500">
                  IP
                </dt>
                <dd className="mt-1 text-zinc-200">
                  {selected.ip_address || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-widest text-zinc-500">
                  User-Agent
                </dt>
                <dd className="mt-1 break-all text-zinc-200">
                  {selected.user_agent || "—"}
                </dd>
              </div>
            </dl>
            <div className="mt-4">
              <p className="text-xs uppercase tracking-widest text-zinc-500">
                Metadata
              </p>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-black/60 p-3 text-xs text-zinc-300">
                {JSON.stringify(selected.metadata ?? {}, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
