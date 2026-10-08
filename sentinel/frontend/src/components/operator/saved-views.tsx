"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { useQuery } from "@/lib/panel/use-query";

export type SavedView = {
  id: string;
  kind: "alerts" | "events";
  name: string;
  query: Record<string, string>;
  is_default: boolean;
};

export function SavedViews({
  kind,
  current,
  onApply,
}: {
  kind: "alerts" | "events";
  current: Record<string, string>;
  onApply: (query: Record<string, string>) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [asDefault, setAsDefault] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const booted = useRef(false);
  const viewsQuery = useQuery(`saved-views:${kind}`, async () => {
    const res = await apiFetch<{ views: SavedView[] }>(`/saved-views?kind=${kind}`);
    return res.views || [];
  });
  const views = viewsQuery.data ?? [];

  useEffect(() => {
    if (booted.current || !viewsQuery.data) return;
    booted.current = true;
    const preferred = viewsQuery.data.find((view) => view.is_default);
    if (preferred) onApply(preferred.query || {});
  }, [viewsQuery.data, onApply]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/saved-views", {
        method: "POST",
        body: JSON.stringify({
          kind,
          name: name.trim(),
          query: current,
          is_default: asDefault,
        }),
      });
      setName("");
      setAsDefault(false);
      await viewsQuery.reload();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await apiFetch(`/saved-views/${id}`, { method: "DELETE" });
      await viewsQuery.reload();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Delete failed");
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h4 className="card-title mb-0">{t("alerts.views")}</h4>
      </div>
      <div className="card-body">
        {views.length === 0 ? <p className="text-muted">{t("views.empty")}</p> : null}
        <div className="dx-log mb-3">
          {views.map((view) => (
            <div key={view.id} className="d-flex gap-2">
              <button type="button" className="flex-grow-1" onClick={() => onApply(view.query || {})}>
                <span className="fw-medium">{view.name}</span>
                {view.is_default ? <span className="badge bg-primary-subtle text-primary ms-2">{t("views.default")}</span> : null}
              </button>
              <button type="button" className="btn btn-sm btn-light" onClick={() => void remove(view.id)} aria-label={t("common.delete")}>
                {t("common.delete")}
              </button>
            </div>
          ))}
        </div>
        <form onSubmit={(event) => void onSave(event)}>
          <input
            className="form-control mb-2"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("views.name")}
            maxLength={80}
          />
          <div className="form-check mb-2">
            <input id={`${kind}-default-view`} className="form-check-input" type="checkbox" checked={asDefault} onChange={(event) => setAsDefault(event.target.checked)} />
            <label className="form-check-label" htmlFor={`${kind}-default-view`}>
              {t("views.default")}
            </label>
          </div>
          {error ? <div className="alert alert-danger">{error}</div> : null}
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            {busy ? t("views.saving") : t("views.save")}
          </button>
        </form>
      </div>
    </div>
  );
}
