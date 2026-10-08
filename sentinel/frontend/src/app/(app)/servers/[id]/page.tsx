"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { copyText } from "@/lib/clipboard";
import { canSeePage } from "@/lib/pages";
import { invalidateQueries } from "@/lib/panel/cache";
import { useQuery } from "@/lib/panel/use-query";
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
};

export default function ServerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const canList = canSeePage(user, "servers");
  const [label, setLabel] = useState("default-agent");
  const [ttl, setTtl] = useState(60);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issued, setIssued] = useState<EnrollmentToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const tokenRef = useRef<HTMLElement>(null);

  const serverQuery = useQuery(id ? `server:${id}` : null, () => apiFetch<ServerDetail>(`/servers/${id}`), {
    refreshMs: 20000,
  });
  const server = serverQuery.data ?? null;
  const loading = serverQuery.loading;
  const error = serverQuery.error;

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
      setIssueError(err instanceof ApiRequestError ? err.message : "Token create failed");
    } finally {
      setIssuing(false);
    }
  }

  async function copyToken() {
    if (!issued?.token) return;
    setCopyHint(null);
    const result = await copyText(issued.token, tokenRef.current);
    if (result.ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    setCopyHint(result.message);
  }

  if (loading) return <LoadingBlock />;
  if (error || !server) {
    return <EmptyState title="Server not found" description={error || undefined} />;
  }

  return (
    <>
      <PageHeader
        title={server.name}
        subtitle={`${server.hostname || "—"} · ${server.environment || "default env"}`}
        actions={
          canList ? (
            <Link href="/servers" className="btn btn-light">
              Fleet
            </Link>
          ) : null
        }
      />

      <div className="row">
        <div className="col-xl-7">
          <div className="row g-3 mb-3">
            <div className="col-md-4">
              <div className="dx-metric">
                <span className="text-muted text-uppercase fs-12">Agents</span>
                <strong>{server.agents.length}</strong>
              </div>
            </div>
            <div className="col-md-4">
              <div className="dx-metric">
                <span className="text-muted text-uppercase fs-12">Environment</span>
                <strong className="fs-14">{server.environment || "default"}</strong>
              </div>
            </div>
            <div className="col-md-4">
              <div className="dx-metric">
                <span className="text-muted text-uppercase fs-12">Enrolled</span>
                <strong className="fs-14">{server.created_at}</strong>
              </div>
            </div>
          </div>

          {server.description ? (
            <div className="card">
              <div className="card-body">
                <p className="mb-0">{server.description}</p>
              </div>
            </div>
          ) : null}

          <div className="card">
            <div className="card-header">
              <h4 className="card-title mb-0">Agents on this host</h4>
            </div>
            <div className="card-body">
              {server.agents.length === 0 ? (
                <EmptyState title="No agents enrolled" description="Issue a token and start the agent on the host." />
              ) : (
                <div className="dx-log">
                  {server.agents.map((agent) => (
                    <div key={agent.id} className="dx-metric">
                      <span className="d-flex justify-content-between gap-2">
                        <span className="fw-medium">{agent.name || agent.id.slice(0, 8)}</span>
                        <span className="badge bg-secondary-subtle text-secondary">{agent.status}</span>
                      </span>
                      <span className="d-block text-muted fs-12 mt-1">
                        v{agent.agent_version || "?"} · {agent.last_heartbeat_at || "no heartbeat yet"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-xl-5">
          <div className="card dx-detail">
            <div className="card-header">
              <h4 className="card-title mb-0">Enroll an agent</h4>
            </div>
            <div className="card-body">
              <p className="text-muted">
                One-time <code>senr_…</code> token for the agent on this host. Shown only once — copy it now.
              </p>
              <form onSubmit={onIssue}>
                <label className="form-label" htmlFor="enroll-label">
                  Label
                </label>
                <input
                  id="enroll-label"
                  className="form-control mb-3"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="main-agent"
                />
                <label className="form-label" htmlFor="enroll-ttl">
                  TTL (minutes)
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
                <button type="submit" className="btn btn-primary" disabled={issuing}>
                  {issuing ? "Issuing…" : "Issue enrollment token"}
                </button>
              </form>

              {issued?.token ? (
                <div className="alert alert-success mt-4 mb-0">
                  <p className="fw-medium mb-2">Copy now — will not be shown again</p>
                  <code ref={tokenRef} className="d-block user-select-all">
                    {issued.token}
                  </code>
                  <p className="text-muted mt-2 mb-2">
                    Expires {issued.expires_at} · prefix {issued.token_prefix}
                  </p>
                  <button type="button" className="btn btn-sm btn-light" onClick={() => void copyToken()}>
                    {copied ? "Copied" : "Copy token"}
                  </button>
                  {copyHint ? <p className="text-warning mt-2 mb-0">{copyHint}</p> : null}
                  <pre className="bg-dark text-white p-3 rounded mt-3 mb-0">
{`# On the monitored host (Defentrax agent):
export SENTINEL_API_URL=http://YOUR_DEFENTRAX_HOST:8080
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
