"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { Modal } from "@/components/ui/modal";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { CyberSwitch } from "@/components/ui/cyber-checkbox";
import { SearchIcon, ShieldCheckIcon } from "@/components/ui/icons";
import { useAuth } from "@/context/auth-context";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import type { Rule } from "@/lib/types";

const fieldClass =
  "mt-1.5 w-full rounded-xl border border-zinc-800 bg-zinc-950/70 px-3 py-2 font-mono text-xs text-zinc-200 placeholder-zinc-600 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500";

export default function RulesPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, "rules", "write");
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [source, setSource] = useState("");
  const [category, setCategory] = useState("");
  const [eventType, setEventType] = useState("");
  const [messageContains, setMessageContains] = useState("");
  const [fieldsText, setFieldsText] = useState("");
  const [thresholdCount, setThresholdCount] = useState("");
  const [windowSeconds, setWindowSeconds] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [actionTitle, setActionTitle] = useState("");
  const [actionDescription, setActionDescription] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch<{ rules: Rule[] }>("/rules");
        setRules(res.rules || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load rules");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function toggleRule(id: string, enabled: boolean) {
    if (!canWrite) return;
    setBusyId(id);
    try {
      await apiFetch(`/rules/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !enabled }),
      });
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Toggle failed");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(
    () =>
      rules.filter((r) => {
        const q = search.toLowerCase();
        const matches =
          q === "" ||
          r.name.toLowerCase().includes(q) ||
          r.rule_id.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q);
        const sev = severityFilter === "ALL" || r.severity?.toUpperCase() === severityFilter;
        return matches && sev;
      }),
    [rules, search, severityFilter],
  );

  function resetComposer() {
    setName("");
    setDescription("");
    setSeverity("medium");
    setSource("");
    setCategory("");
    setEventType("");
    setMessageContains("");
    setFieldsText("");
    setThresholdCount("");
    setWindowSeconds("");
    setGroupBy("");
    setActionTitle("");
    setActionDescription("");
    setFormError(null);
  }

  async function createRule(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    const fields: Record<string, string> = {};
    for (const line of fieldsText.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) {
        setFormError("Each field line must look like key=value");
        return;
      }
      fields[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await apiFetch<Rule>("/rules", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          severity,
          source: source.trim(),
          category: category.trim(),
          event_type: eventType.trim(),
          message_contains: messageContains.trim(),
          fields,
          threshold_count: thresholdCount ? Number(thresholdCount) : 0,
          window_seconds: windowSeconds ? Number(windowSeconds) : 0,
          group_by: groupBy
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean),
          action_title: actionTitle.trim(),
          action_description: actionDescription.trim(),
        }),
      });
      setRules((prev) => [created, ...prev.filter((r) => r.id !== created.id)]);
      setComposerOpen(false);
      resetComposer();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : "Could not create rule");
    } finally {
      setSaving(false);
    }
  }

  const enabledCount = rules.filter((r) => r.enabled).length;
  const counts = {
    critical: rules.filter((r) => r.severity?.toUpperCase() === "CRITICAL").length,
    high: rules.filter((r) => r.severity?.toUpperCase() === "HIGH").length,
  };

  if (loading) return <LoadingBlock />;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
            Detection Rules
            <span className="rounded-full border border-sky-500/30 bg-sky-950/40 px-2.5 py-0.5 font-mono text-xs text-sky-400">
              {rules.length} total · {enabledCount} armed
            </span>
          </h1>
          <p className="mt-1 font-mono text-xs text-zinc-400">
            Bundled signatures plus rules you add here
          </p>
        </div>
        {canWrite ? (
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setComposerOpen(true);
            }}
            className="rounded-xl border border-sky-500/40 bg-sky-500/15 px-4 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/25"
          >
            New rule
          </button>
        ) : null}
      </header>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "RULES ARMED", value: enabledCount, tone: "text-emerald-400" },
          { label: "CRITICAL RULES", value: counts.critical, tone: "text-rose-400" },
          { label: "HIGH RULES", value: counts.high, tone: "text-amber-400" },
          { label: "TOTAL SIGNATURES", value: rules.length, tone: "text-sky-400" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 p-4 shadow-xl backdrop-blur-md"
          >
            <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">{s.label}</p>
            <p className={`font-display mt-1.5 text-2xl font-bold ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 p-4 shadow-xl backdrop-blur-md sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, ID or description..."
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 py-2.5 pl-10 pr-4 font-mono text-xs text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-950/50 p-1">
          {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`rounded-lg px-2 py-1 font-mono text-[10px] font-semibold transition ${
                severityFilter === sev
                  ? "bg-zinc-800 text-sky-400 border border-sky-500/40"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 font-mono text-xs text-rose-300">{error}</div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No rules match" description="Adjust your search or severity filter." />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((rule) => (
            <div
              key={rule.id}
              className={`relative overflow-hidden rounded-2xl border p-5 shadow-xl backdrop-blur-md transition-all ${
                rule.enabled
                  ? "border-sky-500/25 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90"
                  : "border-zinc-800/80 bg-zinc-950/60 opacity-70"
              }`}
            >
              {rule.enabled && (
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-sky-400 to-transparent opacity-60" />
              )}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                      rule.enabled
                        ? "border-sky-500/30 bg-sky-950/40 text-sky-400"
                        : "border-zinc-800 bg-zinc-900 text-zinc-600"
                    }`}
                  >
                    <ShieldCheckIcon className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="font-display text-sm font-semibold text-white">
                      {rule.name}
                      {rule.custom ? (
                        <span className="ml-2 rounded-full border border-emerald-500/30 px-1.5 py-0.5 font-mono text-[10px] font-medium text-emerald-300">
                          CUSTOM
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs leading-snug text-zinc-400">{rule.description}</p>
                    <p className="mt-1.5 font-mono text-[10px] text-zinc-600">{rule.rule_id}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <SeverityBadge severity={rule.severity} />
                  <CyberSwitch
                    checked={rule.enabled}
                    disabled={!canWrite || busyId === rule.id}
                    onChange={() => void toggleRule(rule.id, rule.enabled)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        title="New detection rule"
        subtitle="Matches incoming events and can open an alert. Use possibility wording such as “Possible …”."
        maxWidth="max-w-3xl"
      >
        <form className="space-y-4" onSubmit={(e) => void createRule(e)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-zinc-400">
              Name
              <input required value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="Possible repeated sudo" />
            </label>
            <label className="block text-xs text-zinc-400">
              Severity
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} className={fieldClass}>
                {["info", "low", "medium", "high", "critical"].map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs text-zinc-400">
            Description
            <textarea required rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={fieldClass} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-zinc-400">
              Source
              <input value={source} onChange={(e) => setSource(e.target.value)} className={fieldClass} placeholder="authlog" />
            </label>
            <label className="block text-xs text-zinc-400">
              Category
              <input value={category} onChange={(e) => setCategory(e.target.value)} className={fieldClass} placeholder="auth" />
            </label>
            <label className="block text-xs text-zinc-400">
              Event type
              <input value={eventType} onChange={(e) => setEventType(e.target.value)} className={fieldClass} />
            </label>
            <label className="block text-xs text-zinc-400">
              Message contains
              <input value={messageContains} onChange={(e) => setMessageContains(e.target.value)} className={fieldClass} placeholder="failed password" />
            </label>
          </div>
          <label className="block text-xs text-zinc-400">
            Fields, one key=value per line
            <textarea rows={3} value={fieldsText} onChange={(e) => setFieldsText(e.target.value)} className={fieldClass} placeholder={"result=failed\nprogram=sshd"} />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs text-zinc-400">
              Threshold count
              <input inputMode="numeric" value={thresholdCount} onChange={(e) => setThresholdCount(e.target.value)} className={fieldClass} placeholder="5" />
            </label>
            <label className="block text-xs text-zinc-400">
              Window seconds
              <input inputMode="numeric" value={windowSeconds} onChange={(e) => setWindowSeconds(e.target.value)} className={fieldClass} placeholder="300" />
            </label>
            <label className="block text-xs text-zinc-400">
              Group by
              <input value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className={fieldClass} placeholder="src_ip, host" />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-zinc-400">
              Alert title
              <input value={actionTitle} onChange={(e) => setActionTitle(e.target.value)} className={fieldClass} placeholder="Defaults to the rule name" />
            </label>
            <label className="block text-xs text-zinc-400">
              Alert description
              <input value={actionDescription} onChange={(e) => setActionDescription(e.target.value)} className={fieldClass} placeholder="Defaults to the rule description" />
            </label>
          </div>
          {formError ? <p className="text-xs text-rose-300">{formError}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setComposerOpen(false)} className="rounded-xl border border-zinc-700 px-4 py-2 text-xs text-zinc-300">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-xl bg-sky-500 px-4 py-2 text-xs font-semibold text-black disabled:opacity-50">
              {saving ? "Saving…" : "Create rule"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
