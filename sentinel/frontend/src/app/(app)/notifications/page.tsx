"use client";

import { FormEvent, useCallback, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { PageHeader } from "@/components/ui/page-header";
import { formatAlertTime } from "@/lib/alerts";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { severityLabel, useI18n } from "@/lib/i18n";
import { useQuery } from "@/lib/panel/use-query";
import { hasPermission } from "@/lib/permissions";
import { useAuth } from "@/context/auth-context";
import type { NotificationChannel, NotificationRule } from "@/lib/types";

type ChannelType = NotificationChannel["channel_type"];

type Delivery = {
  id: string;
  alert_id?: string;
  alert_title?: string;
  status: string;
  error?: string;
  trigger?: string;
  created_at: string;
  sent_at?: string;
};

const TRIGGER_IDS = ["alert.created", "alert.updated", "alert.status_changed"] as const;

function triggerLabel(t: (key: string) => string, id: string) {
  if (id === "alert.created") return t("dispatch.trigger.created");
  if (id === "alert.updated") return t("dispatch.trigger.updated");
  if (id === "alert.status_changed") return t("dispatch.trigger.status");
  return id;
}

function deliveryStatus(t: (key: string) => string, status: string) {
  if (status === "sent") return t("dispatch.status.sent");
  if (status === "failed") return t("dispatch.status.failed");
  if (status === "pending") return t("dispatch.status.pending");
  return status;
}

const SEVERITIES = ["info", "low", "medium", "high", "critical"];

export default function NotificationsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canWrite = hasPermission(user, "notifications", "write");

  const [creatingChannel, setCreatingChannel] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [chName, setChName] = useState("");
  const [chType, setChType] = useState<ChannelType>("discord");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(587);
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpTo, setSmtpTo] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPassword, setSmtpPassword] = useState("");
  const [chSaving, setChSaving] = useState(false);
  const [chError, setChError] = useState<string | null>(null);

  const [creatingRule, setCreatingRule] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [ruleName, setRuleName] = useState("");
  const [minSeverity, setMinSeverity] = useState("high");
  const [triggers, setTriggers] = useState<string[]>(["alert.created"]);
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [testBusyId, setTestBusyId] = useState<string | null>(null);
  const [testFeedback, setTestFeedback] = useState<{ channelId: string; ok: boolean; message: string } | null>(null);

  const channelsQuery = useQuery(
    "notification-channels",
    async () => (await apiFetch<{ channels: NotificationChannel[] }>("/notification-channels")).channels || [],
  );
  const rulesQuery = useQuery(
    "notification-rules",
    async () => (await apiFetch<{ rules: NotificationRule[] }>("/notification-rules")).rules || [],
  );
  const channels = channelsQuery.data ?? [];
  const rules = rulesQuery.data ?? [];
  const loading = channelsQuery.loading || rulesQuery.loading;
  const loadError = channelsQuery.error || rulesQuery.error;
  const load = useCallback(async () => {
    await Promise.all([channelsQuery.reload(), rulesQuery.reload()]);
  }, [channelsQuery, rulesQuery]);

  const selectedChannel = channels.find((channel) => channel.id === selectedChannelId) ?? null;
  const selectedRule = rules.find((rule) => rule.id === selectedRuleId) ?? null;
  const deliveriesQuery = useQuery(selectedChannel ? `notification-deliveries:${selectedChannel.id}` : null, async () => {
    const res = await apiFetch<{ deliveries: Delivery[] }>(`/notification-channels/${selectedChannel!.id}/deliveries?limit=30`);
    return res.deliveries || [];
  });
  const deliveries = deliveriesQuery.data ?? [];

  async function onCreateChannel(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setChError(null);
    setChSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: chName.trim(),
        channel_type: chType,
        enabled: true,
      };
      if (chType === "email") {
        body.config = {
          smtp_host: smtpHost.trim(),
          smtp_port: smtpPort,
          from: smtpFrom.trim(),
          to: smtpTo.split(",").map((s) => s.trim()).filter(Boolean),
          username: smtpUser.trim() || undefined,
        };
        if (smtpPassword) body.secrets = { smtp_password: smtpPassword };
      } else {
        body.secrets = { webhook_url: webhookUrl.trim() };
      }
      await apiFetch("/notification-channels", { method: "POST", body: JSON.stringify(body) });
      setChName("");
      setWebhookUrl("");
      setSmtpPassword("");
      setCreatingChannel(false);
      await load();
    } catch (err) {
      setChError(err instanceof ApiRequestError ? err.message : "Channel create failed");
    } finally {
      setChSaving(false);
    }
  }

  async function toggleChannel(ch: NotificationChannel) {
    if (!canWrite) return;
    try {
      await apiFetch(`/notification-channels/${ch.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !ch.enabled }),
      });
      await load();
    } catch (err) {
      setChError(err instanceof ApiRequestError ? err.message : "Update failed");
    }
  }

  async function deleteChannel(id: string) {
    if (!canWrite) return;
    if (!confirm(t("dispatch.deleteChannel"))) return;
    try {
      await apiFetch(`/notification-channels/${id}`, { method: "DELETE" });
      setChannelIds((prev) => prev.filter((x) => x !== id));
      if (selectedChannelId === id) setSelectedChannelId(null);
      await load();
    } catch (err) {
      setChError(err instanceof ApiRequestError ? err.message : "Delete failed");
    }
  }

  async function testChannel(ch: NotificationChannel) {
    if (!canWrite) return;
    setTestBusyId(ch.id);
    setTestFeedback(null);
    try {
      const res = await apiFetch<{ ok: boolean; message: string }>(`/notification-channels/${ch.id}/test`, { method: "POST" });
      setTestFeedback({ channelId: ch.id, ok: true, message: res.message || t("dispatch.status.sent") });
      if (selectedChannelId === ch.id) await deliveriesQuery.reload();
    } catch (err) {
      setTestFeedback({ channelId: ch.id, ok: false, message: err instanceof ApiRequestError ? err.message : t("dispatch.status.failed") });
      if (selectedChannelId === ch.id) await deliveriesQuery.reload();
    } finally {
      setTestBusyId(null);
    }
  }

  async function onCreateRule(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setRuleError(null);
    setRuleSaving(true);
    try {
      await apiFetch("/notification-rules", {
        method: "POST",
        body: JSON.stringify({
          name: ruleName.trim(),
          enabled: true,
          min_severity: minSeverity,
          triggers,
          channel_ids: channelIds,
        }),
      });
      setRuleName("");
      setCreatingRule(false);
      await load();
    } catch (err) {
      setRuleError(err instanceof ApiRequestError ? err.message : "Rule create failed");
    } finally {
      setRuleSaving(false);
    }
  }

  async function toggleRule(rule: NotificationRule) {
    if (!canWrite) return;
    try {
      await apiFetch(`/notification-rules/${rule.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      await load();
    } catch (err) {
      setRuleError(err instanceof ApiRequestError ? err.message : "Update failed");
    }
  }

  async function deleteRule(id: string) {
    if (!canWrite) return;
    if (!confirm(t("dispatch.deleteRoute"))) return;
    try {
      await apiFetch(`/notification-rules/${id}`, { method: "DELETE" });
      if (selectedRuleId === id) setSelectedRuleId(null);
      await load();
    } catch (err) {
      setRuleError(err instanceof ApiRequestError ? err.message : "Delete failed");
    }
  }

  function toggleTrigger(id: string) {
    if (triggers.includes(id)) {
      if (triggers.length > 1) setTriggers(triggers.filter((t) => t !== id));
    } else {
      setTriggers([...triggers, id]);
    }
  }

  function toggleChannelId(id: string) {
    if (channelIds.includes(id)) setChannelIds(channelIds.filter((c) => c !== id));
    else setChannelIds([...channelIds, id]);
  }

  if (loading) return <LoadingBlock />;

  return (
    <>
      <PageHeader
        title={t("dispatch.title")}
        subtitle={t("dispatch.subtitle")}
      />
      {loadError ? <div className="alert alert-danger">{loadError}</div> : null}

      <div className="row">
        <div className="col-xl-5">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h4 className="card-title mb-0">{t("dispatch.channels")}</h4>
              {canWrite ? (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    setCreatingChannel(true);
                    setChError(null);
                  }}
                >
                  {t("dispatch.add")}
                </button>
              ) : null}
            </div>
            <div className="card-body">
              {chError && !creatingChannel ? <div className="alert alert-danger">{chError}</div> : null}
              {channels.length === 0 ? (
                <EmptyState title={t("dispatch.noChannels")} description={t("dispatch.noChannelsHint")} />
              ) : (
                <div className="dx-log">
                  {channels.map((channel) => (
                    <button
                      key={channel.id}
                      type="button"
                      className={!creatingChannel && selectedChannel?.id === channel.id ? "is-on" : ""}
                      onClick={() => {
                        setCreatingChannel(false);
                        setSelectedChannelId(channel.id);
                        setChError(null);
                      }}
                    >
                      <span className="d-flex justify-content-between gap-2">
                        <span className="fw-medium">{channel.name}</span>
                        <span className="badge bg-primary-subtle text-primary text-uppercase">{channel.channel_type}</span>
                      </span>
                      <span className="d-block text-muted fs-12 mt-1">{channel.enabled ? t("dispatch.sending") : t("dispatch.paused")}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-xl-7">
          <div className="card dx-detail">
            <div className="card-header">
              <h4 className="card-title mb-0">{creatingChannel ? t("dispatch.newChannel") : selectedChannel?.name || t("dispatch.channel")}</h4>
            </div>
            <div className="card-body">
              {creatingChannel && canWrite ? (
                <form onSubmit={(e) => void onCreateChannel(e)}>
                  <label className="form-label">{t("common.name")}</label>
                  <input required className="form-control mb-3" value={chName} onChange={(e) => setChName(e.target.value)} />
                  <label className="form-label">{t("dispatch.type")}</label>
                  <select className="form-select mb-3" value={chType} onChange={(e) => setChType(e.target.value as ChannelType)}>
                    <option value="discord">Discord</option>
                    <option value="slack">Slack</option>
                    <option value="webhook">Webhook</option>
                    <option value="email">{t("dispatch.email")}</option>
                  </select>
                  {chType === "email" ? (
                    <>
                      <div className="row g-2">
                        <div className="col-8 mb-3">
                          <label className="form-label">{t("dispatch.smtp")}</label>
                          <input required className="form-control" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
                        </div>
                        <div className="col-4 mb-3">
                          <label className="form-label">{t("dispatch.port")}</label>
                          <input type="number" className="form-control" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value) || 587)} />
                        </div>
                      </div>
                      <label className="form-label">{t("dispatch.from")}</label>
                      <input required className="form-control mb-3" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} />
                      <label className="form-label">{t("dispatch.to")}</label>
                      <input required className="form-control mb-3" value={smtpTo} onChange={(e) => setSmtpTo(e.target.value)} />
                      <label className="form-label">{t("dispatch.username")}</label>
                      <input className="form-control mb-3" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
                      <label className="form-label">{t("dispatch.password")}</label>
                      <input type="password" className="form-control mb-3" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} />
                    </>
                  ) : (
                    <>
                      <label className="form-label">{t("dispatch.webhook")}</label>
                      <input required className="form-control mb-3" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
                    </>
                  )}
                  {chError ? <div className="alert alert-danger">{chError}</div> : null}
                  <div className="d-flex gap-2">
                    <button type="button" className="btn btn-light" onClick={() => setCreatingChannel(false)}>
                      {t("common.cancel")}
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={chSaving}>
                      {chSaving ? t("views.saving") : t("dispatch.createChannel")}
                    </button>
                  </div>
                </form>
              ) : selectedChannel ? (
                <>
                  <p className="text-muted text-uppercase fs-12 mb-1">{selectedChannel.channel_type}</p>
                  <div className="form-check form-switch mb-3">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      checked={selectedChannel.enabled}
                      disabled={!canWrite}
                      onChange={() => void toggleChannel(selectedChannel)}
                      id="channel-enabled"
                    />
                    <label className="form-check-label" htmlFor="channel-enabled">
                      {selectedChannel.enabled ? t("dispatch.enabled") : t("dispatch.paused")}
                    </label>
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-light"
                      disabled={!canWrite || testBusyId === selectedChannel.id}
                      onClick={() => void testChannel(selectedChannel)}
                    >
                      {testBusyId === selectedChannel.id ? t("dispatch.testing") : t("dispatch.test")}
                    </button>
                    {canWrite ? (
                      <button type="button" className="btn btn-danger" onClick={() => void deleteChannel(selectedChannel.id)}>
                        {t("common.delete")}
                      </button>
                    ) : null}
                  </div>
                  {testFeedback && testFeedback.channelId === selectedChannel.id ? (
                    <div className={`alert ${testFeedback.ok ? "alert-success" : "alert-danger"} mt-3 mb-0`}>{testFeedback.message}</div>
                  ) : null}
                  <div className="mt-4">
                    <h5 className="fs-14 mb-2">{t("dispatch.log")}</h5>
                    {deliveriesQuery.loading ? <p className="text-muted mb-0">{t("common.loading")}</p> : null}
                    {deliveriesQuery.error ? <div className="alert alert-danger">{deliveriesQuery.error}</div> : null}
                    {!deliveriesQuery.loading && deliveries.length === 0 ? <p className="text-muted mb-0">{t("dispatch.logEmpty")}</p> : null}
                    {deliveries.length > 0 ? (
                      <div className="table-responsive">
                        <table className="table table-sm align-middle mb-0">
                          <tbody>
                            {deliveries.map((row) => (
                              <tr key={row.id}>
                                <td className="text-muted text-nowrap">{formatAlertTime(row.sent_at || row.created_at)}</td>
                                <td>{row.alert_title || row.trigger || "—"}</td>
                                <td>
                                  <span
                                    className={`badge ${row.status === "sent" ? "bg-success-subtle text-success" : row.status === "failed" ? "bg-danger-subtle text-danger" : "bg-warning-subtle text-warning"}`}
                                  >
                                    {deliveryStatus(t, row.status)}
                                  </span>
                                </td>
                                <td className="text-muted">{row.error || ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <EmptyState title={t("dispatch.pickChannel")} description={t("dispatch.pickChannelHint")} />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-xl-5">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h4 className="card-title mb-0">{t("dispatch.routes")}</h4>
              {canWrite ? (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    setCreatingRule(true);
                    setRuleError(null);
                  }}
                >
                  {t("dispatch.add")}
                </button>
              ) : null}
            </div>
            <div className="card-body">
              {ruleError && !creatingRule ? <div className="alert alert-danger">{ruleError}</div> : null}
              {rules.length === 0 ? (
                <EmptyState title={t("dispatch.noRoutes")} description={t("dispatch.noRoutesHint")} />
              ) : (
                <div className="dx-log">
                  {rules.map((rule) => (
                    <button
                      key={rule.id}
                      type="button"
                      className={!creatingRule && selectedRule?.id === rule.id ? "is-on" : ""}
                      onClick={() => {
                        setCreatingRule(false);
                        setSelectedRuleId(rule.id);
                        setRuleError(null);
                      }}
                    >
                      <span className="d-flex justify-content-between gap-2">
                        <span className="fw-medium">{rule.name}</span>
                        <span className="text-uppercase fs-12 text-muted">{rule.min_severity}</span>
                      </span>
                      <span className="d-block text-muted fs-12 mt-1">
                        {rule.triggers.map((id) => triggerLabel(t, id)).join(", ")} · {rule.channel_ids.length} {t("dispatch.channelCount")} · {rule.enabled ? t("dispatch.on") : t("dispatch.off")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="col-xl-7">
          <div className="card">
            <div className="card-header">
              <h4 className="card-title mb-0">{creatingRule ? t("dispatch.newRoute") : selectedRule?.name || t("dispatch.route")}</h4>
            </div>
            <div className="card-body">
              {creatingRule && canWrite ? (
                <form onSubmit={(e) => void onCreateRule(e)}>
                  <label className="form-label">{t("common.name")}</label>
                  <input required className="form-control mb-3" value={ruleName} onChange={(e) => setRuleName(e.target.value)} />
                  <label className="form-label">{t("dispatch.min")}</label>
                  <select className="form-select mb-3" value={minSeverity} onChange={(e) => setMinSeverity(e.target.value)}>
                    {SEVERITIES.map((level) => (
                      <option key={level} value={level}>
                        {severityLabel(t, level)}
                      </option>
                    ))}
                  </select>
                  <p className="form-label mb-2">{t("dispatch.triggers")}</p>
                  <div className="d-flex flex-column gap-2 mb-3">
                    {TRIGGER_IDS.map((id) => {
                      const on = triggers.includes(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          className={`dx-role-pick ${on ? "is-on" : ""}`}
                          onClick={() => toggleTrigger(id)}
                        >
                          <input className="form-check-input" type="checkbox" checked={on} readOnly tabIndex={-1} aria-hidden />
                          <span>{triggerLabel(t, id)}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="form-label mb-2">{t("dispatch.channelsField")}</p>
                  {channels.length === 0 ? (
                    <p className="text-muted">{t("dispatch.needChannel")}</p>
                  ) : (
                    <div className="d-flex flex-column gap-2 mb-3">
                      {channels.map((channel) => {
                        const on = channelIds.includes(channel.id);
                        return (
                          <button
                            key={channel.id}
                            type="button"
                            className={`dx-role-pick ${on ? "is-on" : ""}`}
                            onClick={() => toggleChannelId(channel.id)}
                          >
                            <input className="form-check-input" type="checkbox" checked={on} readOnly tabIndex={-1} aria-hidden />
                            <span>
                              {channel.name} ({channel.channel_type})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {ruleError ? <div className="alert alert-danger">{ruleError}</div> : null}
                  <div className="d-flex gap-2">
                    <button type="button" className="btn btn-light" onClick={() => setCreatingRule(false)}>
                      {t("common.cancel")}
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={ruleSaving}>
                      {ruleSaving ? t("views.saving") : t("dispatch.createRule")}
                    </button>
                  </div>
                </form>
              ) : selectedRule ? (
                <>
                  <p className="mb-2">
                    <span className="text-muted">{t("dispatch.min")} · </span>
                    <span className="text-uppercase">{severityLabel(t, selectedRule.min_severity)}</span>
                  </p>
                  <p className="mb-2">
                    <span className="text-muted">{t("dispatch.triggers")} · </span>
                    {selectedRule.triggers.map((id) => triggerLabel(t, id)).join(", ")}
                  </p>
                  <p className="mb-3">
                    <span className="text-muted">{t("dispatch.channelsField")} · </span>
                    {selectedRule.channel_ids.length}
                  </p>
                  <div className="form-check form-switch mb-3">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      checked={selectedRule.enabled}
                      disabled={!canWrite}
                      onChange={() => void toggleRule(selectedRule)}
                      id="route-enabled"
                    />
                    <label className="form-check-label" htmlFor="route-enabled">
                      {selectedRule.enabled ? t("dispatch.enabled") : t("dispatch.paused")}
                    </label>
                  </div>
                  {canWrite ? (
                    <button type="button" className="btn btn-danger" onClick={() => void deleteRule(selectedRule.id)}>
                      {t("common.delete")}
                    </button>
                  ) : null}
                </>
              ) : (
                <EmptyState title={t("dispatch.pickRoute")} description={t("dispatch.pickRouteHint")} />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
