"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { apiFetch } from "@/lib/api/client";
import type { Server } from "@/lib/types";

export default function ServersPage() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch<{ servers: Server[] }>("/servers");
        setServers(res.servers || []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load servers");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingBlock />;
  if (error) return <EmptyState title="Cannot load servers" description={error} />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-white">Servers</h1>
        <p className="text-sm text-zinc-500">Monitored infrastructure targets</p>
      </header>
      {servers.length === 0 ? (
        <EmptyState title="No servers yet" description="Create servers via API or operator tools." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {servers.map((s) => (
            <li key={s.id}>
              <Link
                href={`/servers/${s.id}`}
                className="block rounded-xl border border-zinc-800 bg-zinc-950/50 p-5 transition hover:border-brand-500/40"
              >
                <p className="font-medium text-white">{s.name}</p>
                <p className="text-sm text-zinc-500">{s.hostname || "—"}</p>
                <p className="mt-2 text-xs text-zinc-600">Added {s.created_at}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
