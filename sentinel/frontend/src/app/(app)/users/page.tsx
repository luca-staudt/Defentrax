"use client";

import { FormEvent, useCallback, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { PageHeader } from "@/components/ui/page-header";
import { RoleAssignList } from "@/components/access/role-assign";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { useQuery } from "@/lib/panel/use-query";
import { hasPermission, roleDisplayName } from "@/lib/permissions";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/context/auth-context";
import type { Role, User, UserSession } from "@/lib/types";

export default function TeamUsersPage() {
  const { user: me } = useAuth();
  const { t } = useI18n();
  const canWrite = hasPermission(me, "users", "write");

  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
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

  const usersQuery = useQuery("users", async () => (await apiFetch<{ users: User[] }>("/users")).users || [], {
    refreshMs: 20000,
  });
  const rolesQuery = useQuery("roles", async () => (await apiFetch<{ roles: Role[] }>("/roles")).roles || []);
  const roleCatalog = rolesQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const roles = roleCatalog;
  const loading = usersQuery.loading;
  const loadError = usersQuery.error;
  const load = useCallback(async () => {
    await Promise.all([usersQuery.reload(), rolesQuery.reload()]);
  }, [usersQuery, rolesQuery]);

  const roleOptions = roles.length > 0 ? roles.map((r) => r.name) : ["ADMIN", "SECURITY_ANALYST", "OPERATOR", "VIEWER"];
  const assignableRoles: Role[] =
    roleCatalog.length > 0
      ? roleCatalog
      : roleOptions.map((name) => ({
          id: name,
          name,
          description: "",
          is_system: true,
          created_at: "",
        }));

  async function openDetail(u: User) {
    setCreating(false);
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
      setCreating(false);
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
        title={t("people.title")}
        subtitle={t("people.subtitle")}
        actions={
          canWrite ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setCreating(true);
                setFormError(null);
              }}
            >
              {t("people.add")}
            </button>
          ) : null
        }
      />

      <div className="row g-3 mb-3">
        <Stat label={t("people.operators")} value={users.length} />
        <Stat label={t("people.active")} value={activeCount} />
        <Stat label="2FA" value={totpCount} />
        <Stat label={t("people.roles")} value={roles.length || roleOptions.length} />
      </div>

      {loadError ? <div className="alert alert-danger">{loadError}</div> : null}

      <div className="row">
        <div className="col-xl-5">
          <div className="card">
            <div className="card-body">
              <input
                className="form-control mb-3"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("people.filter")}
              />
              {filteredUsers.length === 0 ? (
                <EmptyState title={t("people.none")} description={t("people.noneHint")} />
              ) : (
                <div className="dx-log">
                  {filteredUsers.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      className={!creating && selected?.id === person.id ? "is-on" : ""}
                      onClick={() => void openDetail(person)}
                    >
                      <span className="d-flex justify-content-between gap-2">
                        <span className="fw-medium">{person.display_name || person.email}</span>
                        <span className={`badge ${person.is_active ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"}`}>
                          {person.is_active ? t("people.active") : t("people.suspended")}
                        </span>
                      </span>
                      <span className="d-block text-muted fs-12 mt-1">{person.email}</span>
                      <span className="d-block mt-2">
                        {(person.roles || []).map((role) => (
                          <span key={role} className="badge bg-primary-subtle text-primary me-1">
                            {roleDisplayName(role)}
                          </span>
                        ))}
                        <span className="text-muted fs-12">{person.totp_enabled ? t("people.totpOn") : t("people.totpOff")}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-xl-7">
          <div className="card dx-detail">
            <div className="card-header">
              <h4 className="card-title mb-0">{creating ? t("people.new") : selected?.email || t("people.operator")}</h4>
            </div>
            <div className="card-body">
              {creating && canWrite ? (
                <form onSubmit={(e) => void onCreate(e)}>
                  <label className="form-label">{t("login.email")}</label>
                  <input required type="email" className="form-control mb-3" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <label className="form-label">{t("people.displayName")}</label>
                  <input className="form-control mb-3" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                  <label className="form-label">{t("login.password")}</label>
                  <input required type="password" minLength={12} className="form-control mb-3" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <p className="form-label">{t("people.roles")}</p>
                  <RoleAssignList roles={assignableRoles} selected={createRoles} onChange={setCreateRoles} />
                  {formError ? <div className="alert alert-danger mt-3">{formError}</div> : null}
                  <div className="d-flex gap-2 mt-3">
                    <button type="button" className="btn btn-light" onClick={() => setCreating(false)}>
                      {t("common.cancel")}
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? t("views.saving") : t("people.create")}
                    </button>
                  </div>
                </form>
              ) : selected ? (
                <>
                  {detailMsg ? <div className="alert alert-info">{detailMsg}</div> : null}
                  <label className="form-label">{t("people.displayName")}</label>
                  <input className="form-control mb-3" value={editName} onChange={(e) => setEditName(e.target.value)} disabled={!canWrite || detailBusy} />
                  <p className="form-label">{t("people.roles")}</p>
                  <RoleAssignList roles={assignableRoles} selected={editRoles} disabled={!canWrite || detailBusy} onChange={setEditRoles} />
                  <div className="d-flex flex-wrap gap-2 my-3">
                    <button type="button" className="btn btn-primary" disabled={!canWrite || detailBusy} onClick={() => void saveProfile()}>
                      {t("people.save")}
                    </button>
                    <button type="button" className="btn btn-light" disabled={!canWrite || detailBusy} onClick={() => void setActive(!selected.is_active)}>
                      {selected.is_active ? t("people.suspend") : t("people.activate")}
                    </button>
                    <button type="button" className="btn btn-light" disabled={!canWrite || detailBusy} onClick={() => void resetTotp()}>
                      {t("people.reset2fa")}
                    </button>
                  </div>
                  <label className="form-label">{t("people.newPassword")}</label>
                  <div className="input-group mb-3">
                    <input type="password" className="form-control" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} disabled={!canWrite || detailBusy} />
                    <button type="button" className="btn btn-light" disabled={!canWrite || detailBusy} onClick={() => void resetPassword()}>
                      {t("people.resetPassword")}
                    </button>
                  </div>
                  {canWrite ? (
                    <div>
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <h6 className="mb-0">{t("people.sessions")}</h6>
                        <button type="button" className="btn btn-sm btn-light" disabled={detailBusy || sessions.length === 0} onClick={() => void revokeAllSessions()}>
                          {t("people.revokeAll")}
                        </button>
                      </div>
                      {sessions.length === 0 ? (
                        <p className="text-muted mb-0">{t("people.noSessions")}</p>
                      ) : (
                        <div className="dx-log">
                          {sessions.map((session) => (
                            <div key={session.id} className="dx-metric">
                              <span className="d-flex justify-content-between align-items-center gap-2">
                                <span>
                                  {session.ip_address || t("common.unknown")} · {session.created_at}
                                </span>
                                <button type="button" className="btn btn-sm btn-light" onClick={() => void revokeSession(session.id)}>
                                  {t("people.revoke")}
                                </button>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </>
              ) : (
                <EmptyState title={t("people.pick")} description={t("people.pickHint")} />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="col-6 col-xl-3">
      <div className="dx-metric">
        <span className="text-muted text-uppercase fs-12">{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
