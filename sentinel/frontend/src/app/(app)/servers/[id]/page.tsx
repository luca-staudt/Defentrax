"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { copyText } from "@/lib/clipboard";
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

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand-500/60";
const btnPrimary =
  "rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-black hover:bg-brand-400 disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-brand-500/50";

export default function ServerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [server, setServer] = useState<ServerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("default-agent");
  const [ttl, setTtl] = useState(60);
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [issued, setIssued] = useState<EnrollmentToken | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<ServerDetail>(`/servers/${id}`);
      setServer(res);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Not found");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onIssue(e: FormEvent) {
    e.preventDefault();
    setIssueError(null);
    setIssued(null);
    setIssuing(true);
    try {
      const tok = await apiFetch<EnrollmentToken>(
        `/servers/${id}/enrollment-tokens`,
        {
          method: "POST",
          body: JSON.stringify({
            label: label.trim() || undefined,
            ttl_minutes: ttl,
          }),
        },
      );
      setIssued(tok);
      await load();
    } catch (err) {
      setIssueError(
        err instanceof ApiRequestError ? err.message : "Token create failed",
      );
    } finally {
      setIssuing(false);
    }
  }

  async function copyToken() {
    if (!issued?.token) return;
    setCopyHint(null);
    const result = await copyText(issued.token, { selectEl: tokenInputRef.current });
    if (result.ok) {
      setCopied(true);
      setIssueError(null);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    setCopied(false);
    setCopyHint(result.reason);
    setIssueError(null);
  }

  if (loading) return <LoadingBlock />;
  if (error || !server) {
    return <EmptyState title="Server not found" description={error || undefined} />;
  }

  return (
    <div className="space-y-8">
      <header>
        <Link href="/servers" className="text-xs text-zinc-500 hover:text-brand-300">
          ← Servers
        </Link>
        <h1 className="font-display mt-2 text-2xl font-semibold text-white">
          {server.name}
        </h1>
        <p className="text-sm text-zinc-500">
          {server.hostname || "—"} · {server.environment || "default env"}
        </p>
      </header>
      {server.description ? (
        <p className="text-sm text-zinc-400">{server.description}</p>
      ) : null}

      <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-5">
        <h2 className="mb-2 text-sm font-medium uppercase tracking-widest text-zinc-400">
          Enrollment token
        </h2>
        <p className="mb-4 text-sm text-zinc-500">
          One-time <code className="text-zinc-300">senr_…</code> token for the agent on
          this host. Shown only once — copy it now.
        </p>
        <form onSubmit={onIssue} className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm text-zinc-400 sm:col-span-2">
            Label
            <input
              className={`${inputClass} mt-1`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="main-agent"
            />
          </label>
          <label className="block text-sm text-zinc-400">
            TTL (minutes)
            <input
              className={`${inputClass} mt-1`}
              type="number"
              min={1}
              max={1440}
              value={ttl}
              onChange={(e) => setTtl(Number(e.target.value) || 60)}
            />
          </label>
          {issueError ? (
            <p className="text-sm text-red-400 sm:col-span-3">{issueError}</p>
          ) : null}
          <div className="sm:col-span-3">
            <button type="submit" className={btnPrimary} disabled={issuing}>
              {issuing ? "Issuing…" : "Issue enrollment token"}
            </button>
          </div>
        </form>

        {issued?.token ? (
          <div className="mt-5 rounded-lg border border-brand-500/40 bg-brand-500/10 p-4">
            <p className="text-xs uppercase tracking-widest text-brand-300">
              Copy now — will not be shown again
            </p>
            <label className="mt-2 block text-xs text-zinc-500">
              Enrollment token
              <input
                ref={tokenInputRef}
                className={`${inputClass} mt-1 font-mono text-sm text-white`}
                value={issued.token}
                readOnly
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Enrollment token"
              />
            </label>
            <p className="mt-2 text-xs text-zinc-500">
              Expires {issued.expires_at} · prefix {issued.token_prefix}
            </p>
            <button type="button" className={`${btnGhost} mt-3`} onClick={() => void copyToken()}>
              {copied ? "Copied" : "Copy token"}
            </button>
            {copyHint ? (
              <p className="mt-2 text-sm text-amber-300">{copyHint}</p>
            ) : null}
            <pre className="mt-4 overflow-x-auto rounded bg-black/50 p-3 text-xs text-zinc-400">
{`# On the monitored host:
export SENTINEL_API_URL=http://YOUR_SENTINEL_HOST:8080
export SENTINEL_ENROLLMENT_TOKEN=${issued.token}
export SENTINEL_AGENT_NAME=${label || "agent"}
./sentinel-agent`}
            </pre>
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-widest text-zinc-400">
          Agents
        </h2>
        {server.agents.length === 0 ? (
          <EmptyState
            title="No agents enrolled"
            description="Issue a token above and start the agent on the host."
          />
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
            {server.agents.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <p className="text-zinc-100">{a.name || a.id.slice(0, 8)}</p>
                  <p className="text-xs text-zinc-500">
                    v{a.agent_version || "?"}
                    {a.last_heartbeat_at ? ` · last seen ${a.last_heartbeat_at}` : ""}
                  </p>
                </div>
                <span className="rounded border border-zinc-700 px-2 py-0.5 text-xs uppercase text-zinc-400">
                  {a.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
