"use client";

import { FormEvent, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@/lib/panel/use-query";
import { hasPermission } from "@/lib/permissions";
import type { AIAnalysis, AISettings } from "@/lib/types";

export default function AIPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canWrite = hasPermission(user, "ai", "write");

  const settingsQuery = useQuery("ai-settings", () => apiFetch<AISettings>("/ai/settings"));
  const analysesQuery = useQuery("ai-analyses", async () => (await apiFetch<{ analyses: AIAnalysis[] }>("/ai/analyses?limit=30")).analyses || [], {
    refreshMs: 30000,
  });

  const settings = settingsQuery.data;
  const analyses = analysesQuery.data || [];

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [baseURL, setBaseURL] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [alertId, setAlertId] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [latest, setLatest] = useState<AIAnalysis | null>(null);

  const formEnabled = enabled ?? settings?.enabled ?? false;
  const formProvider = provider ?? settings?.provider ?? "openai";
  const formBase = baseURL ?? settings?.base_url ?? "https://api.openai.com/v1";
  const formModel = model ?? settings?.model ?? "gpt-4o-mini";

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    setMsg(null);
    try {
      const body: Record<string, unknown> = {
        enabled: formEnabled,
        provider: formProvider,
        base_url: formBase,
        model: formModel,
      };
      if (apiKey.trim()) body.api_key = apiKey.trim();
      await apiFetch("/ai/settings", { method: "PUT", body: JSON.stringify(body) });
      setApiKey("");
      setMsg(t("ai.saved"));
      await settingsQuery.reload();
    } catch (err) {
      setMsg(err instanceof ApiRequestError ? err.message : t("ai.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function runAnalyze(e: FormEvent) {
    e.preventDefault();
    if (!canWrite || !alertId.trim()) return;
    setAnalyzing(true);
    setMsg(null);
    try {
      const res = await apiFetch<AIAnalysis>("/ai/analyze", {
        method: "POST",
        body: JSON.stringify({ alert_id: alertId.trim() }),
      });
      setLatest(res);
      await analysesQuery.reload();
    } catch (err) {
      setMsg(err instanceof ApiRequestError ? err.message : t("ai.analyzeFailed"));
    } finally {
      setAnalyzing(false);
    }
  }

  if (settingsQuery.loading && !settings) return <LoadingBlock />;
  if (settingsQuery.error) return <EmptyState title={t("ai.cannot")} description={settingsQuery.error} />;

  return (
    <>
      <PageHeader title={t("ai.title")} subtitle={t("ai.subtitle")} />
      {msg ? <div className="alert alert-info">{msg}</div> : null}

      <div className="row">
        <div className="col-xl-5">
          <div className="card">
            <div className="card-header">
              <h5 className="card-title mb-0">{t("ai.provider")}</h5>
            </div>
            <div className="card-body">
              <p className="text-muted">{t("ai.providerHint")}</p>
              <form onSubmit={(e) => void saveSettings(e)}>
                <fieldset disabled={!canWrite || saving}>
                  <div className="form-check form-switch mb-3">
                    <input className="form-check-input" type="checkbox" checked={formEnabled} onChange={(e) => setEnabled(e.target.checked)} id="ai-enabled" />
                    <label className="form-check-label" htmlFor="ai-enabled">
                      {t("ai.enabled")}
                    </label>
                  </div>
                  <label className="form-label">{t("ai.providerLabel")}</label>
                  <select className="form-select mb-3" value={formProvider} onChange={(e) => setProvider(e.target.value)}>
                    <option value="openai">OpenAI</option>
                    <option value="openai_compatible">{t("ai.compatible")}</option>
                  </select>
                  <label className="form-label">Base URL</label>
                  <input className="form-control mb-3" value={formBase} onChange={(e) => setBaseURL(e.target.value)} placeholder="https://api.openai.com/v1" />
                  <label className="form-label">{t("ai.model")}</label>
                  <input className="form-control mb-3" value={formModel} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" />
                  <label className="form-label">API key</label>
                  <input
                    className="form-control mb-2"
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={settings?.has_api_key ? t("ai.keyStored") : t("ai.keyPlaceholder")}
                  />
                  <p className="form-text mb-3">{settings?.has_api_key ? t("ai.hasKey") : t("ai.noKey")}</p>
                </fieldset>
                {canWrite ? (
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? t("views.saving") : t("ai.save")}
                  </button>
                ) : null}
              </form>
            </div>
          </div>

          {canWrite ? (
            <div className="card">
              <div className="card-header">
                <h5 className="card-title mb-0">{t("ai.run")}</h5>
              </div>
              <div className="card-body">
                <form onSubmit={(e) => void runAnalyze(e)}>
                  <label className="form-label">{t("ai.alertId")}</label>
                  <input className="form-control mb-3" value={alertId} onChange={(e) => setAlertId(e.target.value)} placeholder="uuid" required />
                  <button type="submit" className="btn btn-soft-primary" disabled={analyzing || !formEnabled}>
                    {analyzing ? t("ai.working") : t("ai.analyze")}
                  </button>
                </form>
              </div>
            </div>
          ) : null}
        </div>

        <div className="col-xl-7">
          {latest ? (
            <div className="card mb-3">
              <div className="card-header">
                <h5 className="card-title mb-0">{t("ai.latest")}</h5>
              </div>
              <div className="card-body">
                <AssessmentView assessment={latest.assessment} />
              </div>
            </div>
          ) : null}

          <div className="card">
            <div className="card-header">
              <h5 className="card-title mb-0">{t("ai.history")}</h5>
            </div>
            <div className="card-body">
              {analyses.length === 0 ? <EmptyState title={t("ai.none")} description={t("ai.noneHint")} /> : null}
              {analyses.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Status</th>
                        <th>{t("ai.model")}</th>
                        <th>Alert</th>
                        <th>{t("audit.when")}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {analyses.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <span className="badge bg-secondary-subtle text-secondary">{row.status}</span>
                          </td>
                          <td className="text-muted">{row.model}</td>
                          <td className="text-muted fs-12 text-truncate" style={{ maxWidth: 140 }}>
                            {row.alert_id || "—"}
                          </td>
                          <td className="text-muted text-nowrap fs-12">{row.created_at}</td>
                          <td className="text-end">
                            <button type="button" className="btn btn-soft-primary btn-sm" onClick={() => setLatest(row)}>
                              {t("common.open")}
                            </button>
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

function AssessmentView({ assessment }: { assessment: Record<string, unknown> | undefined }) {
  const { t } = useI18n();
  if (!assessment) return <p className="text-muted mb-0">{t("ai.emptyAssessment")}</p>;
  const summary = String(assessment.summary || "");
  const explanations = Array.isArray(assessment.possible_explanations) ? (assessment.possible_explanations as string[]) : [];
  const checks = Array.isArray(assessment.suggested_checks) ? (assessment.suggested_checks as string[]) : [];
  const actions = Array.isArray(assessment.suggested_actions) ? (assessment.suggested_actions as string[]) : [];
  const note = String(assessment.confidence_note || "");
  const disclaimer = String(assessment.disclaimer || t("ai.disclaimer"));

  return (
    <div>
      {summary ? <p className="mb-3">{summary}</p> : null}
      {explanations.length > 0 ? (
        <>
          <p className="text-muted text-uppercase fs-11 mb-1">{t("ai.explanations")}</p>
          <ul>
            {explanations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
      {checks.length > 0 ? (
        <>
          <p className="text-muted text-uppercase fs-11 mb-1">{t("ai.checks")}</p>
          <ul>
            {checks.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
      {actions.length > 0 ? (
        <>
          <p className="text-muted text-uppercase fs-11 mb-1">{t("ai.actions")}</p>
          <ul>
            {actions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      ) : null}
      {note ? <p className="text-muted fs-12 mb-2">{note}</p> : null}
      <p className="alert alert-warning mb-0 py-2 fs-12">{disclaimer}</p>
    </div>
  );
}
