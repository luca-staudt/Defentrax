"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { SilenceControl, writeTargetSilence } from "@/components/operator/silence-control";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { formatAlertTime } from "@/lib/alerts";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { canSeePage } from "@/lib/pages";
import { invalidateQueries } from "@/lib/panel/cache";
import { useQuery } from "@/lib/panel/use-query";
import { hasPermission } from "@/lib/permissions";
import type { Server } from "@/lib/types";

export default function ServersPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canWrite = hasPermission(user, "servers", "write");
  const canDetail = canSeePage(user, "server_detail");
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const selected = servers.find((server) => server.id === selectedId) ?? null;

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!canWrite || saving) return;
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
    if (!canWrite || silenceBusy) return;
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
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              {t("fleet.add")}
            </button>
          ) : null
        }
      />

      {serversQuery.loading ? <LoadingBlock /> : null}
      {serversQuery.error ? <EmptyState title={t("fleet.cannot")} description={serversQuery.error} /> : null}
      {!serversQuery.loading && !serversQuery.error && servers.length === 0 ? (
        <EmptyState title={t("fleet.noHost")} description={t("fleet.noHostHint")} />
      ) : null}

      {servers.length > 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>{t("common.name")}</th>
                    <th>{t("fleet.hostname")}</th>
                    <th>{t("fleet.environment")}</th>
                    <th>{t("fleet.heartbeat")}</th>
                    <th>{t("alerts.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {servers.map((server) => {
                    const signal = server.silent ? t("fleet.silent") : (server.agent_count || 0) > 0 ? t("fleet.reporting") : t("fleet.noAgent");
                    const tone = server.silent
                      ? "bg-warning-subtle text-warning"
                      : (server.agent_count || 0) > 0
                        ? "bg-success-subtle text-success"
                        : "bg-secondary-subtle text-secondary";
                    return (
                      <tr key={server.id}>
                        <td>
                          <button type="button" className="btn btn-link p-0 fw-medium" onClick={() => setSelectedId(server.id)}>
                            {server.name}
                          </button>
                        </td>
                        <td className="text-muted">{server.hostname || t("common.noHostname")}</td>
                        <td className="text-muted">{server.environment || t("common.default")}</td>
                        <td className="text-muted">{server.last_heartbeat_at ? formatAlertTime(server.last_heartbeat_at) : "—"}</td>
                        <td>
                          <span className={`badge ${tone}`}>{signal}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        isOpen={adding}
        onClose={() => {
          if (saving) return;
          setAdding(false);
          setFormError(null);
        }}
        size="lg"
        title={t("fleet.add")}
        footer={
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-light" disabled={saving} onClick={() => setAdding(false)}>
              {t("common.cancel")}
            </button>
            <button type="submit" form="server-create" className="btn btn-primary" disabled={saving || !name.trim()}>
              {saving ? t("fleet.saving") : t("fleet.create")}
            </button>
          </div>
        }
      >
        <form id="server-create" onSubmit={onCreate}>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label">{t("common.name")}</label>
              <input className="form-control" required value={name} onChange={(event) => setName(event.target.value)} placeholder="main-vps" />
            </div>
            <div className="col-md-6">
              <label className="form-label">{t("fleet.hostname")}</label>
              <input className="form-control" value={hostname} onChange={(event) => setHostname(event.target.value)} />
            </div>
            <div className="col-md-6">
              <label className="form-label">{t("fleet.environment")}</label>
              <input className="form-control" value={environment} onChange={(event) => setEnvironment(event.target.value)} />
            </div>
            <div className="col-md-6">
              <label className="form-label">{t("fleet.note")}</label>
              <input className="form-control" value={description} onChange={(event) => setDescription(event.target.value)} />
            </div>
          </div>
          {formError ? <div className="alert alert-danger mt-3 mb-0">{formError}</div> : null}
        </form>
      </Modal>

      <Modal
        isOpen={!!selected}
        onClose={() => {
          setSelectedId(null);
          setSilenceError(null);
        }}
        size="lg"
        title={selected?.name || t("fleet.title")}
        subtitle={selected?.hostname || undefined}
        footer={
          selected && canDetail ? (
            <Link href={`/servers/${selected.id}`} className="btn btn-primary">
              {t("host.enroll")}
            </Link>
          ) : (
            <button type="button" className="btn btn-light" onClick={() => setSelectedId(null)}>
              {t("common.close")}
            </button>
          )
        }
      >
        {selected ? (
          <>
            <dl className="row">
              <dt className="col-sm-4 text-muted">{t("fleet.environment")}</dt>
              <dd className="col-sm-8">{selected.environment || t("common.default")}</dd>
              <dt className="col-sm-4 text-muted">{t("common.added")}</dt>
              <dd className="col-sm-8">{formatAlertTime(selected.created_at)}</dd>
              <dt className="col-sm-4 text-muted">{t("fleet.heartbeat")}</dt>
              <dd className="col-sm-8">{selected.last_heartbeat_at ? formatAlertTime(selected.last_heartbeat_at) : "—"}</dd>
              <dt className="col-sm-4 text-muted">{t("fleet.lastEvent")}</dt>
              <dd className="col-sm-8">{selected.last_event_at ? formatAlertTime(selected.last_event_at) : "—"}</dd>
              <dt className="col-sm-4 text-muted">{t("host.agents")}</dt>
              <dd className="col-sm-8">{selected.agent_count ?? 0}</dd>
            </dl>
            {canWrite ? (
              <SilenceControl
                until={selected.silenced_until}
                busy={silenceBusy === selected.id}
                onChange={(until) => changeSilence(selected, until)}
              />
            ) : null}
            {silenceError ? <div className="alert alert-danger mt-3 mb-0">{silenceError}</div> : null}
          </>
        ) : null}
      </Modal>
    </>
  );
}
