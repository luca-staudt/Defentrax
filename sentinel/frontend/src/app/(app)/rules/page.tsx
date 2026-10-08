"use client";

import { FormEvent, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { PageHeader } from "@/components/ui/page-header";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { SilenceControl, writeTargetSilence } from "@/components/operator/silence-control";
import { useAuth } from "@/context/auth-context";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { severityLabel, useI18n } from "@/lib/i18n";
import { patchQuery } from "@/lib/panel/cache";
import { useQuery } from "@/lib/panel/use-query";
import { hasPermission } from "@/lib/permissions";
import type { Rule } from "@/lib/types";

const EMPTY_RULES: Rule[] = [];
const SEVERITIES = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="form-text">{children}</p>;
}

export default function RulesPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canWrite = hasPermission(user, "rules", "write");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [composerReady, setComposerReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [silenceBusy, setSilenceBusy] = useState(false);
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

  const rulesQuery = useQuery("rules", async () => (await apiFetch<{ rules: Rule[] }>("/rules")).rules || [], {
    refreshMs: 20000,
  });
  const rules = rulesQuery.data ?? EMPTY_RULES;
  const loading = rulesQuery.loading;
  const loadError = rulesQuery.error;

  async function toggleRule(id: string, enabled: boolean) {
    if (!canWrite) return;
    setBusyId(id);
    try {
      await apiFetch(`/rules/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !enabled }),
      });
      patchQuery<Rule[]>("rules", (prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !enabled } : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("rules.toggleFailed"));
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
    setEditingId(null);
    setFormError(null);
    setComposerReady(true);
  }

  function openEdit(rule: Rule) {
    const def = rule.definition;
    const fields = def?.condition?.fields || {};
    setEditingId(rule.id);
    setName(rule.name);
    setDescription(rule.description || "");
    setSeverity((rule.severity || "medium").toLowerCase());
    setSource(def?.condition?.source || "");
    setCategory(def?.condition?.category || "");
    setEventType(def?.condition?.event_type || "");
    setMessageContains(def?.condition?.message_contains || "");
    setFieldsText(Object.entries(fields).map(([key, value]) => `${key}=${value}`).join("\n"));
    setThresholdCount(def?.threshold?.count ? String(def.threshold.count) : "");
    setWindowSeconds(def?.threshold?.window_seconds ? String(def.threshold.window_seconds) : "");
    setGroupBy((def?.group_by || []).join(", "));
    setActionTitle(def?.action?.title || "");
    setActionDescription(def?.action?.description || "");
    setFormError(null);
    setComposerReady(true);
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
        setFormError(t("rules.fieldError"));
        return;
      }
      fields[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    setSaving(true);
    setFormError(null);
    try {
      const created = await apiFetch<Rule>(editingId ? `/rules/${editingId}` : "/rules", {
        method: editingId ? "PATCH" : "POST",
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
      patchQuery<Rule[]>("rules", (prev) =>
        editingId ? prev.map((r) => (r.id === created.id ? created : r)) : [created, ...prev.filter((r) => r.id !== created.id)],
      );
      if (!rulesQuery.data) await rulesQuery.reload();
      setEditingId(created.id);
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : t("rules.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const editing = rules.find((rule) => rule.id === editingId) ?? null;

  async function changeSilence(until: string | null) {
    if (!editingId || !canWrite) return;
    setSilenceBusy(true);
    setFormError(null);
    try {
      await writeTargetSilence(`/rules/${editingId}/silence`, until);
      await rulesQuery.reload();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : t("rules.saveFailed"));
    } finally {
      setSilenceBusy(false);
    }
  }

  const enabledCount = rules.filter((r) => r.enabled).length;
  const counts = {
    critical: rules.filter((r) => r.severity?.toUpperCase() === "CRITICAL").length,
    high: rules.filter((r) => r.severity?.toUpperCase() === "HIGH").length,
  };

  if (loading) return <LoadingBlock />;

  return (
    <>
      <PageHeader
        title={t("rules.title")}
        subtitle={t("rules.subtitle")}
        actions={
          canWrite ? (
            <button type="button" className="btn btn-primary" onClick={resetComposer}>
              {t("rules.new")}
            </button>
          ) : null
        }
      />

      <div className="row g-3 mb-3">
        <Metric label={t("rules.armed")} value={enabledCount} />
        <Metric label={t("rules.critical")} value={counts.critical} />
        <Metric label={t("rules.high")} value={counts.high} />
        <Metric label={t("rules.total")} value={rules.length} />
      </div>

      {error || loadError ? <div className="alert alert-danger">{error || loadError}</div> : null}

      <div className="row">
        <div className="col-xl-4">
          <div className="card">
            <div className="card-body">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("rules.search")}
                className="form-control mb-2"
              />
              <select className="form-select" value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
                {SEVERITIES.map((level) => (
                  <option key={level} value={level}>
                    {level === "ALL" ? t("rules.every") : severityLabel(t, level)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              {filtered.length === 0 ? (
                <EmptyState title={t("rules.none")} description={t("rules.noneHint")} />
              ) : (
                <div className="dx-log">
                  {filtered.map((rule) => (
                    <div key={rule.id} className="d-flex align-items-stretch gap-2">
                      <button
                        type="button"
                        className={`flex-grow-1 ${editingId === rule.id ? "is-on" : ""}`}
                        onClick={() => openEdit(rule)}
                      >
                        <span className="d-flex justify-content-between gap-2">
                          <span className="fw-medium">
                            {rule.name}
                            {rule.custom ? <span className="badge bg-success-subtle text-success ms-2">{t("rules.custom")}</span> : null}
                            {rule.silenced_until ? <span className="badge bg-warning-subtle text-warning ms-2">{t("silence.quiet")}</span> : null}
                          </span>
                          <SeverityBadge severity={rule.severity} />
                        </span>
                        <span className="d-block text-muted fs-12 mt-1">{rule.rule_id}</span>
                      </button>
                      {canWrite ? (
                        <div className="form-check form-switch d-flex align-items-center m-0 px-1" title={rule.enabled ? t("rules.on") : t("rules.off")}>
                          <input
                            className="form-check-input"
                            type="checkbox"
                            role="switch"
                            checked={rule.enabled}
                            disabled={busyId === rule.id}
                            onChange={() => void toggleRule(rule.id, rule.enabled)}
                            aria-label={`${t("rules.arm")} ${rule.name}`}
                          />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-xl-8">
          <div className="card">
            <div className="card-header">
              <h4 className="card-title mb-0">{editingId ? t("rules.edit") : t("rules.createTitle")}</h4>
            </div>
            <div className="card-body">
              {!canWrite ? (
                <p className="text-muted mb-0">{t("rules.readonly")}</p>
              ) : !composerReady ? (
                <EmptyState title={t("rules.pick")} description={t("rules.pickHint")} />
              ) : (
                <form onSubmit={(e) => void createRule(e)}>
                  {editing ? (
                    <div className="mb-3">
                      <SilenceControl until={editing.silenced_until} disabled={!canWrite} busy={silenceBusy} onChange={changeSilence} />
                    </div>
                  ) : null}
                  <div className="alert alert-info">
                    {t("rules.banner")}
                    {editingId ? t("rules.bannerEdit") : t("rules.bannerNew")}
                  </div>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">{t("rules.f.name")}</label>
                      <input required value={name} onChange={(e) => setName(e.target.value)} className="form-control" placeholder={t("rules.ph.name")} />
                      <Hint>{t("rules.h.name")}</Hint>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">{t("rules.f.severity")}</label>
                      <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="form-select">
                        {["info", "low", "medium", "high", "critical"].map((level) => (
                          <option key={level} value={level}>
                            {severityLabel(t, level)}
                          </option>
                        ))}
                      </select>
                      <Hint>{t("rules.h.severity")}</Hint>
                    </div>
                    <div className="col-12">
                      <label className="form-label">{t("rules.f.description")}</label>
                      <textarea required rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="form-control" />
                      <Hint>{t("rules.h.description")}</Hint>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">{t("rules.f.source")}</label>
                      <input value={source} onChange={(e) => setSource(e.target.value)} className="form-control" placeholder="authlog" />
                      <Hint>{t("rules.h.source")}</Hint>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">{t("rules.f.category")}</label>
                      <input value={category} onChange={(e) => setCategory(e.target.value)} className="form-control" placeholder="auth" />
                      <Hint>{t("rules.h.category")}</Hint>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">{t("rules.f.eventType")}</label>
                      <input value={eventType} onChange={(e) => setEventType(e.target.value)} className="form-control" />
                      <Hint>{t("rules.h.eventType")}</Hint>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">{t("rules.f.message")}</label>
                      <input value={messageContains} onChange={(e) => setMessageContains(e.target.value)} className="form-control" placeholder="failed password" />
                      <Hint>{t("rules.h.message")}</Hint>
                    </div>
                    <div className="col-12">
                      <label className="form-label">{t("rules.f.fields")}</label>
                      <textarea rows={3} value={fieldsText} onChange={(e) => setFieldsText(e.target.value)} className="form-control" placeholder={"result=failed\nprogram=sshd"} />
                      <Hint>{t("rules.h.fields")}</Hint>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">{t("rules.f.threshold")}</label>
                      <input inputMode="numeric" value={thresholdCount} onChange={(e) => setThresholdCount(e.target.value)} className="form-control" placeholder="5" />
                      <Hint>{t("rules.h.threshold")}</Hint>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">{t("rules.f.window")}</label>
                      <input inputMode="numeric" value={windowSeconds} onChange={(e) => setWindowSeconds(e.target.value)} className="form-control" placeholder="300" />
                      <Hint>{t("rules.h.window")}</Hint>
                    </div>
                    <div className="col-md-4">
                      <label className="form-label">{t("rules.f.group")}</label>
                      <input value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="form-control" placeholder="src_ip, host" />
                      <Hint>{t("rules.h.group")}</Hint>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">{t("rules.f.alertTitle")}</label>
                      <input value={actionTitle} onChange={(e) => setActionTitle(e.target.value)} className="form-control" placeholder={t("rules.ph.alertTitle")} />
                      <Hint>{t("rules.h.alertTitle")}</Hint>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">{t("rules.f.alertDescription")}</label>
                      <input value={actionDescription} onChange={(e) => setActionDescription(e.target.value)} className="form-control" placeholder={t("rules.ph.alertDesc")} />
                      <Hint>{t("rules.h.alertDescription")}</Hint>
                    </div>
                  </div>
                  {formError ? <div className="alert alert-danger mt-3">{formError}</div> : null}
                  <div className="d-flex justify-content-end gap-2 mt-3">
                    <button type="submit" disabled={saving} className="btn btn-primary">
                      {saving ? t("rules.saving") : editingId ? t("rules.save") : t("rules.create")}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="col-6 col-xl-3">
      <div className="dx-metric">
        <span className="text-muted text-uppercase fs-12">{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
