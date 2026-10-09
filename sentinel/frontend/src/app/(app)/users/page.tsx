"use client";

import { FormEvent, useCallback, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { Modal } from "@/components/ui/modal";
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
      setFormError(err instanceof ApiRequestError ? err.message : t("people.createFailed"));
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
      setDetailMsg(t("people.saved"));
      await load();
      const refreshed = await apiFetch<User>(`/users/${selected.id}`);
      setSelected(refreshed || { ...selected, display_name: editName.trim(), roles: editRoles });
    } catch (err) {
      setDetailMsg(err instanceof ApiRequestError ? err.message : t("people.saveFailed"));
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
      setDetailMsg(active ? t("people.activated") : t("people.suspendedMsg"));
      await load();
    } catch (err) {
      setDetailMsg(err instanceof ApiRequestError ? err.message : t("people.updateFailed"));
    } finally {
      setDetailBusy(false);
    }
  }

  async function resetPassword() {
    if (!selected || !canWrite || editPassword.length < 12) {
      setDetailMsg(t("people.passwordShort"));
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
      setDetailMsg(t("people.passwordReset"));
      setSessions([]);
    } catch (err) {
      setDetailMsg(err instanceof ApiRequestError ? err.message : t("people.saveFailed"));
    } finally {
      setDetailBusy(false);
    }
  }

  async function resetTotp() {
    if (!selected || !canWrite) return;
    if (!confirm(t("people.confirmReset2fa"))) return;
    setDetailBusy(true);
    setDetailMsg(null);
    try {
      await apiFetch(`/users/${selected.id}/totp/reset`, { method: "POST" });
      setSelected({ ...selected, totp_enabled: false });
      setDetailMsg(t("people.totpReset"));
      await load();
    } catch (err) {
      setDetailMsg(err instanceof ApiRequestError ? err.message : t("people.saveFailed"));
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
      setDetailMsg(t("people.sessionRevoked"));
    } catch (err) {
      setDetailMsg(err instanceof ApiRequestError ? err.message : t("people.revokeFailed"));
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
      setDetailMsg(t("people.sessionsCleared"));
    } catch (err) {
      setDetailMsg(err instanceof ApiRequestError ? err.message : t("people.revokeFailed"));
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
  const suspendedCount = users.filter((u) => !u.is_active).length;
  const totpCount = users.filter((u) => u.totp_enabled).length;
  const totpCoverage = users.length > 0 ? Math.round((totpCount / users.length) * 100) : 0;

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
                setSelected(null);
                setFormError(null);
              }}
            >
              {t("people.add")}
            </button>
          ) : null
        }
      />

      <div className="row g-3 mb-3">
        <Stat
          label={t("people.operators")}
          value={users.length}
          hint={t("people.operatorsHint")}
          icon="ri-team-line"
          tone="primary"
        />
        <Stat
          label={t("people.active")}
          value={activeCount}
          hint={`${suspendedCount} ${t("people.suspended").toLowerCase()}`}
          icon="ri-user-follow-line"
          tone="success"
          progress={users.length > 0 ? Math.round((activeCount / users.length) * 100) : 0}
        />
        {totpCount > 0 ? (
          <Stat
            label="2FA"
            value={totpCount}
            hint={`${totpCoverage}% · ${t("people.totpHint")}`}
            icon="ri-shield-keyhole-line"
            tone="info"
            progress={totpCoverage}
          />
        ) : null}
        <Stat
          label={t("people.roles")}
          value={roles.length || roleOptions.length}
          hint={t("people.rolesHint")}
          icon="ri-key-2-line"
          tone="warning"
        />
      </div>

      {loadError ? <div className="alert alert-danger">{loadError}</div> : null}

      <div className="card">
        <div className="card-body">
          <input className="form-control mb-3" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("people.filter")} />
          {filteredUsers.length === 0 ? (
            <EmptyState title={t("people.none")} description={t("people.noneHint")} />
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>{t("people.operator")}</th>
                    <th>{t("login.email")}</th>
                    <th>{t("people.roles")}</th>
                    <th>{t("alerts.status")}</th>
                    <th className="text-end">{t("common.open")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((person) => (
                    <tr key={person.id}>
                      <td>
                        <button type="button" className="btn btn-link p-0 fw-medium" onClick={() => void openDetail(person)}>
                          {person.display_name || person.email}
                        </button>
                        {person.totp_enabled ? <span className="d-block text-muted fs-12">{t("people.totpOn")}</span> : null}
                      </td>
                      <td className="text-muted">{person.email}</td>
                      <td>
                        {(person.roles || []).map((role) => (
                          <span key={role} className="badge bg-primary-subtle text-primary me-1">
                            {roleDisplayName(role)}
                          </span>
                        ))}
                      </td>
                      <td>
                        <span className={`badge ${person.is_active ? "bg-success-subtle text-success" : "bg-danger-subtle text-danger"}`}>
                          {person.is_active ? t("people.active") : t("people.suspended")}
                        </span>
                      </td>
                      <td className="text-end">
                        <button type="button" className="btn btn-soft-primary btn-sm" onClick={() => void openDetail(person)} aria-label={t("common.open")}>
                          <i className="ri-eye-line align-middle me-1"></i>
                          {t("common.open")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Modal
        isOpen={creating}
        onClose={() => {
          if (saving) return;
          setCreating(false);
        }}
        size="lg"
        title={t("people.new")}
        footer={
          <div className="d-flex gap-2">
            <button type="button" className="btn btn-light" disabled={saving} onClick={() => setCreating(false)}>
              {t("common.cancel")}
            </button>
            <button type="submit" form="person-create" className="btn btn-primary" disabled={saving}>
              {saving ? t("views.saving") : t("people.create")}
            </button>
          </div>
        }
      >
        <form id="person-create" onSubmit={(e) => void onCreate(e)}>
          <label className="form-label">{t("login.email")}</label>
          <input required type="email" className="form-control mb-3" value={email} onChange={(e) => setEmail(e.target.value)} />
          <label className="form-label">{t("people.displayName")}</label>
          <input className="form-control mb-3" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <label className="form-label">{t("login.password")}</label>
          <input required type="password" minLength={12} className="form-control mb-3" value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className="form-label">{t("people.roles")}</p>
          <RoleAssignList roles={assignableRoles} selected={createRoles} onChange={setCreateRoles} />
          {formError ? <div className="alert alert-danger mt-3 mb-0">{formError}</div> : null}
        </form>
      </Modal>

      <Modal isOpen={!!selected && !creating} onClose={() => setSelected(null)} size="xl" title={selected?.display_name || selected?.email || t("people.operator")} subtitle={selected?.email}>
        {selected ? (
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
              {selected.totp_enabled ? (
                <button type="button" className="btn btn-light" disabled={!canWrite || detailBusy} onClick={() => void resetTotp()}>
                  {t("people.reset2fa")}
                </button>
              ) : null}
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
                  <div className="table-responsive">
                    <table className="table table-sm align-middle mb-0">
                      <tbody>
                        {sessions.map((session) => (
                          <tr key={session.id}>
                            <td>
                              {session.ip_address || t("common.unknown")} · {session.created_at}
                            </td>
                            <td className="text-end">
                              <button type="button" className="btn btn-sm btn-light" onClick={() => void revokeSession(session.id)}>
                                {t("people.revoke")}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : null}
          </>
        ) : null}
      </Modal>
    </>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
  tone,
  progress,
}: {
  label: string;
  value: number;
  hint: string;
  icon: string;
  tone: "primary" | "success" | "info" | "warning";
  progress?: number;
}) {
  return (
    <div className="col-12 col-sm-6 col-xl">
      <div className={`card card-animate dx-stat-card dx-stat-${tone} h-100`}>
        <div className="card-body">
          <div className="d-flex align-items-start justify-content-between gap-2">
            <div className="overflow-hidden">
              <p className="text-uppercase fw-medium text-muted text-truncate mb-1 fs-12">{label}</p>
              <h4 className="fs-22 fw-semibold ff-secondary mb-1">{value.toLocaleString()}</h4>
              <p className="text-muted mb-0 fs-12 text-truncate">{hint}</p>
            </div>
            <span className={`avatar-sm flex-shrink-0`}>
              <span className={`avatar-title bg-${tone}-subtle text-${tone} rounded-circle fs-3`}>
                <i className={icon} />
              </span>
            </span>
          </div>
          {typeof progress === "number" ? (
            <div className="progress progress-sm animated-progess mt-3 mb-0">
              <div
                className={`progress-bar bg-${tone}`}
                role="progressbar"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
