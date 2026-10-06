"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import { useAuth } from "@/context/auth-context";
import type { Server } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand-500/60";
const btnPrimary =
  "rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-black hover:bg-brand-400 disabled:opacity-50";

export default function ServersPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, "servers", "write");

  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [description, setDescription] = useState("");
  const [environment, setEnvironment] = useState("production");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ servers: Server[] }>("/servers");
      setServers(res.servers || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load servers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setFormError(null);
    setSaving(true);
    try {
      await apiFetch<Server>("/servers", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          hostname: hostname.trim() || undefined,
          description: description.trim() || undefined,
          environment: environment.trim() || undefined,
        }),
      });
      setName("");
      setHostname("");
      setDescription("");
      await load();
    } catch (err) {
      setFormError(
        err instanceof ApiRequestError ? err.message : "Create failed",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingBlock />;
  if (error) return <EmptyState title="Cannot load servers" description={error} />;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl font-semibold text-white">Servers</h1>
        <p className="text-sm text-zinc-500">
          Register hosts, then issue enrollment tokens for agents
        </p>
      </header>

      {canWrite ? (
      <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-5">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-widest text-zinc-400">
          Create server
        </h2>
        <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-zinc-400">
            Name *
            <input
              className={`${inputClass} mt-1`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="main-vps"
            />
          </label>
          <label className="block text-sm text-zinc-400">
            Hostname
            <input
              className={`${inputClass} mt-1`}
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="main.example.com"
            />
          </label>
          <label className="block text-sm text-zinc-400">
            Environment
            <input
              className={`${inputClass} mt-1`}
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              placeholder="production"
            />
          </label>
          <label className="block text-sm text-zinc-400 sm:col-span-2">
            Description
            <input
              className={`${inputClass} mt-1`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes"
            />
          </label>
          {formError ? (
            <p className="text-sm text-red-400 sm:col-span-2">{formError}</p>
          ) : null}
          <div className="sm:col-span-2">
            <button type="submit" className={btnPrimary} disabled={saving || !name.trim()}>
              {saving ? "Creating…" : "Create server"}
            </button>
          </div>
        </form>
      </section>
      ) : null}

      {servers.length === 0 ? (
        <EmptyState
          title="No servers yet"
          description="Create a server above, then open it to issue an enrollment token."
        />
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
                <p className="mt-2 text-xs text-zinc-600">
                  {s.environment || "default"} · Added {s.created_at}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
