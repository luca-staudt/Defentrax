"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { PageHeader } from "@/components/ui/page-header";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/context/auth-context";
import { formatAlertTime, nextAlertStatuses } from "@/lib/alerts";
import { actionLabel, useI18n } from "@/lib/i18n";
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
  const { t } = useI18n();
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

  if (loading) return <LoadingBlock label={t("alert.loading")} />;
  if (error || !alert) {
    return (
      <EmptyState
        title={t("alert.notFound")}
        description={error || undefined}
        action={
          <Link href="/alerts" className="btn btn-light">
            {t("alert.back")}
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
        subtitle={alert.description || t("alert.noDescription")}
        actions={
          <div className="d-flex align-items-center gap-2">
            <StatusBadge status={alert.status} />
            <SeverityBadge severity={alert.severity} />
            <Link href="/alerts" className="btn btn-light">
              {t("alert.queue")}
            </Link>
          </div>
        }
      />

      <div className="row">
        <div className="col-xl-7">
          <div className="row g-3 mb-3">
            <Fact label={t("common.hits")} value={String(alert.event_count)} />
            <Fact label={t("common.sourceIp")} value={alert.source_ip || "—"} />
            <Fact label={t("common.firstSeen")} value={formatAlertTime(alert.first_seen_at)} />
            <Fact label={t("common.lastSeen")} value={formatAlertTime(alert.last_seen_at)} />
            <Fact label={t("alert.opened")} value={formatAlertTime(alert.opened_at)} />
            <Fact label={t("alert.resolved")} value={formatAlertTime(alert.resolved_at)} />
          </div>

          <div className="card">
            <div className="card-header">
              <h4 className="card-title mb-0">{t("alert.record")}</h4>
            </div>
            <div className="card-body">
              <p className="mb-2">
                <span className="text-muted">{t("common.server")} · </span>
                {canServer ? (
                  <Link href={`/servers/${alert.server_id}`} className="text-break">
                    {alert.server_id}
                  </Link>
                ) : (
                  <span className="text-break">{alert.server_id}</span>
                )}
              </p>
              <p className="mb-0">
                <span className="text-muted">{t("common.rule")} · </span>
                {alert.rule_id || "—"}
              </p>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h4 className="card-title mb-0">{t("alert.timeline")}</h4>
            </div>
            <div className="card-body">
              {timeline.length === 0 ? (
                <p className="text-muted mb-0">{t("alert.noTimeline")}</p>
              ) : (
                <div className="dx-log">
                  {timeline.map((entry) => (
                    <div key={entry.id} className="dx-metric">
                      <span className="fw-medium">{entry.message}</span>
                      <span className="d-block text-muted fs-12 mt-1">
                        {entry.event_type} · {formatAlertTime(entry.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-xl-5">
          <div className="card dx-detail">
            <div className="card-header">
              <h4 className="card-title mb-0">{t("alert.move")}</h4>
            </div>
            <div className="card-body">
              {canWrite ? (
                <>
                  <p className="text-muted">{t("alert.moveHint")}</p>
                  <label className="form-label" htmlFor="resolution-notes">
                    {t("alert.notes")}
                  </label>
                  <textarea
                    id="resolution-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    placeholder={t("alert.notesPh")}
                    className="form-control"
                  />
                  {actionError ? <div className="alert alert-danger mt-3 mb-0">{actionError}</div> : null}
                  <div className="d-flex flex-wrap gap-2 mt-3">
                    {next.map((status) => {
                      const primary = status === "RESOLVED" || status === "OPEN";
                      return (
                        <button
                          key={status}
                          type="button"
                          disabled={saving}
                          onClick={() => void patchStatus(status)}
                          className={primary ? "btn btn-primary" : "btn btn-light"}
                        >
                          {saving ? t("alert.updating") : actionLabel(t, status)}
                        </button>
                      );
                    })}
                    {next.length === 0 ? <p className="text-muted mb-0">{t("alert.noNext")}</p> : null}
                  </div>
                </>
              ) : (
                <p className="text-muted mb-0">{t("alert.readonly")}</p>
              )}
              {alert.resolution_notes ? (
                <div className="mt-4">
                  <p className="text-muted text-uppercase fs-12 mb-1">{t("alert.savedNotes")}</p>
                  <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>
                    {alert.resolution_notes}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="col-md-6 col-xl-4">
      <div className="dx-metric">
        <span className="text-muted text-uppercase fs-12">{label}</span>
        <strong className="fs-14">{value}</strong>
      </div>
    </div>
  );
}
