"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { PageHeader } from "@/components/ui/page-header";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/context/auth-context";
import { alertActionLabel, formatAlertTime, nextAlertStatuses } from "@/lib/alerts";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import { canSeePage } from "@/lib/pages";
import { invalidateQueries } from "@/lib/panel/cache";
import { useQuery } from "@/lib/panel/use-query";
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
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const detailQuery = useQuery(
    id ? `alert:${id}` : null,
    () => apiFetch<{ alert: Alert; timeline: TimelineEntry[] }>(`/alerts/${id}`),
    { refreshMs: 15000 },
  );
  const alert = detailQuery.data?.alert ?? null;
  const timeline = detailQuery.data?.timeline || [];
  const loading = detailQuery.loading;
  const error = detailQuery.error;

  const alertId = alert?.id;
  const serverNotes = alert?.resolution_notes || "";
  useEffect(() => {
    setNotes(serverNotes);
  }, [alertId, serverNotes]);

  async function patchStatus(status: string) {
    if (!canWrite || saving) return;
    setSaving(true);
    setActionError(null);
    try {
      const body: { status: string; resolution_notes?: string } = { status };
      if (notes.trim()) body.resolution_notes = notes.trim();
      await apiFetch(`/alerts/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      invalidateQueries(["stats", "alerts"]);
      await detailQuery.reload();
      router.refresh();
    } catch (e) {
      setActionError(
        e instanceof ApiRequestError ? e.message : e instanceof Error ? e.message : "Failed to update alert status",
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
          <Link href="/alerts" className="btn btn-light">
            Back to alerts
          </Link>
        }
      />
    );
  }

  const next = nextAlertStatuses(alert.status);

  return (
    <>
      <PageHeader
        title={alert.title}
        subtitle={alert.description || "No description provided."}
        actions={
          <div className="d-flex gap-2">
            <StatusBadge status={alert.status} />
            <SeverityBadge severity={alert.severity} />
          </div>
        }
      />
      <p className="mb-3">
        <Link href="/alerts" className="text-muted">
          Alerts
        </Link>
        <span className="text-muted"> / {alert.id.slice(0, 8)}…</span>
      </p>

      <div className="row">
        <MetaCell
          label="Server"
          value={
            canServer ? (
              <Link href={`/servers/${alert.server_id}`} className="text-break">
                {alert.server_id}
              </Link>
            ) : (
              <span className="text-break">{alert.server_id}</span>
            )
          }
        />
        <MetaCell label="Rule" value={<span>{alert.rule_id || "—"}</span>} />
        <MetaCell label="Event hits" value={<span className="fs-16">{alert.event_count}</span>} />
        <MetaCell label="Source IP" value={<span>{alert.source_ip || "—"}</span>} />
        <MetaCell label="First seen" value={formatAlertTime(alert.first_seen_at)} />
        <MetaCell label="Last seen" value={formatAlertTime(alert.last_seen_at)} />
        <MetaCell label="Opened" value={formatAlertTime(alert.opened_at)} />
        <MetaCell label="Resolved" value={formatAlertTime(alert.resolved_at)} />
      </div>

      {canWrite ? (
        <div className="card">
          <div className="card-header">
            <h4 className="card-title mb-0">Lifecycle actions</h4>
          </div>
          <div className="card-body">
            <p className="text-muted">Resolve from any open state, or reopen a closed alert.</p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Resolution / investigation notes (optional)"
              className="form-control"
            />
            {actionError ? <div className="alert alert-danger mt-3 mb-0">{actionError}</div> : null}
            <div className="d-flex flex-wrap gap-2 mt-3">
              {next.map((s) => {
                const primary = s === "RESOLVED" || s === "OPEN";
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={saving}
                    onClick={() => void patchStatus(s)}
                    className={primary ? "btn btn-primary" : "btn btn-light"}
                  >
                    {saving ? "Updating…" : alertActionLabel(s)}
                  </button>
                );
              })}
              {next.length === 0 ? <p className="text-muted mb-0">No further transitions available.</p> : null}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-muted">Read-only — you cannot change alert status.</p>
      )}

      {alert.resolution_notes ? (
        <div className="card">
          <div className="card-header">
            <h4 className="card-title mb-0">Resolution notes</h4>
          </div>
          <div className="card-body">
            <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
              {alert.resolution_notes}
            </p>
          </div>
        </div>
      ) : null}

      <div className="card">
        <div className="card-header">
          <h4 className="card-title mb-0">Timeline</h4>
        </div>
        <div className="card-body">
          {timeline.length === 0 ? (
            <p className="text-muted mb-0">No timeline events yet.</p>
          ) : (
            <div className="list-group">
              {timeline.map((t) => (
                <div key={t.id} className="list-group-item">
                  <p className="mb-1">{t.message}</p>
                  <p className="text-muted fs-12 mb-0">
                    {t.event_type} · {formatAlertTime(t.created_at)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function MetaCell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="col-md-6 col-xl-3">
      <div className="card">
        <div className="card-body">
          <p className="text-muted text-uppercase fs-12 mb-1">{label}</p>
          <div className="mb-0">{value}</div>
        </div>
      </div>
    </div>
  );
}
