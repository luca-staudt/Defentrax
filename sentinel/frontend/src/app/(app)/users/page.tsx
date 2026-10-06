"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { Modal } from "@/components/ui/modal";
import { CyberCheckbox } from "@/components/ui/cyber-checkbox";
import { UsersIcon, SearchIcon, ShieldCheckIcon, KeyIcon } from "@/components/ui/icons";
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

  // Search filter
  const [search, setSearch] = useState("");

  // Create Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [createRoles, setCreateRoles] = useState<string[]>(["VIEWER"]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Selected User Modal state
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

  const roleOptions =
    roles.length > 0
      ? roles.map((r) => r.name)
      : ["ADMIN", "ANALYST", "OPERATOR", "VIEWER"];

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
      const updated = await apiFetch<User>(`/users/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ display_name: editName.trim() }),
      });
      const prev = selected.roles || [];
      const same =
        prev.length === editRoles.length &&
        prev.every((r) => editRoles.includes(r));
      if (!same) {
        await apiFetch(`/users/${selected.id}/roles`, {
          method: "PUT",
          body: JSON.stringify({ roles: editRoles }),
        });
      }
      setDetailMsg("Saved profile & roles");
      await load();
      const refreshed = await apiFetch<User>(`/users/${selected.id}`);
      setSelected(refreshed || { ...updated, roles: editRoles });
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
            Team & Operator Directory
            <span className="rounded-full border border-sky-500/30 bg-sky-950/40 px-2.5 py-0.5 font-mono text-xs text-sky-400">
              {users.length} Members
            </span>
          </h1>
          <p className="mt-1 font-mono text-xs text-zinc-400">
            SOC operators, privileged accounts, access roles and authentication tokens
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 font-mono text-xs font-semibold text-black transition hover:bg-sky-400 shadow-[0_0_15px_rgba(0,163,255,0.3)]"
          >
            <span>+ Add Operator</span>
          </button>
        )}
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "TOTAL OPERATORS", value: users.length, tone: "text-sky-400" },
          { label: "ACTIVE ENROLLED", value: activeCount, tone: "text-emerald-400" },
          { label: "MFA / 2FA PROTECTED", value: totpCount, tone: "text-sky-300" },
          { label: "AVAILABLE ROLES", value: roles.length || 4, tone: "text-zinc-300" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 p-4 shadow-xl backdrop-blur-md"
          >
            <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">{s.label}</p>
            <p className={`font-display mt-1.5 text-2xl font-bold ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Search Bar */}
      <div className="relative rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 p-3 shadow-xl backdrop-blur-md">
        <SearchIcon className="absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter team by email, display name, or role..."
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 py-2.5 pl-10 pr-4 font-mono text-xs text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-sky-500"
        />
      </div>

      {/* Users Table */}
      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 font-mono text-xs text-rose-300">{error}</div>
      ) : filteredUsers.length === 0 ? (
        <EmptyState title="No operators found" description="Try refining your search keyword." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 shadow-xl backdrop-blur-md">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-zinc-800/80 bg-zinc-950/60 text-[11px] uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="px-5 py-3.5">Operator</th>
                  <th className="px-5 py-3.5">Assigned Roles</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">2FA / TOTP</th>
                  <th className="px-5 py-3.5">Last Login</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-sky-950/20">
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-950/50 font-display text-xs font-bold text-sky-400">
                          {u.display_name?.charAt(0) || u.email.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-white">{u.display_name || "Operator"}</div>
                          <div className="text-[11px] text-zinc-400">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {u.roles?.map((r) => (
                          <span
                            key={r}
                            className="rounded border border-sky-500/30 bg-sky-950/40 px-2 py-0.5 font-mono text-[10px] text-sky-300"
                          >
                            {roleDisplayName(r)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                          u.is_active
                            ? "border border-emerald-500/30 bg-emerald-950/40 text-emerald-400"
                            : "border border-rose-500/30 bg-rose-950/40 text-rose-400"
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${u.is_active ? "bg-emerald-400" : "bg-rose-400"}`} />
                        {u.is_active ? "ACTIVE" : "SUSPENDED"}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-zinc-400">
                      {u.totp_enabled ? (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          <ShieldCheckIcon className="h-3.5 w-3.5" /> Enrolled
                        </span>
                      ) : (
                        <span className="text-zinc-600">Disabled</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-zinc-400 text-[11px]">
                      {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : "Never"}
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <button
                        onClick={() => void openDetail(u)}
                        className="rounded-lg border border-sky-500/30 bg-sky-950/40 px-3 py-1 font-mono text-xs font-semibold text-sky-400 hover:bg-sky-500 hover:text-black transition shadow-[0_0_8px_rgba(0,163,255,0.2)]"
                      >
                        Manage →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Operator HUD Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add SOC Operator"
        subtitle="Provision credentials and assign platform roles"
        maxWidth="max-w-2xl"
        footer={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-1.5 font-mono text-xs text-zinc-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving || !email.trim() || password.length < 12}
              onClick={onCreate}
              className="rounded-lg bg-sky-500 px-4 py-1.5 font-mono text-xs font-semibold text-black hover:bg-sky-400 disabled:opacity-50 shadow-[0_0_12px_rgba(0,163,255,0.4)]"
            >
              {saving ? "Provisioning..." : "Create Account"}
            </button>
          </div>
        }
      >
        <form onSubmit={onCreate} className="space-y-4 font-mono text-xs">
          {formError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-rose-300">
              {formError}
            </div>
          )}
          <div>
            <label className="text-zinc-400 block mb-1">OPERATOR EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@defentrax.local"
              required
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-zinc-400 block mb-1">DISPLAY NAME</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jane Doe (SecOps)"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">INITIAL PASSWORD (MIN 12)</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500"
              />
            </div>
          </div>
          <div>
            <label className="text-zinc-400 block mb-2">INITIAL ROLES</label>
            <div className="flex flex-wrap gap-2">
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
          </div>
        </form>
      </Modal>

      {/* Manage User HUD Modal */}
      {selected && (
        <Modal
          isOpen={true}
          onClose={() => setSelected(null)}
          title={`Operator: ${selected.email}`}
          subtitle={`Account ID: ${selected.id}`}
          maxWidth="max-w-3xl"
        >
          <div className="space-y-6 font-mono text-xs">
            {detailMsg && (
              <div className="rounded-lg border border-sky-500/40 bg-sky-950/30 p-2.5 text-sky-300">
                {detailMsg}
              </div>
            )}

            {/* Profile & Roles */}
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 space-y-4">
              <h4 className="text-zinc-200 font-semibold border-b border-zinc-800 pb-2">
                Operator Identity & Roles
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-zinc-400 block mb-1">DISPLAY NAME</label>
                  <input
                    type="text"
                    value={editName}
                    disabled={!canWrite || detailBusy}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">ACCOUNT STATUS</label>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      type="button"
                      disabled={!canWrite || detailBusy}
                      onClick={() => void setActive(!selected.is_active)}
                      className={`rounded-lg px-3 py-1.5 font-semibold transition ${
                        selected.is_active
                          ? "border border-amber-500/40 bg-amber-950/30 text-amber-300 hover:bg-amber-900/40"
                          : "border border-emerald-500/40 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/40"
                      }`}
                    >
                      {selected.is_active ? "Suspend Account" : "Reactivate Account"}
                    </button>
                    {selected.totp_enabled && canWrite && (
                      <button
                        type="button"
                        disabled={detailBusy}
                        onClick={() => void resetTotp()}
                        className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-1.5 text-rose-300 hover:bg-rose-900/40"
                      >
                        Reset 2FA
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-2">ASSIGNED ROLES</label>
                <div className="flex flex-wrap gap-2">
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
              </div>

              {canWrite && (
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={detailBusy}
                    onClick={() => void saveProfile()}
                    className="rounded-lg bg-sky-500 px-4 py-1.5 font-semibold text-black hover:bg-sky-400 shadow-[0_0_10px_rgba(0,163,255,0.4)]"
                  >
                    {detailBusy ? "Saving..." : "Save Identity & Roles"}
                  </button>
                </div>
              )}
            </div>

            {/* Password Reset */}
            {canWrite && (
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 space-y-3">
                <h4 className="text-zinc-200 font-semibold">Administrative Password Reset</h4>
                <div className="flex flex-col sm:flex-row gap-3 items-center">
                  <input
                    type="password"
                    value={editPassword}
                    onChange={(e) => setEditPassword(e.target.value)}
                    placeholder="New password (min 12 characters)"
                    className="flex-1 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500"
                  />
                  <button
                    type="button"
                    disabled={detailBusy || editPassword.length < 12}
                    onClick={() => void resetPassword()}
                    className="w-full sm:w-auto rounded-lg border border-amber-500/40 bg-amber-950/30 px-4 py-2 font-semibold text-amber-300 hover:bg-amber-900/40 disabled:opacity-40"
                  >
                    Force Reset Password
                  </button>
                </div>
              </div>
            )}

            {/* Active Sessions */}
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <h4 className="text-zinc-200 font-semibold">Active Operator Sessions ({sessions.length})</h4>
                {sessions.length > 0 && canWrite && (
                  <button
                    type="button"
                    disabled={detailBusy}
                    onClick={() => void revokeAllSessions()}
                    className="text-[11px] text-rose-400 hover:underline"
                  >
                    Revoke All
                  </button>
                )}
              </div>

              {sessions.length === 0 ? (
                <p className="text-zinc-500 text-xs py-2">No active sessions found for this operator.</p>
              ) : (
                <div className="space-y-2">
                  {sessions.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 p-2.5 text-[11px]"
                    >
                      <div>
                        <div className="text-zinc-200 font-mono">
                          {s.ip_address || "Unknown IP"} {s.current && <span className="text-emerald-400 font-bold">(Current)</span>}
                        </div>
                        <div className="text-zinc-500 truncate max-w-sm">{s.user_agent || "Browser Session"}</div>
                      </div>
                      {canWrite && (
                        <button
                          type="button"
                          onClick={() => void revokeSession(s.id)}
                          className="rounded border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-zinc-400 hover:border-rose-500 hover:text-rose-300"
                        >
                          Revoke
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
