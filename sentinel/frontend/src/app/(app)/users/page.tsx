"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { CyberCheckbox } from "@/components/ui/cyber-checkbox";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { hasPermission, roleDisplayName } from "@/lib/permissions";
import { useAuth } from "@/context/auth-context";
import type { Role, User, UserSession } from "@/lib/types";

export default function TeamUsersPage() {
  const { user: me } = useAuth();
  const canWrite = hasPermission(me, "users", "write");

  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [createRoles, setCreateRoles] = useState<string[]>(["VIEWER"]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selected, setSelected] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editRoles, setEditRoles] = useState<string[]>([]);
  const [editPassword, setEditPassword] = useState("");
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailMsg, setDetailMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [uRes, rRes] = await Promise.all([
        apiFetch<{ users: User[] }>("/users"),
        apiFetch<{ roles: Role[] }>("/roles").catch(() => ({ roles: [] as Role[] })),
      ]);
      setUsers(uRes.users || []);
      setRoles(rRes.roles || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load team users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const roleOptions = roles.length > 0 ? roles.map((r) => r.name) : ["ADMIN", "ANALYST", "OPERATOR", "VIEWER"];

  function toggleRole(list: string[], name: string, setList: (v: string[]) => void) {
    if (list.includes(name)) {
      if (list.length > 1) setList(list.filter((x) => x !== name));
    } else {
      setList([...list, name]);
    }
  }

  async function openDetail(u: User) {
    setSelected(u);
    setEditName(u.display_name || "");
    setEditRoles(u.roles || []);
    setEditPassword("");
    setDetailMsg(null);
    setSessions([]);
    if (canWrite) {
      try {
        const res = await apiFetch<{ sessions: UserSession[] }>(`/users/${u.id}/sessions`);
        setSessions(res.sessions || []);
      } catch {
        setSessions([]);
      }
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setFormError(null);
    setSaving(true);
    try {
      await apiFetch<User>("/users", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim(),
          password,
          display_name: displayName.trim() || undefined,
          roles: createRoles,
        }),
      });
      setEmail("");
      setPassword("");
      setDisplayName("");
      setCreateRoles(["VIEWER"]);
      setCreateOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile() {
    if (!selected || !canWrite) return;
    setDetailBusy(true);
    setDetailMsg(null);
    try {
      await apiFetch<User>(`/users/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ display_name: editName.trim() }),
      });
      const prev = selected.roles || [];
      const same = prev.length === editRoles.length && prev.every((r) => editRoles.includes(r));
      if (!same) {
        await apiFetch(`/users/${selected.id}/roles`, {
          method: "PUT",
          body: JSON.stringify({ roles: editRoles }),
        });
      }
      setDetailMsg("Saved profile & roles");
      await load();
      const refreshed = await apiFetch<User>(`/users/${selected.id}`);
      setSelected(refreshed || { ...selected, display_name: editName.trim(), roles: editRoles });
    } catch (err) {
      setDetailMsg(err instanceof ApiRequestError ? err.message : "Save failed");
    } finally {
      setDetailBusy(false);
    }
  }

  async function setActive(active: boolean) {
    if (!selected || !canWrite) return;
    setDetailBusy(true);
    setDetailMsg(null);
    try {
      const updated = await apiFetch<User>(`/users/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: active }),
      });
      setSelected(updated);
      setDetailMsg(active ? "User activated" : "User suspended");
      await load();
    } catch (err) {
      setDetailMsg(err instanceof ApiRequestError ? err.message : "Update failed");
    } finally {
      setDetailBusy(false);
    }
  }

  async function resetPassword() {
    if (!selected || !canWrite || editPassword.length < 12) {
      setDetailMsg("Password must be at least 12 characters");
      return;
    }
    setDetailBusy(true);
    setDetailMsg(null);
    try {
      await apiFetch(`/users/${selected.id}/password`, {
        method: "POST",
        body: JSON.stringify({ password: editPassword }),
      });
      setEditPassword("");
      setDetailMsg("Password reset successfully. Active sessions revoked.");
      setSessions([]);
    } catch (err) {
      setDetailMsg(err instanceof ApiRequestError ? err.message : "Password reset failed");
    } finally {
      setDetailBusy(false);
    }
  }

  async function resetTotp() {
    if (!selected || !canWrite) return;
    if (!confirm("Reset 2FA for this user? They will be required to re-enroll.")) return;
    setDetailBusy(true);
    setDetailMsg(null);
    try {
      await apiFetch(`/users/${selected.id}/totp/reset`, { method: "POST" });
      setSelected({ ...selected, totp_enabled: false });
      setDetailMsg("2FA reset successfully");
      await load();
    } catch (err) {
      setDetailMsg(err instanceof ApiRequestError ? err.message : "2FA reset failed");
    } finally {
      setDetailBusy(false);
    }
  }

  async function revokeSession(sessionId: string) {
    if (!selected || !canWrite) return;
    setDetailBusy(true);
    try {
      await apiFetch(`/users/${selected.id}/sessions/${sessionId}`, { method: "DELETE" });
      setSessions((s) => s.filter((x) => x.id !== sessionId));
      setDetailMsg("Session revoked");
    } catch (err) {
      setDetailMsg(err instanceof ApiRequestError ? err.message : "Revoke failed");
    } finally {
      setDetailBusy(false);
    }
  }

  async function revokeAllSessions() {
    if (!selected || !canWrite) return;
    setDetailBusy(true);
    try {
      await apiFetch(`/users/${selected.id}/sessions`, { method: "DELETE" });
      setSessions([]);
      setDetailMsg("All sessions revoked");
    } catch (err) {
      setDetailMsg(err instanceof ApiRequestError ? err.message : "Revoke failed");
    } finally {
      setDetailBusy(false);
    }
  }

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      q === "" ||
      u.email.toLowerCase().includes(q) ||
      (u.display_name && u.display_name.toLowerCase().includes(q)) ||
      u.roles?.some((r) => r.toLowerCase().includes(q))
    );
  });

  const activeCount = users.filter((u) => u.is_active).length;
  const totpCount = users.filter((u) => u.totp_enabled).length;

  if (loading) return <LoadingBlock />;

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="Operators, roles, and authentication"
        actions={
          canWrite ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              Add operator
            </button>
          ) : null
        }
      />

      <div className="row">
        {[
          ["Operators", users.length],
          ["Active", activeCount],
          ["2FA enabled", totpCount],
          ["Roles", roles.length || roleOptions.length],
        ].map(([label, value]) => (
          <div className="col-md-3" key={String(label)}>
            <div className="card">
              <div className="card-body">
                <p className="text-muted text-uppercase fs-12 mb-1">{label}</p>
                <h4 className="mb-0">{value}</h4>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-body">
          <input className="form-control" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by email, name, or role" />
        </div>
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}
      {filteredUsers.length === 0 ? (
        <EmptyState title="No operators found" description="Try refining your search keyword." />
      ) : (
        <div className="card">
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Operator</th>
                    <th>Roles</th>
                    <th>Status</th>
                    <th>2FA</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="fw-medium">{u.display_name || u.email}</div>
                        <div className="text-muted fs-12">{u.email}</div>
                      </td>
                      <td>
                        {(u.roles || []).map((r) => (
                          <span key={r} className="badge bg-primary-subtle text-primary me-1">
                            {roleDisplayName(r)}
                          </span>
                        ))}
                      </td>
                      <td>
                        <span className={`badge ${u.is_active ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"}`}>
                          {u.is_active ? "Active" : "Suspended"}
                        </span>
                      </td>
                      <td>{u.totp_enabled ? "On" : "Off"}</td>
                      <td className="text-end">
                        <button type="button" className="btn btn-sm btn-light" onClick={() => void openDetail(u)}>
                          Manage
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Add operator">
        <form onSubmit={(e) => void onCreate(e)}>
          <div className="mb-3">
            <label className="form-label">Email</label>
            <input required type="email" className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="mb-3">
            <label className="form-label">Display name</label>
            <input className="form-control" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="mb-3">
            <label className="form-label">Password</label>
            <input required type="password" minLength={12} className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="mb-3">
            <label className="form-label d-block">Roles</label>
            {roleOptions.map((name) => (
              <CyberCheckbox
                key={name}
                variant="pill"
                label={roleDisplayName(name)}
                checked={createRoles.includes(name)}
                onChange={() => toggleRole(createRoles, name, setCreateRoles)}
              />
            ))}
          </div>
          {formError ? <div className="alert alert-danger">{formError}</div> : null}
          <div className="text-end">
            <button type="button" className="btn btn-light me-2" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Create"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={selected?.email || "Operator"}>
        {selected ? (
          <>
            {detailMsg ? <div className="alert alert-info">{detailMsg}</div> : null}
            <div className="mb-3">
              <label className="form-label">Display name</label>
              <input className="form-control" value={editName} onChange={(e) => setEditName(e.target.value)} disabled={!canWrite || detailBusy} />
            </div>
            <div className="mb-3">
              <label className="form-label d-block">Roles</label>
              {roleOptions.map((name) => (
                <CyberCheckbox
                  key={name}
                  variant="pill"
                  disabled={!canWrite || detailBusy}
                  label={roleDisplayName(name)}
                  checked={editRoles.includes(name)}
                  onChange={() => toggleRole(editRoles, name, setEditRoles)}
                />
              ))}
            </div>
            <div className="d-flex flex-wrap gap-2 mb-3">
              <button type="button" className="btn btn-primary" disabled={!canWrite || detailBusy} onClick={() => void saveProfile()}>
                Save
              </button>
              <button type="button" className="btn btn-light" disabled={!canWrite || detailBusy} onClick={() => void setActive(!selected.is_active)}>
                {selected.is_active ? "Suspend" : "Activate"}
              </button>
              <button type="button" className="btn btn-light" disabled={!canWrite || detailBusy} onClick={() => void resetTotp()}>
                Reset 2FA
              </button>
            </div>
            <div className="mb-3">
              <label className="form-label">New password</label>
              <div className="input-group">
                <input type="password" className="form-control" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} disabled={!canWrite || detailBusy} />
                <button type="button" className="btn btn-light" disabled={!canWrite || detailBusy} onClick={() => void resetPassword()}>
                  Reset password
                </button>
              </div>
            </div>
            {canWrite ? (
              <div>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="mb-0">Sessions</h6>
                  <button type="button" className="btn btn-sm btn-light" disabled={detailBusy || sessions.length === 0} onClick={() => void revokeAllSessions()}>
                    Revoke all
                  </button>
                </div>
                {sessions.length === 0 ? (
                  <p className="text-muted mb-0">No active sessions.</p>
                ) : (
                  <ul className="list-group">
                    {sessions.map((s) => (
                      <li key={s.id} className="list-group-item d-flex justify-content-between align-items-center">
                        <span>
                          {s.ip_address || "unknown"} · {s.created_at}
                        </span>
                        <button type="button" className="btn btn-sm btn-light" onClick={() => void revokeSession(s.id)}>
                          Revoke
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </>
        ) : null}
      </Modal>
    </>
  );
}
