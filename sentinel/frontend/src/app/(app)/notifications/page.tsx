"use client";

import { FormEvent, useCallback, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { useQuery } from "@/lib/panel/use-query";
import { hasPermission } from "@/lib/permissions";
import { useAuth } from "@/context/auth-context";
import type { NotificationChannel, NotificationRule } from "@/lib/types";

type ChannelType = NotificationChannel["channel_type"];

const TRIGGERS = [
  { id: "alert.created", label: "Alert created" },
  { id: "alert.updated", label: "Alert updated" },
  { id: "alert.status_changed", label: "Alert status changed" },
];

const SEVERITIES = ["info", "low", "medium", "high", "critical"];

export default function NotificationsPage() {
  const { user } = useAuth();
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
    if (!confirm("Delete this notification channel?")) return;
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
      setTestFeedback({ channelId: ch.id, ok: true, message: res.message || "Test dispatch sent successfully" });
    } catch (err) {
      setTestFeedback({ channelId: ch.id, ok: false, message: err instanceof ApiRequestError ? err.message : "Test failed" });
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
    if (!confirm("Delete this notification rule?")) return;
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
        title="Dispatch"
        subtitle="Where alerts go, and which ones are worth sending."
      />
      {loadError ? <div className="alert alert-danger">{loadError}</div> : null}

      <div className="row">
        <div className="col-xl-5">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h4 className="card-title mb-0">Channels</h4>
              {canWrite ? (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    setCreatingChannel(true);
                    setChError(null);
                  }}
                >
                  Add
                </button>
              ) : null}
            </div>
            <div className="card-body">
              {chError && !creatingChannel ? <div className="alert alert-danger">{chError}</div> : null}
              {channels.length === 0 ? (
                <EmptyState title="No channels" description="Add Discord, Slack, a webhook, or email." />
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
                      <span className="d-block text-muted fs-12 mt-1">{channel.enabled ? "Sending" : "Paused"}</span>
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
              <h4 className="card-title mb-0">{creatingChannel ? "New channel" : selectedChannel?.name || "Channel"}</h4>
            </div>
            <div className="card-body">
              {creatingChannel && canWrite ? (
                <form onSubmit={(e) => void onCreateChannel(e)}>
                  <label className="form-label">Name</label>
                  <input required className="form-control mb-3" value={chName} onChange={(e) => setChName(e.target.value)} />
                  <label className="form-label">Type</label>
                  <select className="form-select mb-3" value={chType} onChange={(e) => setChType(e.target.value as ChannelType)}>
                    <option value="discord">Discord</option>
                    <option value="slack">Slack</option>
                    <option value="webhook">Webhook</option>
                    <option value="email">Email</option>
                  </select>
                  {chType === "email" ? (
                    <>
                      <div className="row g-2">
                        <div className="col-8 mb-3">
                          <label className="form-label">SMTP host</label>
                          <input required className="form-control" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} />
                        </div>
                        <div className="col-4 mb-3">
                          <label className="form-label">Port</label>
                          <input type="number" className="form-control" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value) || 587)} />
                        </div>
                      </div>
                      <label className="form-label">From</label>
                      <input required className="form-control mb-3" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} />
                      <label className="form-label">To (comma separated)</label>
                      <input required className="form-control mb-3" value={smtpTo} onChange={(e) => setSmtpTo(e.target.value)} />
                      <label className="form-label">Username</label>
                      <input className="form-control mb-3" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
                      <label className="form-label">Password</label>
                      <input type="password" className="form-control mb-3" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} />
                    </>
                  ) : (
                    <>
                      <label className="form-label">Webhook URL</label>
                      <input required className="form-control mb-3" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
                    </>
                  )}
                  {chError ? <div className="alert alert-danger">{chError}</div> : null}
                  <div className="d-flex gap-2">
                    <button type="button" className="btn btn-light" onClick={() => setCreatingChannel(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={chSaving}>
                      {chSaving ? "Saving…" : "Create channel"}
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
                      {selectedChannel.enabled ? "Enabled" : "Paused"}
                    </label>
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-light"
                      disabled={!canWrite || testBusyId === selectedChannel.id}
                      onClick={() => void testChannel(selectedChannel)}
                    >
                      {testBusyId === selectedChannel.id ? "Sending…" : "Send test"}
                    </button>
                    {canWrite ? (
                      <button type="button" className="btn btn-danger" onClick={() => void deleteChannel(selectedChannel.id)}>
                        Delete
                      </button>
                    ) : null}
                  </div>
                  {testFeedback && testFeedback.channelId === selectedChannel.id ? (
                    <div className={`alert ${testFeedback.ok ? "alert-success" : "alert-danger"} mt-3 mb-0`}>{testFeedback.message}</div>
                  ) : null}
                </>
              ) : (
                <EmptyState title="Select a channel" description="Test it, pause it, or add a new destination." />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-xl-5">
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h4 className="card-title mb-0">Routes</h4>
              {canWrite ? (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => {
                    setCreatingRule(true);
                    setRuleError(null);
                  }}
                >
                  Add
                </button>
              ) : null}
            </div>
            <div className="card-body">
              {ruleError && !creatingRule ? <div className="alert alert-danger">{ruleError}</div> : null}
              {rules.length === 0 ? (
                <EmptyState title="No routes" description="Set a severity floor and the channels that should hear about it." />
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
                        {rule.triggers.join(", ")} · {rule.channel_ids.length} channels · {rule.enabled ? "on" : "off"}
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
              <h4 className="card-title mb-0">{creatingRule ? "New route" : selectedRule?.name || "Route"}</h4>
            </div>
            <div className="card-body">
              {creatingRule && canWrite ? (
                <form onSubmit={(e) => void onCreateRule(e)}>
                  <label className="form-label">Name</label>
                  <input required className="form-control mb-3" value={ruleName} onChange={(e) => setRuleName(e.target.value)} />
                  <label className="form-label">Minimum severity</label>
                  <select className="form-select mb-3" value={minSeverity} onChange={(e) => setMinSeverity(e.target.value)}>
                    {SEVERITIES.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                  <p className="form-label mb-2">Triggers</p>
                  <div className="d-flex flex-column gap-2 mb-3">
                    {TRIGGERS.map((trigger) => {
                      const on = triggers.includes(trigger.id);
                      return (
                        <button
                          key={trigger.id}
                          type="button"
                          className={`dx-role-pick ${on ? "is-on" : ""}`}
                          onClick={() => toggleTrigger(trigger.id)}
                        >
                          <input className="form-check-input" type="checkbox" checked={on} readOnly tabIndex={-1} aria-hidden />
                          <span>{trigger.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="form-label mb-2">Channels</p>
                  {channels.length === 0 ? (
                    <p className="text-muted">Create a channel first.</p>
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
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={ruleSaving}>
                      {ruleSaving ? "Saving…" : "Create rule"}
                    </button>
                  </div>
                </form>
              ) : selectedRule ? (
                <>
                  <p className="mb-2">
                    <span className="text-muted">Minimum severity · </span>
                    <span className="text-uppercase">{selectedRule.min_severity}</span>
                  </p>
                  <p className="mb-2">
                    <span className="text-muted">Triggers · </span>
                    {selectedRule.triggers.join(", ")}
                  </p>
                  <p className="mb-3">
                    <span className="text-muted">Channels · </span>
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
                      {selectedRule.enabled ? "Enabled" : "Paused"}
                    </label>
                  </div>
                  {canWrite ? (
                    <button type="button" className="btn btn-danger" onClick={() => void deleteRule(selectedRule.id)}>
                      Delete
                    </button>
                  ) : null}
                </>
              ) : (
                <EmptyState title="Select a route" description="See which alerts it forwards, or add a new one." />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
