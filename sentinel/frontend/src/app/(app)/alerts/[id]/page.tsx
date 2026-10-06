"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/context/auth-context";
import {
  alertActionLabel,
  formatAlertTime,
  nextAlertStatuses,
} from "@/lib/alerts";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import { canSeePage } from "@/lib/pages";
import type { Alert } from "@/lib/types";

type TimelineEntry = {
  id: string;
  event_type: string;
  message: string;
  created_at: string;
};

export default function AlertDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const canWrite = hasPermission(user, "alerts", "write");
  const canServer = canSeePage(user, "server_detail");
  const [alert, setAlert] = useState<Alert | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ alert: Alert; timeline: TimelineEntry[] }>(
        `/alerts/${id}`,
      );
      setAlert(res.alert);
      setTimeline(res.timeline || []);
      setNotes(res.alert.resolution_notes || "");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Not found");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchStatus(status: string) {
    if (!canWrite || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const body: { status: string; resolution_notes?: string } = { status };
      if (notes.trim()) {
        body.resolution_notes = notes.trim();
      }
      await apiFetch(`/alerts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      await load();
      router.refresh();
    } catch (e) {
      setActionError(
        e instanceof ApiRequestError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Failed to update alert status",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingBlock label="Loading alert…" />;
  if (error || !alert) {
    return (
      <EmptyState
        title="Alert not found"
        description={error || undefined}
        action={
          <Link
            href="/alerts"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white"
          >
            Back to alerts
          </Link>
        }
      />
    );
  }

  const next = nextAlertStatuses(alert.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <Link href="/alerts" className="hover:text-sky-400">
          Alerts
        </Link>
        <span>/</span>
        <span className="font-mono text-zinc-400 truncate max-w-[12rem]">
          {alert.id.slice(0, 8)}…
        </span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold text-white">
            {alert.title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">
            {alert.description || "No description provided."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={alert.status} />
          <SeverityBadge severity={alert.severity} />
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <MetaCell
          label="Server"
          value={
            canServer ? (
              <Link
                href={`/servers/${alert.server_id}`}
                className="font-mono text-xs text-sky-400 hover:text-sky-300 break-all"
              >
                {alert.server_id}
              </Link>
            ) : (
              <span className="font-mono text-xs text-zinc-300 break-all">
                {alert.server_id}
              </span>
            )
          }
        />
        <MetaCell
          label="Rule"
          value={
            <span className="font-mono text-xs text-zinc-300">
              {alert.rule_id || "—"}
            </span>
          }
        />
        <MetaCell
          label="Event hits"
          value={<span className="text-lg text-white">{alert.event_count}</span>}
        />
        <MetaCell
          label="Source IP"
          value={
            <span className="font-mono text-xs text-zinc-300">
              {alert.source_ip || "—"}
            </span>
          }
        />
        <MetaCell label="First seen" value={formatAlertTime(alert.first_seen_at)} />
        <MetaCell label="Last seen" value={formatAlertTime(alert.last_seen_at)} />
        <MetaCell label="Opened" value={formatAlertTime(alert.opened_at)} />
        <MetaCell
          label="Resolved"
          value={formatAlertTime(alert.resolved_at)}
        />
      </dl>

      {canWrite ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          <h2 className="text-sm font-medium text-zinc-300">Lifecycle actions</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Resolve from any open state, or reopen a closed alert.
          </p>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Resolution / investigation notes (optional)"
            className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand-500/60"
          />
          {actionError ? (
            <p className="mt-2 rounded-lg border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-xs text-rose-300">
              {actionError}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {next.map((s) => {
              const primary = s === "RESOLVED" || s === "OPEN";
              return (
                <button
                  key={s}
                  type="button"
                  disabled={saving}
                  onClick={() => void patchStatus(s)}
                  className={
                    primary
                      ? "rounded-lg bg-brand-500/90 px-4 py-2 text-sm font-medium text-black hover:bg-brand-400 disabled:opacity-50"
                      : "rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 hover:border-zinc-500 hover:text-white disabled:opacity-50"
                  }
                >
                  {saving ? "Updating…" : alertActionLabel(s)}
                </button>
              );
            })}
            {next.length === 0 ? (
              <p className="text-sm text-zinc-500">No further transitions available.</p>
            ) : null}
          </div>
        </section>
      ) : (
        <p className="text-sm text-zinc-500">
          Read-only — you cannot change alert status.
        </p>
      )}

      {alert.resolution_notes ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          <h2 className="text-sm font-medium text-zinc-300">Resolution notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-300">
            {alert.resolution_notes}
          </p>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-widest text-zinc-400">
          Timeline
        </h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-zinc-500">No timeline events yet.</p>
        ) : (
          <ul className="space-y-2">
            {timeline.map((t) => (
              <li
                key={t.id}
                className="rounded-lg border border-zinc-800 bg-zinc-950/30 px-4 py-3 text-sm"
              >
                <p className="text-zinc-200">{t.message}</p>
                <p className="mt-1 font-mono text-xs text-zinc-500">
                  {t.event_type} · {formatAlertTime(t.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function MetaCell({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
      <dt className="text-xs uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className="mt-1 text-zinc-200">{value}</dd>
    </div>
  );
}
