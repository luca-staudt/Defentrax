"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useMemo, useRef, useState } from "react";
import { SilenceControl, writeTargetSilence } from "@/components/operator/silence-control";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { formatAlertTime } from "@/lib/alerts";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { copyText } from "@/lib/clipboard";
import { useI18n } from "@/lib/i18n";
import { canSeePage } from "@/lib/pages";
import { invalidateQueries } from "@/lib/panel/cache";
import { useQuery } from "@/lib/panel/use-query";
import { hasPermission } from "@/lib/permissions";
import type { EnrollmentToken } from "@/lib/types";

type Agent = {
  id: string;
  name: string;
  status: string;
  agent_version: string;
  last_heartbeat_at?: string;
};

type ServerDetail = {
  id: string;
  name: string;
  hostname: string;
  description: string;
  environment: string;
  created_at: string;
  agents: Agent[];
  silenced_until?: string | null;
  last_heartbeat_at?: string | null;
  last_event_at?: string | null;
  agent_count?: number;
  silent?: boolean;
};

function composeEnrollCommand(token: string, agentName: string): string {
  const name = agentName.trim() || "compose-agent";
  return [
    "docker compose --profile agent run --rm \\",
    `  -e SENTINEL_ENROLLMENT_TOKEN=${token} \\`,
    `  -e SENTINEL_AGENT_NAME=${name} \\`,
    "  -e SENTINEL_ENROLL_ONLY=1 \\",
    "  sentinel-agent",
    "",
    "docker compose --profile agent up -d",
  ].join("\n");
}

export default function ServerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { t } = useI18n();
  const canList = canSeePage(user, "servers");
  const canWrite = hasPermission(user, "servers", "write");
  const [silenceBusy, setSilenceBusy] = useState(false);
  const [silenceError, setSilenceError] = useState<string | null>(null);
  const [label, setLabel] = useState("compose-agent");
  const [ttl, setTtl] = useState(60);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issued, setIssued] = useState<EnrollmentToken | null>(null);
  const [copied, setCopied] = useState<"token" | "command" | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const tokenRef = useRef<HTMLElement>(null);
  const commandRef = useRef<HTMLPreElement>(null);

  const serverQuery = useQuery(id ? `server:${id}` : null, () => apiFetch<ServerDetail>(`/servers/${id}`), {
    refreshMs: 20000,
  });
  const server = serverQuery.data ?? null;
  const loading = serverQuery.loading;
  const error = serverQuery.error;

  const enrollCommand = useMemo(() => {
    if (!issued?.token) return "";
    return composeEnrollCommand(issued.token, label);
  }, [issued?.token, label]);

  async function onIssue(e: FormEvent) {
    e.preventDefault();
    setIssueError(null);
    setCopyHint(null);
    setIssued(null);
    setIssuing(true);
    try {
      const tok = await apiFetch<EnrollmentToken>(`/servers/${id}/enrollment-tokens`, {
        method: "POST",
        body: JSON.stringify({
          label: label.trim() || undefined,
          ttl_minutes: ttl,
        }),
      });
      setIssued(tok);
      invalidateQueries(["stats", "servers"]);
      await serverQuery.reload();
    } catch (err) {
      setIssueError(err instanceof ApiRequestError ? err.message : t("host.tokenFailed"));
    } finally {
      setIssuing(false);
    }
  }

  async function copyToken() {
    if (!issued?.token) return;
    setCopyHint(null);
    const result = await copyText(issued.token, tokenRef.current);
    if (result.ok) {
      setCopied("token");
      setTimeout(() => setCopied(null), 2000);
      return;
    }
    setCopyHint(result.message);
  }

  async function copyCommand() {
    if (!enrollCommand) return;
    setCopyHint(null);
    const result = await copyText(enrollCommand, commandRef.current);
    if (result.ok) {
      setCopied("command");
      setTimeout(() => setCopied(null), 2000);
      return;
    }
    setCopyHint(result.message);
  }

  async function changeSilence(until: string | null) {
    if (!canWrite || !id) return;
    setSilenceBusy(true);
    setSilenceError(null);
    try {
      await writeTargetSilence(`/servers/${id}/silence`, until);
      invalidateQueries(["servers", "stats"]);
      await serverQuery.reload();
    } catch (err) {
      setSilenceError(err instanceof ApiRequestError ? err.message : t("host.tokenFailed"));
    } finally {
      setSilenceBusy(false);
    }
  }

  if (loading) return <LoadingBlock />;
  if (error || !server) {
    return <EmptyState title={t("host.notFound")} description={error || undefined} />;
  }

  return (
    <>
      <PageHeader
        title={server.name}
        subtitle={`${server.hostname || "—"} · ${server.environment || t("common.default")}${server.silent ? ` · ${t("fleet.silent")}` : ""}`}
        actions={
          canList ? (
            <Link href="/servers" className="btn btn-light">
              {t("host.back")}
            </Link>
          ) : null
        }
      />

      <div className="row g-4 mb-4 dx-stats-row">
        <div className="col-12 col-sm-6 col-lg">
          <div className="card card-animate h-100">
            <div className="card-body">
              <p className="text-uppercase fw-medium text-muted mb-2">{t("host.agents")}</p>
              <h4 className="fs-22 fw-semibold ff-secondary mb-0">{server.agents.length}</h4>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-lg">
          <div className="card card-animate h-100">
            <div className="card-body">
              <p className="text-uppercase fw-medium text-muted mb-2">{t("host.environment")}</p>
              <h4 className="fs-16 fw-semibold mb-0">{server.environment || t("common.default")}</h4>
            </div>
          </div>
        </div>
        <div className="col-12 col-sm-6 col-lg">
          <div className="card card-animate h-100">
            <div className="card-body">
              <p className="text-uppercase fw-medium text-muted mb-2">{t("host.enrolled")}</p>
              <h4 className="fs-16 fw-semibold mb-0">{formatAlertTime(server.created_at)}</h4>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-xl-7">
          {server.description ? (
            <div className="card">
              <div className="card-body">
                <p className="mb-0">{server.description}</p>
              </div>
            </div>
          ) : null}

          <div className="card">
            <div className="card-header">
              <h4 className="card-title mb-0">{t("host.onHost")}</h4>
            </div>
            <div className="card-body">
              {server.agents.length === 0 ? (
                <EmptyState title={t("host.none")} description={t("host.noneHint")} />
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>{t("common.name")}</th>
                        <th>{t("alerts.status")}</th>
                        <th>{t("host.version")}</th>
                        <th>{t("fleet.heartbeat")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {server.agents.map((agent) => (
                        <tr key={agent.id}>
                          <td className="fw-medium">{agent.name || agent.id.slice(0, 8)}</td>
                          <td>
                            <span className="badge bg-secondary-subtle text-secondary">{agent.status}</span>
                          </td>
                          <td className="text-muted">v{agent.agent_version || "?"}</td>
                          <td className="text-muted">{agent.last_heartbeat_at ? formatAlertTime(agent.last_heartbeat_at) : t("host.noHeartbeat")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-xl-5">
          <div className="card">
            <div className="card-header">
              <h4 className="card-title mb-0">{t("host.enroll")}</h4>
            </div>
            <div className="card-body">
              {canWrite ? (
                <div className="mb-3">
                  <SilenceControl until={server.silenced_until} busy={silenceBusy} onChange={changeSilence} />
                  {silenceError ? <div className="alert alert-danger mt-2 mb-0">{silenceError}</div> : null}
                  <p className="text-muted fs-12 mt-2 mb-0">
                    {t("fleet.heartbeat")}: {server.last_heartbeat_at ? formatAlertTime(server.last_heartbeat_at) : "—"} · {t("fleet.lastEvent")}:{" "}
                    {server.last_event_at ? formatAlertTime(server.last_event_at) : "—"}
                  </p>
                </div>
              ) : null}
              <p className="text-muted">{t("host.enrollHint")}</p>
              <ol className="text-muted small ps-3 mb-3">
                <li className="mb-1">{t("host.composeStep1")}</li>
                <li className="mb-1">{t("host.composeStep2")}</li>
                <li>{t("host.composeStep3")}</li>
              </ol>
              <form onSubmit={onIssue}>
                <label className="form-label" htmlFor="enroll-label">
                  {t("host.label")}
                </label>
                <input
                  id="enroll-label"
                  className="form-control mb-3"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="compose-agent"
                />
                <label className="form-label" htmlFor="enroll-ttl">
                  {t("host.ttl")}
                </label>
                <input
                  id="enroll-ttl"
                  className="form-control mb-3"
                  type="number"
                  min={1}
                  max={1440}
                  value={ttl}
                  onChange={(e) => setTtl(Number(e.target.value) || 60)}
                />
                {issueError ? <div className="alert alert-danger">{issueError}</div> : null}
                <button type="submit" className="btn btn-primary" disabled={issuing || !canWrite}>
                  {issuing ? t("host.issuing") : t("host.issue")}
                </button>
              </form>

              {issued?.token ? (
                <div className="alert alert-success mt-4 mb-0">
                  <p className="fw-medium mb-2">{t("host.copyNow")}</p>
                  <code ref={tokenRef} className="d-block user-select-all text-break">
                    {issued.token}
                  </code>
                  <p className="text-muted mt-2 mb-2">
                    {t("host.expires")} {formatAlertTime(issued.expires_at)} · {t("host.prefix")} {issued.token_prefix}
                  </p>
                  <div className="d-flex flex-wrap gap-2 mb-3">
                    <button type="button" className="btn btn-sm btn-light" onClick={() => void copyToken()}>
                      {copied === "token" ? t("host.copied") : t("host.copy")}
                    </button>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => void copyCommand()}>
                      {copied === "command" ? t("host.copiedCommand") : t("host.copyCommand")}
                    </button>
                  </div>
                  {copyHint ? <p className="text-warning mt-2 mb-0">{copyHint}</p> : null}
                  <p className="fw-medium mb-2">{t("host.composeSteps")}</p>
                  <pre ref={commandRef} className="bg-dark text-white p-3 rounded mb-3 user-select-all text-break">
                    {enrollCommand}
                  </pre>
                  <p className="text-muted small mb-2">{t("host.bareMetalHint")}</p>
                  <pre className="bg-dark text-white p-3 rounded mb-0 text-break">
                    {`export SENTINEL_API_URL=http://YOUR_DEFENTRAX_HOST:8080
export SENTINEL_ENROLLMENT_TOKEN=${issued.token}
export SENTINEL_AGENT_NAME=${label || "agent"}
./sentinel-agent`}
                  </pre>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
