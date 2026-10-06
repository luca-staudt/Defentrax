"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { CyberCheckbox } from "@/components/ui/cyber-checkbox";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { hasPermission, roleDisplayName } from "@/lib/permissions";
import { useAuth } from "@/context/auth-context";
import type { Role, User, UserSession } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand-500/60";
const btnPrimary =
  "rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-black hover:bg-brand-400 disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-brand-500/50";
const btnDanger =
  "rounded-lg border border-red-800/60 px-3 py-1.5 text-xs text-red-300 hover:border-red-500/60";

export default function TeamUsersPage() {
  const { user: me } = useAuth();
  const canWrite = hasPermission(me, "users", "write");

  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const [u, r] = await Promise.all([
        apiFetch<{ users: User[] }>("/users"),
        apiFetch<{ roles: Role[] }>("/roles").catch(() => ({ roles: [] as Role[] })),
      ]);
      setUsers(u.users || []);
      setRoles(r.roles || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(u: User) {
    setSelected(u);
    setEditName(u.display_name || "");
    setEditRoles(u.roles || []);
    setEditPassword("");
    setDetailMsg(null);
    setSessions([]);
    if (canWrite) {
      try {
        const res = await apiFetch<{ sessions: UserSession[] }>(
          `/users/${u.id}/sessions`,
        );
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
      await load();
    } catch (err) {
      setFormError(
        err instanceof ApiRequestError ? err.message : "Create failed",
      );
    } finally {
      setSaving(false);
    }
  }

  function toggleRole(list: string[], name: string, set: (v: string[]) => void) {
    if (list.includes(name)) {
      if (list.length === 1) return;
      set(list.filter((r) => r !== name));
    } else {
      set([...list, name]);
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
      setDetailMsg("Saved");
      await load();
      const refreshed = await apiFetch<User>(`/users/${selected.id}`);
      setSelected(refreshed || { ...updated, roles: editRoles });
    } catch (err) {
      setDetailMsg(
        err instanceof ApiRequestError ? err.message : "Save failed",
      );
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
      setDetailMsg(active ? "User enabled" : "User disabled");
      await load();
    } catch (err) {
      setDetailMsg(
        err instanceof ApiRequestError ? err.message : "Update failed",
      );
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
      setDetailMsg("Password reset; sessions revoked");
      setSessions([]);
    } catch (err) {
      setDetailMsg(
        err instanceof ApiRequestError ? err.message : "Password reset failed",
      );
    } finally {
      setDetailBusy(false);
    }
  }

  async function resetTotp() {
    if (!selected || !canWrite) return;
    if (!window.confirm("Reset 2FA for this user? They must re-enroll.")) return;
    setDetailBusy(true);
    setDetailMsg(null);
    try {
      await apiFetch(`/users/${selected.id}/totp/reset`, { method: "POST" });
      setSelected({ ...selected, totp_enabled: false });
      setDetailMsg("2FA reset");
      await load();
    } catch (err) {
      setDetailMsg(
        err instanceof ApiRequestError ? err.message : "2FA reset failed",
      );
    } finally {
      setDetailBusy(false);
    }
  }

  async function revokeSession(sessionId: string) {
    if (!selected || !canWrite) return;
    setDetailBusy(true);
    try {
      await apiFetch(`/users/${selected.id}/sessions/${sessionId}`, {
        method: "DELETE",
      });
      setSessions((s) => s.filter((x) => x.id !== sessionId));
      setDetailMsg("Session revoked");
    } catch (err) {
      setDetailMsg(
        err instanceof ApiRequestError ? err.message : "Revoke failed",
      );
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
      setDetailMsg(
        err instanceof ApiRequestError ? err.message : "Revoke failed",
      );
    } finally {
      setDetailBusy(false);
    }
  }

  if (loading) return <LoadingBlock />;
  if (error) return <EmptyState title="Cannot load team" description={error} />;

  const roleOptions =
    roles.length > 0
      ? roles.map((r) => r.name)
      : ["SUPER_ADMIN", "ADMIN", "SECURITY_ANALYST", "OPERATOR", "VIEWER"];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl font-semibold text-white">Team</h1>
        <p className="text-sm text-zinc-500">
          Individual admin accounts with roles — not a shared login
        </p>
      </header>

      {canWrite ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Create user
          </h2>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={onCreate}>
            <label className="block text-xs text-zinc-500">
              Email
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Password (min 12)
              <input
                required
                type="password"
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputClass} mt-1`}
                autoComplete="new-password"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              Display name
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={`${inputClass} mt-1`}
              />
            </label>
            <div className="text-xs text-zinc-500">
              Roles
              <div className="mt-2 flex flex-wrap gap-2">
                {roleOptions.map((name) => (
                  <CyberCheckbox
                    key={name}
                    variant="pill"
                    label={roleDisplayName(name)}
                    checked={createRoles.includes(name)}
                    onChange={() =>
                      toggleRole(createRoles, name, setCreateRoles)
                    }
                  />
                ))}
              </div>
            </div>
            {formError ? (
              <p className="md:col-span-2 text-sm text-red-400">{formError}</p>
            ) : null}
            <div className="md:col-span-2">
              <button type="submit" disabled={saving} className={btnPrimary}>
                {saving ? "Creating…" : "Create user"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {users.length === 0 ? (
        <EmptyState
          title="No users"
          description="Create the first team account above."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-900/80 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Roles</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">2FA</th>
                <th className="px-4 py-3">Last login</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-zinc-900/40">
                  <td className="px-4 py-3">
                    <div className="text-zinc-100">{u.email}</div>
                    <div className="text-xs text-zinc-500">
                      {u.display_name || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {(u.roles || []).map(roleDisplayName).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${
                        u.is_active
                          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                          : "border-zinc-600 bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {u.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {u.totp_enabled ? "On" : "Off"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-zinc-500">
                    {u.last_login_at || "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() => void openDetail(u)}
                    >
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-white">
                  {selected.email}
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Created {selected.created_at || "—"} · Updated{" "}
                  {selected.updated_at || "—"}
                </p>
              </div>
              <button
                type="button"
                className={btnGhost}
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>

            {canWrite ? (
              <div className="space-y-5">
                <label className="block text-xs text-zinc-500">
                  Display name
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className={`${inputClass} mt-1`}
                  />
                </label>
                <div className="text-xs text-zinc-500">
                  Roles
                  <div className="mt-2 flex flex-wrap gap-2">
                    {roleOptions.map((name) => (
                      <CyberCheckbox
                        key={name}
                        variant="pill"
                        label={roleDisplayName(name)}
                        checked={editRoles.includes(name)}
                        onChange={() =>
                          toggleRole(editRoles, name, setEditRoles)
                        }
                      />
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={detailBusy}
                    className={btnPrimary}
                    onClick={() => void saveProfile()}
                  >
                    Save profile & roles
                  </button>
                  {selected.is_active ? (
                    <button
                      type="button"
                      disabled={detailBusy || selected.id === me?.id}
                      className={btnDanger}
                      onClick={() => void setActive(false)}
                    >
                      Disable
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={detailBusy}
                      className={btnGhost}
                      onClick={() => void setActive(true)}
                    >
                      Enable
                    </button>
                  )}
                  {selected.totp_enabled ? (
                    <button
                      type="button"
                      disabled={detailBusy}
                      className={btnDanger}
                      onClick={() => void resetTotp()}
                    >
                      Reset 2FA
                    </button>
                  ) : null}
                </div>

                <div className="border-t border-zinc-800 pt-4">
                  <h3 className="mb-2 text-sm font-medium text-zinc-300">
                    Reset password
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="password"
                      minLength={12}
                      placeholder="New password (min 12)"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      className={`${inputClass} max-w-xs`}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      disabled={detailBusy}
                      className={btnGhost}
                      onClick={() => void resetPassword()}
                    >
                      Reset & revoke sessions
                    </button>
                  </div>
                </div>

                <div className="border-t border-zinc-800 pt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-medium text-zinc-300">
                      Active sessions
                    </h3>
                    {sessions.length > 0 ? (
                      <button
                        type="button"
                        className={btnDanger}
                        disabled={detailBusy}
                        onClick={() => void revokeAllSessions()}
                      >
                        Revoke all
                      </button>
                    ) : null}
                  </div>
                  {sessions.length === 0 ? (
                    <p className="text-xs text-zinc-600">No active sessions</p>
                  ) : (
                    <ul className="space-y-2 text-xs text-zinc-400">
                      {sessions.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800 px-3 py-2"
                        >
                          <div>
                            <div>
                              {s.ip_address || "—"}{" "}
                              {s.current ? (
                                <span className="text-brand-300">(current)</span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 truncate text-zinc-600">
                              {s.user_agent || "—"}
                            </div>
                            <div className="mt-0.5 text-zinc-600">
                              Expires {s.expires_at}
                            </div>
                          </div>
                          <button
                            type="button"
                            className={btnDanger}
                            disabled={detailBusy}
                            onClick={() => void revokeSession(s.id)}
                          >
                            Revoke
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">
                You have read-only access to the team directory.
              </p>
            )}

            {detailMsg ? (
              <p className="mt-4 text-sm text-brand-200">{detailMsg}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
