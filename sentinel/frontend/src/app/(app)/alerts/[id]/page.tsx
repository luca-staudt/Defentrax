"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/context/auth-context";
import { apiFetch } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import type { Alert } from "@/lib/types";

type TimelineEntry = {
  id: string;
  event_type: string;
  message: string;
  created_at: string;
};

const transitions: Record<string, string[]> = {
  OPEN: ["ACKNOWLEDGED"],
  ACKNOWLEDGED: ["INVESTIGATING", "RESOLVED"],
  INVESTIGATING: ["RESOLVED"],
  RESOLVED: [],
};

export default function AlertDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const canWrite = hasPermission(user, "alerts", "write");
  const [alert, setAlert] = useState<Alert | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ alert: Alert; timeline: TimelineEntry[] }>(`/alerts/${id}`);
      setAlert(res.alert);
      setTimeline(res.timeline || []);
      setNotes(res.alert.description || "");
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
    if (!canWrite) return;
    await apiFetch(`/alerts/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, resolution_notes: notes }),
    });
    await load();
    router.refresh();
  }

  if (loading) return <LoadingBlock />;
  if (error || !alert) {
    return <EmptyState title="Alert not found" description={error || undefined} />;
  }

  const next = transitions[alert.status] || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-white">{alert.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">{alert.description}</p>
        </div>
        <div className="flex gap-2">
          <StatusBadge status={alert.status} />
          <SeverityBadge severity={alert.severity} />
        </div>
      </div>

      <dl className="grid gap-4 sm:grid-cols-3 text-sm">
        <div className="rounded-lg border border-zinc-800 p-4">
          <dt className="text-zinc-500">Events</dt>
          <dd className="text-lg text-white">{alert.event_count}</dd>
        </div>
        <div className="rounded-lg border border-zinc-800 p-4">
          <dt className="text-zinc-500">First seen</dt>
          <dd className="text-zinc-200">{alert.first_seen_at}</dd>
        </div>
        <div className="rounded-lg border border-zinc-800 p-4">
          <dt className="text-zinc-500">Last seen</dt>
          <dd className="text-zinc-200">{alert.last_seen_at}</dd>
        </div>
      </dl>

      {canWrite ? (
        <section className="rounded-xl border border-zinc-800 p-4">
          <h2 className="text-sm font-medium text-zinc-300">Lifecycle</h2>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Investigation notes (optional)"
            className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {next.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void patchStatus(s)}
                className="rounded-lg bg-brand-500/90 px-4 py-2 text-sm font-medium text-black hover:bg-brand-400"
              >
                Mark {s.replace("_", " ").toLowerCase()}
              </button>
            ))}
            {next.length === 0 ? (
              <p className="text-sm text-zinc-500">This alert is closed.</p>
            ) : null}
          </div>
        </section>
      ) : (
        <p className="text-sm text-zinc-500">Read-only — you cannot change alert status.</p>
      )}

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-widest text-zinc-400">Timeline</h2>
        <ul className="space-y-2">
          {timeline.map((t) => (
            <li key={t.id} className="rounded-lg border border-zinc-800 px-4 py-3 text-sm">
              <p className="text-zinc-200">{t.message}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {t.event_type} · {t.created_at}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
