"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { apiFetch } from "@/lib/api/client";

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
  const [server, setServer] = useState<ServerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch<ServerDetail>(`/servers/${id}`);
        setServer(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Not found");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) return <LoadingBlock />;
  if (error || !server) {
    return <EmptyState title="Server not found" description={error || undefined} />;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-white">{server.name}</h1>
        <p className="text-sm text-zinc-500">
          {server.hostname} · {server.environment || "default env"}
        </p>
      </header>
      {server.description ? (
        <p className="text-sm text-zinc-400">{server.description}</p>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-widest text-zinc-400">Agents</h2>
        {server.agents.length === 0 ? (
          <EmptyState title="No agents enrolled" description="Issue an enrollment token to connect an agent." />
        ) : (
          <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
            {server.agents.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <div>
                  <p className="text-zinc-100">{a.name || a.id.slice(0, 8)}</p>
                  <p className="text-xs text-zinc-500">v{a.agent_version || "?"}</p>
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
