"use client";

import { FormEvent, useState, type ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@/lib/panel/use-query";
import { hasPermission } from "@/lib/permissions";
import type { InterventionAction, InterventionSettings, Server } from "@/lib/types";

const DEFAULT_SETTINGS: InterventionSettings = {
  scope: "global",
  enabled: false,
  mode: "observe",
  allow_block_ip: false,
  allow_kill_process: false,
  allow_firewall_rule: false,
  protected_cidrs: [],
};

function normalizeSettings(raw: InterventionSettings | null | undefined): InterventionSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const cidrs = Array.isArray(raw.protected_cidrs)
    ? raw.protected_cidrs.filter((c): c is string => typeof c === "string")
    : [];
  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    scope: typeof raw.scope === "string" && raw.scope ? raw.scope : "global",
    enabled: Boolean(raw.enabled),
    mode: typeof raw.mode === "string" && raw.mode ? raw.mode : "observe",
    allow_block_ip: Boolean(raw.allow_block_ip),
    allow_kill_process: Boolean(raw.allow_kill_process),
    allow_firewall_rule: Boolean(raw.allow_firewall_rule),
    protected_cidrs: cidrs,
  };
}

function normalizeActions(raw: { actions?: InterventionAction[] | null } | null | undefined): InterventionAction[] {
  const list = raw?.actions;
  if (!Array.isArray(list)) return [];
  return list.filter((a): a is InterventionAction => Boolean(a && typeof a === "object" && a.id));
}

function normalizeServers(raw: { servers?: Server[] | null } | Server[] | null | undefined): Server[] {
  // Shared cache key "servers" stores { servers: Server[] } elsewhere; tolerate a bare array too.
  const list = Array.isArray(raw) ? raw : raw?.servers;
  if (!Array.isArray(list)) return [];
  return list.filter((s): s is Server => Boolean(s && typeof s === "object" && s.id));
}

function payloadPreview(payload: unknown): string {
  try {
    return JSON.stringify(payload ?? {});
  } catch {
    return "{}";
  }
}

export default function InterventionsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canWrite = hasPermission(user, "intervention", "write");
  const canApprove = hasPermission(user, "intervention", "approve");

  const settingsQuery = useQuery("intervention-settings", () => apiFetch<InterventionSettings>("/intervention/settings"));
  const actionsQuery = useQuery(
    "intervention-actions",
    async () => apiFetch<{ actions: InterventionAction[]; total: number }>("/intervention/actions?limit=50"),
    { refreshMs: 15000 },
  );
  // Must match other pages: cache key "servers" holds { servers: Server[] }, not a bare array.
  const serversQuery = useQuery("servers", () => apiFetch<{ servers: Server[] }>("/servers"));

  const settings = normalizeSettings(settingsQuery.data);
  const actions = normalizeActions(actionsQuery.data);
  const servers = normalizeServers(serversQuery.data);

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [mode, setMode] = useState<string | null>(null);
  const [allowBlock, setAllowBlock] = useState<boolean | null>(null);
  const [allowKill, setAllowKill] = useState<boolean | null>(null);
  const [allowFw, setAllowFw] = useState<boolean | null>(null);
  const [cidrs, setCidrs] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [serverId, setServerId] = useState("");
  const [actionType, setActionType] = useState("block_ip");
  const [payloadText, setPayloadText] = useState('{"ip":"203.0.113.10"}');
  const [reason, setReason] = useState("");
  const [creating, setCreating] = useState(false);

  const formEnabled = enabled ?? settings.enabled;
  const formMode = mode ?? settings.mode;
  const formBlock = allowBlock ?? settings.allow_block_ip;
  const formKill = allowKill ?? settings.allow_kill_process;
  const formFw = allowFw ?? settings.allow_firewall_rule;
  const formCidrs = cidrs ?? settings.protected_cidrs.join("\n");

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    setMsg(null);
    try {
      await apiFetch("/intervention/settings", {
        method: "PUT",
        body: JSON.stringify({
          enabled: formEnabled,
          mode: formMode,
          allow_block_ip: formBlock,
          allow_kill_process: formKill,
          allow_firewall_rule: formFw,
          protected_cidrs: formCidrs
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      setMsg(t("interv.saved"));
      await settingsQuery.reload();
    } catch (err) {
      setMsg(err instanceof ApiRequestError ? err.message : t("interv.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function createAction(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setCreating(true);
    setMsg(null);
    try {
      const payload = JSON.parse(payloadText);
      await apiFetch("/intervention/actions", {
        method: "POST",
        body: JSON.stringify({
          server_id: serverId,
          action_type: actionType,
          payload,
          reason,
        }),
      });
      setMsg(t("interv.actionCreated"));
      await actionsQuery.reload();
    } catch (err) {
      setMsg(err instanceof ApiRequestError ? err.message : t("interv.actionFailed"));
    } finally {
      setCreating(false);
    }
  }

  async function decide(id: string, approve: boolean) {
    if (!canApprove) return;
    try {
      await apiFetch(`/intervention/actions/${id}/${approve ? "approve" : "deny"}`, { method: "POST" });
      await actionsQuery.reload();
    } catch (err) {
      setMsg(err instanceof ApiRequestError ? err.message : t("interv.decideFailed"));
    }
  }

  if (settingsQuery.loading && !settingsQuery.data) return <LoadingBlock />;
  if (settingsQuery.error) return <EmptyState title={t("interv.cannot")} description={settingsQuery.error} />;

  const actionsError = actionsQuery.error;
  const serversError = canWrite ? serversQuery.error : null;

  return (
    <>
      <PageHeader title={t("interv.title")} subtitle={t("interv.subtitle")} />
      {msg ? <div className="alert alert-info">{msg}</div> : null}
      {actionsError ? <div className="alert alert-warning">{actionsError}</div> : null}
      {serversError ? <div className="alert alert-warning">{serversError}</div> : null}

      <div className="row">
        <div className="col-xl-5">
          <div className="card">
            <div className="card-header">
              <h5 className="card-title mb-0">{t("interv.policy")}</h5>
            </div>
            <div className="card-body">
              <p className="text-muted">{t("interv.policyHint")}</p>
              <form onSubmit={(e) => void saveSettings(e)}>
                <fieldset disabled={!canWrite || saving}>
                  <div className="form-check form-switch mb-3">
                    <input className="form-check-input" type="checkbox" checked={formEnabled} onChange={(e) => setEnabled(e.target.checked)} id="interv-enabled" />
                    <label className="form-check-label" htmlFor="interv-enabled">
                      {t("interv.enabled")}
                    </label>
                  </div>
                  <label className="form-label">{t("interv.mode")}</label>
                  <select className="form-select mb-3" value={formMode} onChange={(e) => setMode(e.target.value)}>
                    <option value="observe">{t("interv.mode.observe")}</option>
                    <option value="suggest">{t("interv.mode.suggest")}</option>
                    <option value="act">{t("interv.mode.act")}</option>
                  </select>
                  <p className="form-label">{t("interv.capabilities")}</p>
                  <div className="form-check mb-2">
                    <input className="form-check-input" type="checkbox" checked={formBlock} onChange={(e) => setAllowBlock(e.target.checked)} id="cap-block" />
                    <label className="form-check-label" htmlFor="cap-block">
                      block_ip
                    </label>
                  </div>
                  <div className="form-check mb-2">
                    <input className="form-check-input" type="checkbox" checked={formKill} onChange={(e) => setAllowKill(e.target.checked)} id="cap-kill" />
                    <label className="form-check-label" htmlFor="cap-kill">
                      kill_process
                    </label>
                  </div>
                  <div className="form-check mb-3">
                    <input className="form-check-input" type="checkbox" checked={formFw} onChange={(e) => setAllowFw(e.target.checked)} id="cap-fw" />
                    <label className="form-check-label" htmlFor="cap-fw">
                      firewall_rule
                    </label>
                  </div>
                  <label className="form-label">{t("interv.protected")}</label>
                  <textarea className="form-control mb-3" rows={3} value={formCidrs} onChange={(e) => setCidrs(e.target.value)} placeholder={"10.0.0.0/8\n192.168.0.0/16"} />
                  <Hint>{t("interv.protectedHint")}</Hint>
                </fieldset>
                {canWrite ? (
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? t("views.saving") : t("interv.save")}
                  </button>
                ) : null}
              </form>
            </div>
          </div>

          {canWrite ? (
            <div className="card">
              <div className="card-header">
                <h5 className="card-title mb-0">{t("interv.request")}</h5>
              </div>
              <div className="card-body">
                <form onSubmit={(e) => void createAction(e)}>
                  <label className="form-label">{t("nav.servers")}</label>
                  <select className="form-select mb-3" required value={serverId} onChange={(e) => setServerId(e.target.value)}>
                    <option value="">{t("interv.pickServer")}</option>
                    {servers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <label className="form-label">{t("interv.actionType")}</label>
                  <select
                    className="form-select mb-3"
                    value={actionType}
                    onChange={(e) => {
                      setActionType(e.target.value);
                      if (e.target.value === "block_ip") setPayloadText('{"ip":"203.0.113.10"}');
                      if (e.target.value === "kill_process") setPayloadText('{"pid":1234}');
                      if (e.target.value === "firewall_rule") setPayloadText('{"rule":"-I INPUT -s 203.0.113.10 -j DROP"}');
                    }}
                  >
                    <option value="block_ip">block_ip</option>
                    <option value="kill_process">kill_process</option>
                    <option value="firewall_rule">firewall_rule</option>
                  </select>
                  <label className="form-label">Payload (JSON)</label>
                  <textarea className="form-control mb-3 font-monospace" rows={3} value={payloadText} onChange={(e) => setPayloadText(e.target.value)} required />
                  <label className="form-label">{t("interv.reason")}</label>
                  <input className="form-control mb-3" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <button type="submit" className="btn btn-soft-primary" disabled={creating || !serverId}>
                    {creating ? t("views.saving") : t("interv.createAction")}
                  </button>
                </form>
              </div>
            </div>
          ) : null}
        </div>

        <div className="col-xl-7">
          <div className="card">
            <div className="card-header">
              <h5 className="card-title mb-0">{t("interv.history")}</h5>
            </div>
            <div className="card-body">
              {actionsQuery.loading && actions.length === 0 ? <LoadingBlock /> : null}
              {!actionsQuery.loading && actions.length === 0 && !actionsError ? (
                <EmptyState title={t("interv.none")} description={t("interv.noneHint")} />
              ) : null}
              {actions.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>{t("interv.actionType")}</th>
                        <th>{t("audit.entity")}</th>
                        <th>Status</th>
                        <th>{t("audit.when")}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {actions.map((a) => (
                        <tr key={a.id}>
                          <td>
                            <code>{a.action_type || "—"}</code>
                            <span className="d-block text-muted fs-12 text-truncate" style={{ maxWidth: 220 }}>
                              {payloadPreview(a.payload)}
                            </span>
                          </td>
                          <td className="text-muted fs-12 text-truncate" style={{ maxWidth: 120 }}>
                            {a.server_id || "—"}
                          </td>
                          <td>
                            <span className="badge bg-secondary-subtle text-secondary">{a.status || "—"}</span>
                          </td>
                          <td className="text-muted text-nowrap fs-12">{a.created_at || "—"}</td>
                          <td className="text-end text-nowrap">
                            {a.status === "pending" && canApprove ? (
                              <>
                                <button type="button" className="btn btn-sm btn-success me-1" onClick={() => void decide(a.id, true)}>
                                  {t("interv.approve")}
                                </button>
                                <button type="button" className="btn btn-sm btn-light" onClick={() => void decide(a.id, false)}>
                                  {t("interv.deny")}
                                </button>
                              </>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="form-text">{children}</p>;
}
