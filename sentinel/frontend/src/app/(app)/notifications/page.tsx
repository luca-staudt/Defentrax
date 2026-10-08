"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { CyberCheckbox, CyberSwitch } from "@/components/ui/cyber-checkbox";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
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

  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"channels" | "rules">("channels");
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
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
  const [createRuleOpen, setCreateRuleOpen] = useState(false);
  const [ruleName, setRuleName] = useState("");
  const [minSeverity, setMinSeverity] = useState("high");
  const [triggers, setTriggers] = useState<string[]>(["alert.created"]);
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [testBusyId, setTestBusyId] = useState<string | null>(null);
  const [testFeedback, setTestFeedback] = useState<{ channelId: string; ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, r] = await Promise.all([
        apiFetch<{ channels: NotificationChannel[] }>("/notification-channels"),
        apiFetch<{ rules: NotificationRule[] }>("/notification-rules"),
      ]);
      setChannels(c.channels || []);
      setRules(r.rules || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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
      setCreateChannelOpen(false);
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
      setCreateRuleOpen(false);
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
        title="Notifications"
        subtitle="Webhook, Discord, Slack, and email routing"
        actions={
          canWrite ? (
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-light" onClick={() => setCreateChannelOpen(true)}>
                Add channel
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setCreateRuleOpen(true)}>
                Create rule
              </button>
            </div>
          ) : null
        }
      />

      <ul className="nav nav-tabs nav-tabs-custom mb-3">
        <li className="nav-item">
          <button type="button" className={`nav-link ${activeTab === "channels" ? "active" : ""}`} onClick={() => setActiveTab("channels")}>
            Channels ({channels.length})
          </button>
        </li>
        <li className="nav-item">
          <button type="button" className={`nav-link ${activeTab === "rules" ? "active" : ""}`} onClick={() => setActiveTab("rules")}>
            Rules ({rules.length})
          </button>
        </li>
      </ul>

      {error ? <div className="alert alert-danger">{error}</div> : null}
      {chError && activeTab === "channels" ? <div className="alert alert-danger">{chError}</div> : null}
      {ruleError && activeTab === "rules" ? <div className="alert alert-danger">{ruleError}</div> : null}

      {activeTab === "channels" ? (
        channels.length === 0 ? (
          <EmptyState title="No channels configured" description="Create a Discord, Slack, webhook, or email channel." />
        ) : (
          <div className="row">
            {channels.map((ch) => (
              <div className="col-md-6 col-xl-4" key={ch.id}>
                <div className="card">
                  <div className="card-body">
                    <div className="d-flex justify-content-between">
                      <div>
                        <h5 className="mb-1">{ch.name}</h5>
                        <span className="badge bg-primary-subtle text-primary text-uppercase">{ch.channel_type}</span>
                      </div>
                      <CyberSwitch checked={ch.enabled} disabled={!canWrite} onChange={() => void toggleChannel(ch)} />
                    </div>
                    <div className="d-flex justify-content-between mt-3">
                      <button type="button" className="btn btn-sm btn-light" disabled={!canWrite || testBusyId === ch.id} onClick={() => void testChannel(ch)}>
                        {testBusyId === ch.id ? "Sending…" : "Send test"}
                      </button>
                      {canWrite ? (
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => void deleteChannel(ch.id)}>
                          Delete
                        </button>
                      ) : null}
                    </div>
                    {testFeedback && testFeedback.channelId === ch.id ? (
                      <div className={`alert ${testFeedback.ok ? "alert-success" : "alert-danger"} mt-3 mb-0`}>{testFeedback.message}</div>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      ) : rules.length === 0 ? (
        <EmptyState title="No dispatch rules" description="Define severity thresholds and triggers to forward alerts." />
      ) : (
        <div className="card">
          <div className="card-body">
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Name</th>
                    <th>Min severity</th>
                    <th>Triggers</th>
                    <th>Channels</th>
                    <th>Enabled</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => (
                    <tr key={rule.id}>
                      <td>{rule.name}</td>
                      <td className="text-uppercase">{rule.min_severity}</td>
                      <td>{rule.triggers.join(", ")}</td>
                      <td>{rule.channel_ids.length}</td>
                      <td>
                        <CyberSwitch checked={rule.enabled} disabled={!canWrite} onChange={() => void toggleRule(rule)} />
                      </td>
                      <td className="text-end">
                        {canWrite ? (
                          <button type="button" className="btn btn-sm btn-light" onClick={() => void deleteRule(rule.id)}>
                            Delete
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Modal isOpen={createChannelOpen} onClose={() => setCreateChannelOpen(false)} title="Add channel">
        <form onSubmit={(e) => void onCreateChannel(e)}>
          <div className="mb-3">
            <label className="form-label">Name</label>
            <input required className="form-control" value={chName} onChange={(e) => setChName(e.target.value)} />
          </div>
          <div className="mb-3">
            <label className="form-label">Type</label>
            <select className="form-select" value={chType} onChange={(e) => setChType(e.target.value as ChannelType)}>
              <option value="discord">Discord</option>
              <option value="slack">Slack</option>
              <option value="webhook">Webhook</option>
              <option value="email">Email</option>
            </select>
          </div>
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
              <div className="mb-3">
                <label className="form-label">From</label>
                <input required className="form-control" value={smtpFrom} onChange={(e) => setSmtpFrom(e.target.value)} />
              </div>
              <div className="mb-3">
                <label className="form-label">To (comma separated)</label>
                <input required className="form-control" value={smtpTo} onChange={(e) => setSmtpTo(e.target.value)} />
              </div>
              <div className="mb-3">
                <label className="form-label">Username</label>
                <input className="form-control" value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} />
              </div>
              <div className="mb-3">
                <label className="form-label">Password</label>
                <input type="password" className="form-control" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} />
              </div>
            </>
          ) : (
            <div className="mb-3">
              <label className="form-label">Webhook URL</label>
              <input required className="form-control" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} />
            </div>
          )}
          {chError ? <div className="alert alert-danger">{chError}</div> : null}
          <div className="text-end">
            <button type="submit" className="btn btn-primary" disabled={chSaving}>
              {chSaving ? "Saving…" : "Create channel"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={createRuleOpen} onClose={() => setCreateRuleOpen(false)} title="Create routing rule">
        <form onSubmit={(e) => void onCreateRule(e)}>
          <div className="mb-3">
            <label className="form-label">Name</label>
            <input required className="form-control" value={ruleName} onChange={(e) => setRuleName(e.target.value)} />
          </div>
          <div className="mb-3">
            <label className="form-label">Minimum severity</label>
            <select className="form-select" value={minSeverity} onChange={(e) => setMinSeverity(e.target.value)}>
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="mb-3">
            <label className="form-label d-block">Triggers</label>
            {TRIGGERS.map((t) => (
              <CyberCheckbox key={t.id} variant="pill" label={t.label} checked={triggers.includes(t.id)} onChange={() => toggleTrigger(t.id)} />
            ))}
          </div>
          <div className="mb-3">
            <label className="form-label d-block">Channels</label>
            {channels.length === 0 ? (
              <p className="text-muted">Create a channel first.</p>
            ) : (
              channels.map((ch) => (
                <CyberCheckbox
                  key={ch.id}
                  variant="pill"
                  label={`${ch.name} (${ch.channel_type})`}
                  checked={channelIds.includes(ch.id)}
                  onChange={() => toggleChannelId(ch.id)}
                />
              ))
            )}
          </div>
          {ruleError ? <div className="alert alert-danger">{ruleError}</div> : null}
          <div className="text-end">
            <button type="submit" className="btn btn-primary" disabled={ruleSaving}>
              {ruleSaving ? "Saving…" : "Create rule"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
