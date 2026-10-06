"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { CyberCheckbox } from "@/components/ui/cyber-checkbox";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import { useAuth } from "@/context/auth-context";
import type { NotificationChannel, NotificationRule } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand-500/60";
const btnPrimary =
  "rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-black hover:bg-brand-400 disabled:opacity-50";
const btnDanger =
  "rounded-lg border border-red-800/60 px-3 py-1.5 text-xs text-red-300 hover:border-red-500/60";

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

  const [ruleName, setRuleName] = useState("");
  const [minSeverity, setMinSeverity] = useState("high");
  const [triggers, setTriggers] = useState<string[]>(["alert.created"]);
  const [channelIds, setChannelIds] = useState<string[]>([]);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleError, setRuleError] = useState<string | null>(null);

  /** Per-channel test feedback: success toast + failure log snippet */
  const [testBusyId, setTestBusyId] = useState<string | null>(null);
  const [testFeedback, setTestFeedback] = useState<{
    channelId: string;
    ok: boolean;
    message: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const [ch, ru] = await Promise.all([
        apiFetch<{ channels: NotificationChannel[] }>("/notification-channels"),
        apiFetch<{ rules: NotificationRule[] }>("/notification-rules"),
      ]);
      setChannels(ch.channels || []);
      setRules(ru.rules || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const channelNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of channels) m.set(c.id, `${c.name} (${c.channel_type})`);
    return m;
  }, [channels]);

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
          to: smtpTo
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
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
      await load();
    } catch (err) {
      setChError(
        err instanceof ApiRequestError ? err.message : "Channel create failed",
      );
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
      setChError(
        err instanceof ApiRequestError ? err.message : "Update failed",
      );
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
      setChError(
        err instanceof ApiRequestError ? err.message : "Delete failed",
      );
    }
  }

  async function testChannel(ch: NotificationChannel) {
    if (!canWrite) return;
    setTestBusyId(ch.id);
    setTestFeedback(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        message: string;
      }>(`/notification-channels/${ch.id}/test`, { method: "POST" });
      setTestFeedback({
        channelId: ch.id,
        ok: true,
        message: res.message || "Test notification sent",
      });
    } catch (err) {
      const msg =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Test failed";
      setTestFeedback({
        channelId: ch.id,
        ok: false,
        message: msg,
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
      await load();
    } catch (err) {
      setRuleError(
        err instanceof ApiRequestError ? err.message : "Rule create failed",
      );
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
      setRuleError(
        err instanceof ApiRequestError ? err.message : "Update failed",
      );
    }
  }

  async function deleteRule(id: string) {
    if (!canWrite) return;
    if (!confirm("Delete this notification rule?")) return;
    try {
      await apiFetch(`/notification-rules/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setRuleError(
        err instanceof ApiRequestError ? err.message : "Delete failed",
      );
    }
  }

  function toggleTrigger(id: string) {
    setTriggers((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  }

  function toggleChannelId(id: string) {
    setChannelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  if (loading) return <LoadingBlock />;
  if (error) {
    return <EmptyState title="Cannot load notifications" description={error} />;
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="font-display text-2xl font-semibold text-white">
          Notifications
        </h1>
        <p className="text-sm text-zinc-500">
          Channels deliver alerts; rules decide when and to which channels
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-400">
          Channels
        </h2>

        {canWrite ? (
          <form
            onSubmit={onCreateChannel}
            className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-5"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-zinc-400">
                Name *
                <input
                  className={`${inputClass} mt-1`}
                  value={chName}
                  onChange={(e) => setChName(e.target.value)}
                  required
                  placeholder="ops-discord"
                />
              </label>
              <label className="block text-sm text-zinc-400">
                Type *
                <select
                  className={`${inputClass} mt-1`}
                  value={chType}
                  onChange={(e) => setChType(e.target.value as ChannelType)}
                >
                  <option value="discord">Discord</option>
                  <option value="slack">Slack</option>
                  <option value="webhook">Webhook</option>
                  <option value="email">Email (SMTP)</option>
                </select>
              </label>
            </div>

            {chType === "email" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-zinc-400">
                  SMTP host *
                  <input
                    className={`${inputClass} mt-1`}
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    required
                    placeholder="smtp.example.com"
                  />
                </label>
                <label className="block text-sm text-zinc-400">
                  SMTP port
                  <input
                    className={`${inputClass} mt-1`}
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.target.value) || 587)}
                  />
                </label>
                <label className="block text-sm text-zinc-400">
                  From *
                  <input
                    className={`${inputClass} mt-1`}
                    value={smtpFrom}
                    onChange={(e) => setSmtpFrom(e.target.value)}
                    required
                    placeholder="sentinel@example.com"
                  />
                </label>
                <label className="block text-sm text-zinc-400">
                  To (comma-separated) *
                  <input
                    className={`${inputClass} mt-1`}
                    value={smtpTo}
                    onChange={(e) => setSmtpTo(e.target.value)}
                    required
                    placeholder="oncall@example.com"
                  />
                </label>
                <label className="block text-sm text-zinc-400">
                  SMTP username
                  <input
                    className={`${inputClass} mt-1`}
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                  />
                </label>
                <label className="block text-sm text-zinc-400">
                  SMTP password
                  <input
                    className={`${inputClass} mt-1`}
                    type="password"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
              </div>
            ) : (
              <label className="block text-sm text-zinc-400">
                Webhook URL *
                <input
                  className={`${inputClass} mt-1`}
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  required
                  placeholder="https://hooks.slack.com/... or Discord webhook"
                  type="url"
                />
              </label>
            )}

            {chError ? <p className="text-sm text-red-400">{chError}</p> : null}
            <p className="text-xs text-zinc-600">
              Secrets are encrypted at rest. Requires{" "}
              <code className="text-zinc-400">SECRETS_ENCRYPTION_KEY</code> in
              the API environment.
            </p>
            <button
              type="submit"
              className={btnPrimary}
              disabled={chSaving || !chName.trim()}
            >
              {chSaving ? "Saving…" : "Add channel"}
            </button>
          </form>
        ) : null}

        {channels.length === 0 ? (
          <EmptyState
            title="No channels yet"
            description="Add Discord, Slack, email, or a generic webhook."
          />
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
            {channels.map((ch) => {
              const fb =
                testFeedback?.channelId === ch.id ? testFeedback : null;
              return (
                <li
                  key={ch.id}
                  className="flex flex-col gap-2 px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-zinc-100">{ch.name}</p>
                      <p className="text-xs text-zinc-500">
                        {ch.channel_type}
                        {ch.has_secrets ? " · secrets set" : ""} ·{" "}
                        {ch.enabled ? "enabled" : "disabled"}
                      </p>
                    </div>
                    {canWrite ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-brand-500/50 disabled:opacity-50"
                          disabled={testBusyId === ch.id}
                          onClick={() => void testChannel(ch)}
                        >
                          {testBusyId === ch.id ? "Testing…" : "Test"}
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-brand-500/50"
                          onClick={() => void toggleChannel(ch)}
                        >
                          {ch.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          className={btnDanger}
                          onClick={() => void deleteChannel(ch.id)}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                  {fb ? (
                    <div
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        fb.ok
                          ? "border-emerald-800/60 bg-emerald-950/40 text-emerald-300"
                          : "border-red-800/60 bg-red-950/40 text-red-300"
                      }`}
                      role="status"
                    >
                      <p className="font-medium">
                        {fb.ok ? "Test succeeded" : "Test failed"}
                      </p>
                      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] opacity-90">
                        {fb.message}
                      </pre>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-widest text-zinc-400">
          Rules
        </h2>

        {canWrite ? (
          <form
            onSubmit={onCreateRule}
            className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-5"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-zinc-400">
                Rule name *
                <input
                  className={`${inputClass} mt-1`}
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  required
                  placeholder="critical-to-discord"
                />
              </label>
              <label className="block text-sm text-zinc-400">
                Minimum severity *
                <select
                  className={`${inputClass} mt-1`}
                  value={minSeverity}
                  onChange={(e) => setMinSeverity(e.target.value)}
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset>
              <legend className="text-sm text-zinc-400">Triggers</legend>
              <div className="mt-2 flex flex-wrap gap-3">
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
            </fieldset>

            <fieldset>
              <legend className="text-sm text-zinc-400">Channels</legend>
              {channels.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-600">
                  Create a channel first.
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-3">
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
            </fieldset>

            {ruleError ? (
              <p className="text-sm text-red-400">{ruleError}</p>
            ) : null}
            <button
              type="submit"
              className={btnPrimary}
              disabled={ruleSaving || !ruleName.trim() || triggers.length === 0}
            >
              {ruleSaving ? "Saving…" : "Add rule"}
            </button>
          </form>
        ) : null}

        {rules.length === 0 ? (
          <EmptyState
            title="No notification rules"
            description="Rules link severities/triggers to one or more channels."
          />
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <p className="text-zinc-100">{rule.name}</p>
                  <p className="text-xs text-zinc-500">
                    ≥ {rule.min_severity} · {rule.triggers.join(", ") || "—"} ·{" "}
                    {(rule.channel_ids || [])
                      .map((id) => channelNameById.get(id) || id.slice(0, 8))
                      .join(", ") || "no channels"}{" "}
                    · {rule.enabled ? "enabled" : "disabled"}
                  </p>
                </div>
                {canWrite ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-brand-500/50"
                      onClick={() => void toggleRule(rule)}
                    >
                      {rule.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      className={btnDanger}
                      onClick={() => void deleteRule(rule.id)}
                    >
                      Delete
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
