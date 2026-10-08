"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { PageHeader } from "@/components/ui/page-header";
import { formatAlertTime } from "@/lib/alerts";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { invalidateQueries } from "@/lib/panel/cache";
import { useQuery } from "@/lib/panel/use-query";
import { hasPermission } from "@/lib/permissions";
import { canSeePage } from "@/lib/pages";
import { useAuth } from "@/context/auth-context";
import type { Server } from "@/lib/types";

export default function ServersPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, "servers", "write");
  const canDetail = canSeePage(user, "server_detail");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [description, setDescription] = useState("");
  const [environment, setEnvironment] = useState("production");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const serversQuery = useQuery("servers", () => apiFetch<{ servers: Server[] }>("/servers"), { refreshMs: 20000 });
  const servers = serversQuery.data?.servers || [];

  async function onCreate(event: FormEvent) {
    event.preventDefault();
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
      setAdding(false);
      invalidateQueries(["stats", "server:"]);
      await serversQuery.reload();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Fleet"
        subtitle="Each server is a host you enroll an agent on."
        actions={
          canWrite ? (
            <button type="button" className="btn btn-primary" onClick={() => setAdding((open) => !open)}>
              {adding ? "Close" : "Add server"}
            </button>
          ) : null
        }
      />

      {adding && canWrite ? (
        <form className="card" onSubmit={onCreate}>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-3">
                <label className="form-label">Name</label>
                <input className="form-control" required value={name} onChange={(event) => setName(event.target.value)} placeholder="main-vps" />
              </div>
              <div className="col-md-3">
                <label className="form-label">Hostname</label>
                <input className="form-control" value={hostname} onChange={(event) => setHostname(event.target.value)} />
              </div>
              <div className="col-md-3">
                <label className="form-label">Environment</label>
                <input className="form-control" value={environment} onChange={(event) => setEnvironment(event.target.value)} />
              </div>
              <div className="col-md-3">
                <label className="form-label">Note</label>
                <input className="form-control" value={description} onChange={(event) => setDescription(event.target.value)} />
              </div>
              {formError ? (
                <div className="col-12">
                  <div className="alert alert-danger mb-0">{formError}</div>
                </div>
              ) : null}
              <div className="col-12 text-end">
                <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
                  {saving ? "Saving…" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </form>
      ) : null}

      {serversQuery.loading ? <LoadingBlock /> : null}
      {serversQuery.error ? <EmptyState title="Cannot load servers" description={serversQuery.error} /> : null}
      {!serversQuery.loading && !serversQuery.error && servers.length === 0 ? (
        <EmptyState title="No servers" description="Add a host, then open it to issue an enrollment token." />
      ) : null}

      {servers.length > 0 ? (
        <div className="dx-log">
          {servers.map((server) => {
            const body = (
              <>
                <span className="d-flex justify-content-between gap-2">
                  <span className="fw-medium">{server.name}</span>
                  <span className="text-muted fs-12">{server.environment || "default"}</span>
                </span>
                <span className="d-block text-muted fs-12 mt-1">
                  {server.hostname || "No hostname"} · added {formatAlertTime(server.created_at)}
                </span>
              </>
            );
            return canDetail ? (
              <Link key={server.id} href={`/servers/${server.id}`} className="dx-role-pick text-reset">
                <span className="flex-grow-1">{body}</span>
              </Link>
            ) : (
              <div key={server.id} className="dx-role-pick">
                <span className="flex-grow-1">{body}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
