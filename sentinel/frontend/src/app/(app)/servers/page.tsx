"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { PageHeader } from "@/components/ui/page-header";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import { canSeePage } from "@/lib/pages";
import { useAuth } from "@/context/auth-context";
import type { Server } from "@/lib/types";

function ServerCard({ server }: { server: Server }) {
  return (
    <>
      <h5 className="mb-1">{server.name}</h5>
      <p className="text-muted mb-2">{server.hostname || "—"}</p>
      <p className="text-muted fs-12 mb-0">
        {server.environment || "default"} · Added {server.created_at}
      </p>
    </>
  );
}

export default function ServersPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, "servers", "write");
  const canDetail = canSeePage(user, "server_detail");

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
      setFormError(err instanceof ApiRequestError ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Servers" subtitle="Register hosts, then issue enrollment tokens for agents" />
      {loading ? <LoadingBlock /> : null}
      {!loading && error ? <EmptyState title="Cannot load servers" description={error} /> : null}
      {!loading && !error ? (
        <>
          {canWrite ? (
            <div className="card">
              <div className="card-header">
                <h4 className="card-title mb-0">Create server</h4>
              </div>
              <div className="card-body">
                <form onSubmit={onCreate}>
                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label">Name *</label>
                      <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} required placeholder="main-vps" />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Hostname</label>
                      <input className="form-control" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="main.example.com" />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Environment</label>
                      <input className="form-control" value={environment} onChange={(e) => setEnvironment(e.target.value)} placeholder="production" />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label">Description</label>
                      <input className="form-control" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional notes" />
                    </div>
                    {formError ? <div className="col-12"><div className="alert alert-danger mb-0">{formError}</div></div> : null}
                    <div className="col-12">
                      <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
                        {saving ? "Creating…" : "Create server"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          ) : null}

          {servers.length === 0 ? (
            <EmptyState title="No servers yet" description="Create a server above, then open it to issue an enrollment token." />
          ) : (
            <div className="row">
              {servers.map((s) => (
                <div className="col-md-6" key={s.id}>
                  {canDetail ? (
                    <Link href={`/servers/${s.id}`} className="card card-animate text-reset">
                      <div className="card-body">
                        <ServerCard server={s} />
                      </div>
                    </Link>
                  ) : (
                    <div className="card">
                      <div className="card-body">
                        <ServerCard server={s} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : null}
    </>
  );
}
