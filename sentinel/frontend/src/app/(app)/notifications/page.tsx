"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { Modal } from "@/components/ui/modal";
import { CyberCheckbox, CyberSwitch } from "@/components/ui/cyber-checkbox";
import { BellIcon, SearchIcon, ShieldCheckIcon } from "@/components/ui/icons";
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

  // Tab
  const [activeTab, setActiveTab] = useState<"channels" | "rules">("channels");

  // Create Channel Modal
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

  // Create Rule Modal
  const [createRuleOpen, setCreateRuleOpen] = useState(false);
  const [ruleName, setRuleName] = useState("");
  const [minSeverity, setMinSeverity] = useState("high");
  const [triggers, setTriggers] = useState<string[]>(["alert.created"]);
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);

  // Test Channel Feedback
  const [testBusyId, setTestBusyId] = useState<string | null>(null);
  const [testFeedback, setTestFeedback] = useState<{
    channelId: string;
    ok: boolean;
    message: string;
  } | null>(null);

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
        if (smtpPassword) {
          body.secrets = { smtp_password: smtpPassword };
        }
      } else {
        body.secrets = { webhook_url: webhookUrl.trim() };
      }
      await apiFetch("/notification-channels", {
        method: "POST",
        body: JSON.stringify(body),
      });
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
      const res = await apiFetch<{ ok: boolean; message: string }>(
        `/notification-channels/${ch.id}/test`,
        { method: "POST" }
      );
      setTestFeedback({
        channelId: ch.id,
        ok: true,
        message: res.message || "Test dispatch sent successfully",
      });
    } catch (err) {
      setTestFeedback({
        channelId: ch.id,
        ok: false,
        message: err instanceof ApiRequestError ? err.message : "Test failed",
      });
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
    if (channelIds.includes(id)) {
      setChannelIds(channelIds.filter((c) => c !== id));
    } else {
      setChannelIds([...channelIds, id]);
    }
  }

  if (loading) return <LoadingBlock />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
            Dispatch & Incident Notifications
            <span className="rounded-full border border-sky-500/30 bg-sky-950/40 px-2.5 py-0.5 font-mono text-xs text-sky-400">
              {channels.length} Channels · {rules.length} Rules
            </span>
          </h1>
          <p className="mt-1 font-mono text-xs text-zinc-400">
            Real-time webhook relays, Discord/Slack integrations and SIEM severity routing
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCreateChannelOpen(true)}
              className="rounded-xl border border-sky-500/30 bg-sky-950/40 px-3.5 py-2 font-mono text-xs font-semibold text-sky-300 hover:bg-sky-500 hover:text-black transition shadow-[0_0_12px_rgba(0,163,255,0.2)]"
            >
              + Add Channel
            </button>
            <button
              onClick={() => setCreateRuleOpen(true)}
              className="rounded-xl bg-sky-500 px-4 py-2 font-mono text-xs font-semibold text-black hover:bg-sky-400 transition shadow-[0_0_15px_rgba(0,163,255,0.3)]"
            >
              + Create Routing Rule
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab("channels")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-xs font-semibold transition ${
            activeTab === "channels"
              ? "bg-sky-500/10 text-sky-400 border border-sky-500/30"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <BellIcon className="h-4 w-4" />
          <span>Notification Channels ({channels.length})</span>
        </button>
        <button
          onClick={() => setActiveTab("rules")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-xs font-semibold transition ${
            activeTab === "rules"
              ? "bg-sky-500/10 text-sky-400 border border-sky-500/30"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <ShieldCheckIcon className="h-4 w-4" />
          <span>Dispatch & Routing Rules ({rules.length})</span>
        </button>
      </div>

      {/* Channels Tab */}
      {activeTab === "channels" && (
        <div className="space-y-4">
          {channels.length === 0 ? (
            <EmptyState
              title="No channels configured"
              description="Create a Discord, Slack, Webhook or Email channel to receive threat notifications."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {channels.map((ch) => (
                <div
                  key={ch.id}
                  className="rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 p-5 shadow-xl backdrop-blur-md"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-display text-base font-bold text-white">{ch.name}</h3>
                      <span className="mt-1 inline-block rounded bg-sky-500/10 px-2 py-0.5 font-mono text-[10px] text-sky-400 uppercase">
                        {ch.channel_type}
                      </span>
                    </div>
                    <CyberSwitch
                      checked={ch.enabled}
                      disabled={!canWrite}
                      onChange={() => void toggleChannel(ch)}
                    />
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-zinc-800/60 pt-3">
                    <button
                      type="button"
                      disabled={!canWrite || testBusyId === ch.id}
                      onClick={() => void testChannel(ch)}
                      className="rounded-lg border border-sky-500/30 bg-sky-950/40 px-2.5 py-1 font-mono text-[11px] text-sky-300 hover:bg-sky-500 hover:text-black transition"
                    >
                      {testBusyId === ch.id ? "Sending Ping..." : "Send Test Ping"}
                    </button>
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => void deleteChannel(ch.id)}
                        className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-2.5 py-1 font-mono text-[11px] text-rose-300 hover:bg-rose-900/40 transition"
                      >
                        Delete
                      </button>
                    )}
                  </div>

                  {testFeedback && testFeedback.channelId === ch.id && (
                    <div
                      className={`mt-2.5 rounded-lg p-2 font-mono text-[10px] ${
                        testFeedback.ok
                          ? "border border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
                          : "border border-rose-500/40 bg-rose-950/40 text-rose-300"
                      }`}
                    >
                      {testFeedback.message}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Rules Tab */}
      {activeTab === "rules" && (
        <div className="space-y-4">
          {rules.length === 0 ? (
            <EmptyState
              title="No dispatch rules configured"
              description="Define severity thresholds and triggers to automate alert forwarding."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 p-5 shadow-xl backdrop-blur-md"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-display text-base font-bold text-white">{rule.name}</h3>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="font-mono text-[10px] text-zinc-400">Min Severity:</span>
                        <span className="rounded bg-rose-500/20 px-2 py-0.5 font-mono text-[10px] text-rose-300 uppercase font-semibold">
                          {rule.min_severity}
                        </span>
                      </div>
                    </div>
                    <CyberSwitch
                      checked={rule.enabled}
                      disabled={!canWrite}
                      onChange={() => void toggleRule(rule)}
                    />
                  </div>

                  <div className="mt-3 space-y-2 border-t border-zinc-800/60 pt-3 font-mono text-xs">
                    <div>
                      <span className="text-zinc-500 text-[10px] block">TRIGGERS</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {rule.triggers.map((t) => (
                          <span key={t} className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-300">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-zinc-500 text-[10px] block">CHANNELS ({rule.channel_ids.length})</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {rule.channel_ids.map((cid) => {
                          const ch = channels.find((c) => c.id === cid);
                          return (
                            <span key={cid} className="rounded border border-sky-500/30 bg-sky-950/40 px-2 py-0.5 text-[10px] text-sky-300">
                              {ch ? ch.name : cid}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {canWrite && (
                    <div className="mt-4 flex justify-end border-t border-zinc-800/60 pt-3">
                      <button
                        type="button"
                        onClick={() => void deleteRule(rule.id)}
                        className="rounded-lg border border-rose-500/30 bg-rose-950/20 px-2.5 py-1 font-mono text-[11px] text-rose-300 hover:bg-rose-900/40 transition"
                      >
                        Delete Rule
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Channel Modal */}
      <Modal
        isOpen={createChannelOpen}
        onClose={() => setCreateChannelOpen(false)}
        title="Add Notification Channel"
        subtitle="Route alerts to Discord, Slack, Webhooks or SMTP Email"
        maxWidth="max-w-2xl"
        footer={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreateChannelOpen(false)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-1.5 font-mono text-xs text-zinc-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={chSaving || !chName.trim()}
              onClick={onCreateChannel}
              className="rounded-lg bg-sky-500 px-4 py-1.5 font-mono text-xs font-semibold text-black hover:bg-sky-400 disabled:opacity-50 shadow-[0_0_12px_rgba(0,163,255,0.4)]"
            >
              {chSaving ? "Connecting..." : "Connect Channel"}
            </button>
          </div>
        }
      >
        <form onSubmit={onCreateChannel} className="space-y-4 font-mono text-xs">
          {chError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-rose-300">
              {chError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-zinc-400 block mb-1">CHANNEL NAME</label>
              <input
                type="text"
                value={chName}
                onChange={(e) => setChName(e.target.value)}
                placeholder="e.g. SecOps-Discord-Alerts"
                required
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">TYPE</label>
              <select
                value={chType}
                onChange={(e) => setChType(e.target.value as ChannelType)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500"
              >
                <option value="discord">Discord Webhook</option>
                <option value="slack">Slack Webhook</option>
                <option value="webhook">Generic Webhook</option>
                <option value="email">SMTP Email</option>
              </select>
            </div>
          </div>

          {chType !== "email" ? (
            <div>
              <label className="text-zinc-400 block mb-1">WEBHOOK URL</label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                required
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">SMTP HOST</label>
                  <input
                    type="text"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.mailgun.org"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">SMTP PORT</label>
                  <input
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.target.value))}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-zinc-400 block mb-1">FROM EMAIL</label>
                  <input
                    type="email"
                    value={smtpFrom}
                    onChange={(e) => setSmtpFrom(e.target.value)}
                    placeholder="alerts@defentrax.org"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">RECIPIENTS (CSV)</label>
                  <input
                    type="text"
                    value={smtpTo}
                    onChange={(e) => setSmtpTo(e.target.value)}
                    placeholder="soc@company.com, admin@company.com"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            </div>
          )}
        </form>
      </Modal>

      {/* Create Rule Modal */}
      <Modal
        isOpen={createRuleOpen}
        onClose={() => setCreateRuleOpen(false)}
        title="Create Incident Routing Rule"
        subtitle="Filter severity and dispatch to selected destinations"
        maxWidth="max-w-2xl"
        footer={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreateRuleOpen(false)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-1.5 font-mono text-xs text-zinc-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={ruleSaving || !ruleName.trim() || channelIds.length === 0}
              onClick={onCreateRule}
              className="rounded-lg bg-sky-500 px-4 py-1.5 font-mono text-xs font-semibold text-black hover:bg-sky-400 disabled:opacity-50 shadow-[0_0_12px_rgba(0,163,255,0.4)]"
            >
              {ruleSaving ? "Saving..." : "Create Rule"}
            </button>
          </div>
        }
      >
        <form onSubmit={onCreateRule} className="space-y-4 font-mono text-xs">
          {ruleError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-rose-300">
              {ruleError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-zinc-400 block mb-1">RULE NAME</label>
              <input
                type="text"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="Critical Incidents Relay"
                required
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">MINIMUM SEVERITY</label>
              <select
                value={minSeverity}
                onChange={(e) => setMinSeverity(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500 uppercase"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>{s.toUpperCase()}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="text-zinc-400 block mb-2">EVENT TRIGGERS</label>
            <div className="flex flex-wrap gap-2">
              {TRIGGERS.map((t) => (
                <CyberCheckbox
                  key={t.id}
                  variant="pill"
                  label={t.label}
                  checked={triggers.includes(t.id)}
                  onChange={() => toggleTrigger(t.id)}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-zinc-400 block mb-2">TARGET NOTIFICATION CHANNELS</label>
            {channels.length === 0 ? (
              <p className="text-zinc-500 text-xs">No channels available. Create a channel first.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {channels.map((ch) => (
                  <CyberCheckbox
                    key={ch.id}
                    variant="pill"
                    label={`${ch.name} (${ch.channel_type})`}
                    checked={channelIds.includes(ch.id)}
                    onChange={() => toggleChannelId(ch.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </form>
      </Modal>
    </div>
  );
}
