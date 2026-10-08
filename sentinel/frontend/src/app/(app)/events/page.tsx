"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { SavedViews } from "@/components/operator/saved-views";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { useAuth } from "@/context/auth-context";
import { formatAlertTimeShort } from "@/lib/alerts";
import { apiFetch } from "@/lib/api/client";
import { severityLabel, useI18n } from "@/lib/i18n";
import { canSeePage } from "@/lib/pages";
import { useQuery } from "@/lib/panel/use-query";
import type { EventRow, Server } from "@/lib/types";

const SEVERITY_FILTERS = ["", "critical", "high", "medium", "low", "info"] as const;
const WITHIN_MS: Record<string, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

function sinceFor(within: string) {
  const span = WITHIN_MS[within];
  if (!span) return "";
  return new Date(Date.now() - span).toISOString();
}

export default function EventsPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const canServer = canSeePage(user, "server_detail");
  const canServers = canSeePage(user, "servers");

  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [severity, setSeverity] = useState("");
  const [source, setSource] = useState("");
  const [sourceDraft, setSourceDraft] = useState("");
  const [within, setWithin] = useState("");
  const [serverId, setServerId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const limit = 40;

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q") || "";
    if (initial) {
      setQ(initial);
      setQDraft(initial);
    }
    setReady(true);
  }, []);

  const applyView = useCallback((query: Record<string, string>) => {
    const nextQ = query.q || "";
    setQ(nextQ);
    setQDraft(nextQ);
    setSeverity(query.severity || "");
    const nextSource = query.source || "";
    setSource(nextSource);
    setSourceDraft(nextSource);
    setWithin(query.within || "");
    setServerId(query.server_id || "");
    setOffset(0);
    setSelectedId(null);
  }, []);

  const currentView: Record<string, string> = {
    ...(q ? { q } : {}),
    ...(severity ? { severity } : {}),
    ...(source ? { source } : {}),
    ...(within ? { within } : {}),
    ...(serverId ? { server_id: serverId } : {}),
  };

  const eventKey = ready ? `events?q=${q}&severity=${severity}&source=${source}&within=${within}&server=${serverId}&offset=${offset}` : null;
  const eventsQuery = useQuery(
    eventKey,
    () => {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (q) params.set("q", q);
      if (severity) params.set("severity", severity);
      if (source) params.set("source", source);
      if (serverId) params.set("server_id", serverId);
      const since = sinceFor(within);
      if (since) params.set("since", since);
      return apiFetch<{ events: EventRow[]; total: number }>(`/events?${params}`);
    },
    { refreshMs: 15000 },
  );
  const serversQuery = useQuery(canServers ? "servers" : null, () => apiFetch<{ servers: Server[] }>("/servers"));
  const servers = serversQuery.data?.servers || [];
  const events = eventsQuery.data?.events || [];
  const total = eventsQuery.data?.total || 0;
  const loading = !ready || eventsQuery.loading;
  const error = eventsQuery.error;
  const selected = events.find((event) => event.id === selectedId) ?? null;
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + limit, total);

  function applyFilters(event?: FormEvent) {
    event?.preventDefault();
    setOffset(0);
    setQ(qDraft.trim());
    setSource(sourceDraft.trim());
  }

  return (
    <>
      <PageHeader
        title={t("events.title")}
        subtitle={t("events.subtitle")}
        actions={
          <span className="text-muted">
            {total.toLocaleString()} {t("events.rows")}
          </span>
        }
      />

      <form className="card" onSubmit={applyFilters}>
        <div className="card-body">
          <div className="mb-3">
            <SavedViews kind="events" current={currentView} onApply={applyView} />
          </div>
          <div className="row g-2">
            <div className="col-lg-4">
              <input className="form-control" value={qDraft} onChange={(event) => setQDraft(event.target.value)} placeholder={t("events.message")} />
            </div>
            <div className="col-lg-2">
              <input className="form-control" value={sourceDraft} onChange={(event) => setSourceDraft(event.target.value)} placeholder={t("events.source")} />
            </div>
            <div className="col-lg-2">
              <select
                className="form-select"
                value={severity}
                onChange={(event) => {
                  setSeverity(event.target.value);
                  setOffset(0);
                }}
              >
                {SEVERITY_FILTERS.map((level) => (
                  <option key={level || "all"} value={level}>
                    {level ? severityLabel(t, level) : t("events.allSeverities")}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-lg-2">
              <select
                className="form-select"
                value={within}
                onChange={(event) => {
                  setWithin(event.target.value);
                  setOffset(0);
                }}
              >
                <option value="">{t("events.within")}</option>
                <option value="15m">{t("events.within15")}</option>
                <option value="1h">{t("events.within1h")}</option>
                <option value="24h">{t("events.within24")}</option>
                <option value="7d">{t("events.within7")}</option>
              </select>
            </div>
            <div className="col-lg-2">
              <button type="submit" className="btn btn-primary w-100">
                {t("common.search")}
              </button>
            </div>
            {canServers ? (
              <div className="col-lg-4">
                <select
                  className="form-select"
                  value={serverId}
                  onChange={(event) => {
                    setServerId(event.target.value);
                    setOffset(0);
                  }}
                >
                  <option value="">{t("alerts.allServers")}</option>
                  {servers.map((server) => (
                    <option key={server.id} value={server.id}>
                      {server.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </div>
      </form>

      {loading ? <LoadingBlock label={t("events.loading")} /> : null}
      {error ? <div className="alert alert-danger">{error}</div> : null}
      {!loading && !error && events.length === 0 ? <EmptyState title={t("events.empty")} description={t("events.emptyHint")} /> : null}

      {events.length > 0 ? (
        <div className="card">
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>{t("events.message")}</th>
                    <th>{t("alerts.severity")}</th>
                    <th>{t("common.source")}</th>
                    <th>{t("common.host")}</th>
                    <th>{t("common.received")}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id}>
                      <td style={{ maxWidth: 420 }}>
                        <button type="button" className="btn btn-link p-0 fw-medium text-start text-truncate d-inline-block" style={{ maxWidth: 400 }} onClick={() => setSelectedId(event.id)}>
                          {event.message}
                        </button>
                      </td>
                      <td>
                        <SeverityBadge severity={event.severity} />
                      </td>
                      <td className="text-muted">{event.source || t("common.unknown")}</td>
                      <td className="text-muted">{event.host || "—"}</td>
                      <td className="text-muted text-nowrap">{formatAlertTimeShort(event.received_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="d-flex justify-content-between align-items-center mt-3">
              <button type="button" className="btn btn-light" disabled={offset === 0 || loading} onClick={() => setOffset((value) => Math.max(0, value - limit))}>
                {t("common.previous")}
              </button>
              <span className="text-muted">
                {rangeStart}–{rangeEnd} {t("common.of")} {total.toLocaleString()}
              </span>
              <button type="button" className="btn btn-light" disabled={offset + limit >= total || loading} onClick={() => setOffset((value) => value + limit)}>
                {t("common.next")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Modal isOpen={!!selected} onClose={() => setSelectedId(null)} size="xl" title={selected?.source || t("events.title")} subtitle={selected ? formatAlertTimeShort(selected.received_at) : undefined}>
        {selected ? (
          <>
            <SeverityBadge severity={selected.severity} />
            <p className="mt-3 mb-3" style={{ whiteSpace: "pre-wrap" }}>
              {selected.message}
            </p>
            <dl className="row mb-0">
              <dt className="col-sm-3 text-muted">{t("common.source")}</dt>
              <dd className="col-sm-9">{selected.source || "—"}</dd>
              <dt className="col-sm-3 text-muted">{t("common.category")}</dt>
              <dd className="col-sm-9">{selected.category || "—"}</dd>
              <dt className="col-sm-3 text-muted">{t("common.host")}</dt>
              <dd className="col-sm-9">{selected.host || "—"}</dd>
              <dt className="col-sm-3 text-muted">{t("common.received")}</dt>
              <dd className="col-sm-9">{formatAlertTimeShort(selected.received_at)}</dd>
              <dt className="col-sm-3 text-muted">{t("common.occurred")}</dt>
              <dd className="col-sm-9">{formatAlertTimeShort(selected.occurred_at)}</dd>
              <dt className="col-sm-3 text-muted">{t("common.server")}</dt>
              <dd className="col-sm-9 text-break">
                {canServer && selected.server_id ? <Link href={`/servers/${selected.server_id}`}>{selected.server_id}</Link> : selected.server_id || "—"}
              </dd>
            </dl>
          </>
        ) : null}
      </Modal>
    </>
  );
}
