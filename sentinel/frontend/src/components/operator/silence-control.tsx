"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n";
import { formatAlertTime } from "@/lib/alerts";

export async function writeTargetSilence(path: string, until: string | null) {
  if (until) {
    await apiFetch(path, { method: "POST", body: JSON.stringify({ until }) });
    return;
  }
  await apiFetch(path, { method: "DELETE" });
}

const HOURS: Record<string, number> = { "1h": 1, "4h": 4, "24h": 24 };

export function SilenceControl({
  until,
  disabled,
  busy,
  onChange,
}: {
  until?: string | null;
  disabled?: boolean;
  busy?: boolean;
  onChange: (until: string | null) => Promise<void>;
}) {
  const { t } = useI18n();
  const active = !!until && new Date(until).getTime() > Date.now();
  const [span, setSpan] = useState("1h");
  const [open, setOpen] = useState(false);

  async function toggle(next: boolean) {
    if (!next) {
      setOpen(false);
      await onChange(null);
      return;
    }
    setOpen(true);
  }

  async function apply() {
    const hours = HOURS[span] || 1;
    const untilAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    await onChange(untilAt);
    setOpen(false);
  }

  return (
    <div>
      <div className="form-check form-switch mb-1">
        <input
          className="form-check-input"
          type="checkbox"
          role="switch"
          checked={active || open}
          disabled={disabled || busy}
          onChange={(event) => void toggle(event.target.checked)}
        />
        <label className="form-check-label">
          {active ? `${t("silence.until")} ${formatAlertTime(until)}` : t("silence.quiet")}
        </label>
      </div>
      {open && !active ? (
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <select className="form-select form-select-sm" style={{ width: 140 }} value={span} onChange={(event) => setSpan(event.target.value)}>
            <option value="1h">{t("silence.hour")}</option>
            <option value="4h">{t("silence.four")}</option>
            <option value="24h">{t("silence.day")}</option>
          </select>
          <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => void apply()}>
            {t("silence.apply")}
          </button>
        </div>
      ) : null}
      <p className="text-muted fs-12 mb-0">{t("silence.hint")}</p>
    </div>
  );
}
