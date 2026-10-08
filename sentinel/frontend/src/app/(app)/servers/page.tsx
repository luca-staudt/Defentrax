"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { SilenceControl, writeTargetSilence } from "@/components/operator/silence-control";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { PageHeader } from "@/components/ui/page-header";
import { formatAlertTime } from "@/lib/alerts";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { invalidateQueries } from "@/lib/panel/cache";
import { useQuery } from "@/lib/panel/use-query";
import { hasPermission } from "@/lib/permissions";
import { canSeePage } from "@/lib/pages";
import { useAuth } from "@/context/auth-context";
import type { Server } from "@/lib/types";

export default function ServersPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canWrite = hasPermission(user, "servers", "write");
  const canDetail = canSeePage(user, "server_detail");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [description, setDescription] = useState("");
  const [environment, setEnvironment] = useState("production");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [silenceBusy, setSilenceBusy] = useState<string | null>(null);
  const [silenceError, setSilenceError] = useState<string | null>(null);

  const serversQuery = useQuery("servers", () => apiFetch<{ servers: Server[] }>("/servers"), { refreshMs: 20000 });
  const servers = serversQuery.data?.servers || [];

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) return;
    setFormError(null);
    setSaving(true);
    try {
      await apiFetch<Server>("/servers", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          hostname: hostname.trim() || undefined,
          description: description.trim() || undefined,
          environment: environment.trim() || undefined,
        }),
      });
      setName("");
      setHostname("");
      setDescription("");
      setAdding(false);
      invalidateQueries(["stats", "server:"]);
      await serversQuery.reload();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : t("fleet.createFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function changeSilence(server: Server, until: string | null) {
    if (!canWrite) return;
    setSilenceBusy(server.id);
    setSilenceError(null);
    try {
      await writeTargetSilence(`/servers/${server.id}/silence`, until);
      invalidateQueries(["stats", `server:${server.id}`]);
      await serversQuery.reload();
    } catch (err) {
      setSilenceError(err instanceof ApiRequestError ? err.message : t("fleet.createFailed"));
    } finally {
      setSilenceBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title={t("fleet.title")}
        subtitle={t("fleet.subtitle")}
        actions={
          canWrite ? (
            <button type="button" className="btn btn-primary" onClick={() => setAdding((open) => !open)}>
              {adding ? t("common.close") : t("fleet.add")}
            </button>
          ) : null
        }
      />

      {adding && canWrite ? (
        <form className="card" onSubmit={onCreate}>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-3">
                <label className="form-label">{t("common.name")}</label>
                <input className="form-control" required value={name} onChange={(event) => setName(event.target.value)} placeholder="main-vps" />
              </div>
              <div className="col-md-3">
                <label className="form-label">{t("fleet.hostname")}</label>
                <input className="form-control" value={hostname} onChange={(event) => setHostname(event.target.value)} />
              </div>
              <div className="col-md-3">
                <label className="form-label">{t("fleet.environment")}</label>
                <input className="form-control" value={environment} onChange={(event) => setEnvironment(event.target.value)} />
              </div>
              <div className="col-md-3">
                <label className="form-label">{t("fleet.note")}</label>
                <input className="form-control" value={description} onChange={(event) => setDescription(event.target.value)} />
              </div>
              {formError ? (
                <div className="col-12">
                  <div className="alert alert-danger mb-0">{formError}</div>
                </div>
              ) : null}
              <div className="col-12 text-end">
                <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
                  {saving ? t("fleet.saving") : t("fleet.create")}
                </button>
              </div>
            </div>
          </div>
        </form>
      ) : null}

      {silenceError ? <div className="alert alert-danger">{silenceError}</div> : null}
      {serversQuery.loading ? <LoadingBlock /> : null}
      {serversQuery.error ? <EmptyState title={t("fleet.cannot")} description={serversQuery.error} /> : null}
      {!serversQuery.loading && !serversQuery.error && servers.length === 0 ? (
        <EmptyState title={t("fleet.noHost")} description={t("fleet.noHostHint")} />
      ) : null}

      {servers.length > 0 ? (
        <div className="dx-log">
          {servers.map((server) => {
            const signal = server.silent ? t("fleet.silent") : (server.agent_count || 0) > 0 ? t("fleet.reporting") : t("fleet.noAgent");
            const tone = server.silent ? "bg-warning-subtle text-warning" : (server.agent_count || 0) > 0 ? "bg-success-subtle text-success" : "bg-secondary-subtle text-secondary";
            const body = (
              <>
                <span className="d-flex justify-content-between gap-2">
                  <span className="fw-medium">{server.name}</span>
                  <span className={`badge ${tone}`}>{signal}</span>
                </span>
                <span className="d-block text-muted fs-12 mt-1">
                  {server.hostname || t("common.noHostname")} · {server.environment || t("common.default")} · {t("common.added")} {formatAlertTime(server.created_at)}
                </span>
                <span className="d-block text-muted fs-12">
                  {t("fleet.heartbeat")}: {server.last_heartbeat_at ? formatAlertTime(server.last_heartbeat_at) : "—"} · {t("fleet.lastEvent")}:{" "}
                  {server.last_event_at ? formatAlertTime(server.last_event_at) : "—"}
                </span>
              </>
            );
            return (
              <div key={server.id} className="d-flex align-items-stretch gap-3">
                {canDetail ? (
                  <Link href={`/servers/${server.id}`} className="dx-role-pick text-reset flex-grow-1">
                    <span className="flex-grow-1">{body}</span>
                  </Link>
                ) : (
                  <div className="dx-role-pick flex-grow-1">
                    <span className="flex-grow-1">{body}</span>
                  </div>
                )}
                {canWrite ? (
                  <div className="py-2" style={{ minWidth: 220 }}>
                    <SilenceControl
                      until={server.silenced_until}
                      busy={silenceBusy === server.id}
                      onChange={(until) => changeSilence(server, until)}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
