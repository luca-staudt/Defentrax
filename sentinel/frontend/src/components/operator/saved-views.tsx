"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { DropdownItem, DropdownMenu, DropdownToggle, UncontrolledDropdown } from "reactstrap";
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
    if (busy) return;
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
      setError(err instanceof ApiRequestError ? err.message : t("rules.saveFailed"));
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
      setError(err instanceof ApiRequestError ? err.message : t("rules.saveFailed"));
    }
  }

  return (
    <div className="d-flex flex-wrap align-items-center gap-2">
      <UncontrolledDropdown>
        <DropdownToggle caret color="light" className="btn">
          {t("alerts.views")}
          {views.length > 0 ? <span className="badge bg-primary-subtle text-primary ms-2">{views.length}</span> : null}
        </DropdownToggle>
        <DropdownMenu>
          {views.length === 0 ? <DropdownItem disabled>{t("views.empty")}</DropdownItem> : null}
          {views.map((view) => (
            <DropdownItem key={view.id} tag="div" toggle={false} className="d-flex align-items-center gap-2">
              <button type="button" className="btn btn-link p-0 text-start flex-grow-1" onClick={() => onApply(view.query || {})}>
                {view.name}
                {view.is_default ? <span className="badge bg-primary-subtle text-primary ms-2">{t("views.default")}</span> : null}
              </button>
              <button type="button" className="btn btn-sm btn-ghost-danger" onClick={() => void remove(view.id)} aria-label={t("common.delete")}>
                <i className="ri-delete-bin-line" />
              </button>
            </DropdownItem>
          ))}
        </DropdownMenu>
      </UncontrolledDropdown>
      <form className="d-flex flex-wrap align-items-center gap-2" onSubmit={(event) => void onSave(event)}>
        <input
          className="form-control form-control-sm"
          style={{ width: 180 }}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("views.name")}
          maxLength={80}
        />
        <div className="form-check mb-0">
          <input
            id={`${kind}-default-view`}
            className="form-check-input"
            type="checkbox"
            checked={asDefault}
            onChange={(event) => setAsDefault(event.target.checked)}
          />
          <label className="form-check-label" htmlFor={`${kind}-default-view`}>
            {t("views.default")}
          </label>
        </div>
        <button type="submit" className="btn btn-sm btn-primary" disabled={busy}>
          {busy ? t("views.saving") : t("views.save")}
        </button>
      </form>
      {error ? <span className="text-danger fs-12">{error}</span> : null}
    </div>
  );
}
