"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { Modal } from "@/components/ui/modal";
import { CyberCheckbox } from "@/components/ui/cyber-checkbox";
import { KeyIcon, SearchIcon, ShieldCheckIcon } from "@/components/ui/icons";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { hasPermission } from "@/lib/permissions";
import { useAuth } from "@/context/auth-context";
import type { Permission, Role } from "@/lib/types";

export default function RolesPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, "roles", "write");

  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  // Create form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [createPerms, setCreatePerms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit form state
  const [editDesc, setEditDesc] = useState("");
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailMsg, setDetailMsg] = useState<string | null>(null);

  // Search filter
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([
        apiFetch<{ roles: Role[] }>("/roles"),
        apiFetch<{ permissions: Permission[] }>("/permissions"),
      ]);
      setRoles(r.roles || []);
      setPermissions(p.permissions || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const permsByResource = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of permissions) {
      const list = map.get(p.resource) || [];
      list.push(p);
      map.set(p.resource, list);
    }
    return map;
  }, [permissions]);

  function openRoleModal(role: Role) {
    setSelectedRole(role);
    setEditDesc(role.description || "");
    setEditPerms([...(role.permissions || [])]);
    setDetailMsg(null);
  }

  function togglePerm(key: string, list: string[], setList: (v: string[]) => void) {
    if (list.includes(key)) setList(list.filter((k) => k !== key));
    else setList([...list, key]);
  }

  function toggleAllForResource(resource: string, list: string[], setList: (v: string[]) => void) {
    const resPerms = permsByResource.get(resource) || [];
    const resKeys = resPerms.map((p) => p.key);
    const allSelected = resKeys.every((k) => list.includes(k));
    if (allSelected) {
      setList(list.filter((k) => !resKeys.includes(k)));
    } else {
      const combined = new Set([...list, ...resKeys]);
      setList(Array.from(combined));
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setFormError(null);
    setSaving(true);
    try {
      await apiFetch<Role>("/roles", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          permissions: createPerms,
        }),
      });
      setName("");
      setDescription("");
      setCreatePerms([]);
      setCreateOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveRole() {
    if (!selectedRole || !canWrite) return;
    setDetailBusy(true);
    setDetailMsg(null);
    try {
      await apiFetch<Role>(`/roles/${selectedRole.id}`, {
        method: "PATCH",
        body: JSON.stringify({ description: editDesc.trim() }),
      });
      const updated = await apiFetch<Role>(`/roles/${selectedRole.id}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions: editPerms }),
      });
      setSelectedRole(updated);
      setDetailMsg("Role saved successfully");
      await load();
    } catch (err) {
      setDetailMsg(err instanceof ApiRequestError ? err.message : "Save failed");
    } finally {
      setDetailBusy(false);
    }
  }

  async function deleteRole() {
    if (!selectedRole || !canWrite || selectedRole.is_system) return;
    if (!confirm(`Delete custom role ${selectedRole.name}?`)) return;
    setDetailBusy(true);
    try {
      await apiFetch(`/roles/${selectedRole.id}`, { method: "DELETE" });
      setSelectedRole(null);
      await load();
    } catch (err) {
      setDetailMsg(err instanceof ApiRequestError ? err.message : "Delete failed");
    } finally {
      setDetailBusy(false);
    }
  }

  const filteredRoles = roles.filter(
    (r) =>
      search === "" ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.description.toLowerCase().includes(search.toLowerCase()),
  );

  const systemCount = roles.filter((r) => r.is_system).length;
  const customCount = roles.length - systemCount;

  if (loading) return <LoadingBlock />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
            Role & Access Management
            <span className="rounded-full border border-sky-500/30 bg-sky-950/40 px-2.5 py-0.5 font-mono text-xs text-sky-400">
              {roles.length} Roles
            </span>
          </h1>
          <p className="mt-1 font-mono text-xs text-zinc-400">
            Define fine-grained SIEM authorization scopes and operator permissions
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 font-mono text-xs font-semibold text-black transition hover:bg-sky-400 shadow-[0_0_15px_rgba(0,163,255,0.3)]"
          >
            <span>+ Create Custom Role</span>
          </button>
        )}
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "TOTAL ROLES", value: roles.length, tone: "text-sky-400" },
          { label: "SYSTEM IMMUTABLE", value: systemCount, tone: "text-zinc-300" },
          { label: "CUSTOM ROLES", value: customCount, tone: "text-emerald-400" },
          { label: "PERMISSION SCOPES", value: permissions.length, tone: "text-sky-300" },
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
          placeholder="Filter roles by name, scope, or description..."
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950/70 py-2.5 pl-10 pr-4 font-mono text-xs text-zinc-200 placeholder-zinc-500 outline-none transition focus:border-sky-500"
        />
      </div>

      {/* Roles Grid */}
      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-4 font-mono text-xs text-rose-300">{error}</div>
      ) : filteredRoles.length === 0 ? (
        <EmptyState title="No roles match" description="Try refining your search keyword." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredRoles.map((role) => {
            const permCount = role.permissions?.length || 0;
            return (
              <div
                key={role.id}
                onClick={() => openRoleModal(role)}
                className="group relative cursor-pointer overflow-hidden rounded-2xl border border-zinc-800/80 bg-gradient-to-br from-[#0c1424]/90 to-[#060b16]/90 p-5 shadow-xl backdrop-blur-md transition-all hover:border-sky-500/40 hover:shadow-sky-500/5"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-950/40 text-sky-400">
                      <KeyIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-display text-base font-bold text-white group-hover:text-sky-300 transition">
                        {role.name}
                      </h3>
                      <p className="font-mono text-[10px] text-zinc-500">
                        {role.is_system ? "System Guard Role" : "Custom IAM Role"}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold ${
                      role.is_system
                        ? "border-zinc-700 bg-zinc-800 text-zinc-300"
                        : "border-sky-500/30 bg-sky-950/50 text-sky-400"
                    }`}
                  >
                    {role.is_system ? "SYSTEM" : "CUSTOM"}
                  </span>
                </div>

                <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                  {role.description || "No description provided."}
                </p>

                <div className="mt-4 flex items-center justify-between border-t border-zinc-800/60 pt-3">
                  <span className="font-mono text-[11px] text-zinc-400">
                    <span className="font-semibold text-white">{permCount}</span> permissions
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-sky-400 group-hover:underline">
                    Inspect & Edit →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Custom Role HUD Modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Custom Security Role"
        subtitle="Define name, purpose and attach fine-grained permissions"
        maxWidth="max-w-3xl"
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
              disabled={saving || !name.trim()}
              onClick={onCreate}
              className="rounded-lg bg-sky-500 px-4 py-1.5 font-mono text-xs font-semibold text-black hover:bg-sky-400 disabled:opacity-50 shadow-[0_0_12px_rgba(0,163,255,0.4)]"
            >
              {saving ? "Creating..." : "Save New Role"}
            </button>
          </div>
        }
      >
        <form onSubmit={onCreate} className="space-y-5 font-mono text-xs">
          {formError && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-rose-300">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="text-zinc-400 block mb-1">ROLE IDENTIFIER</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. THREAT_ANALYST"
                required
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="text-zinc-400 block mb-1">DESCRIPTION</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Purpose of this security role"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <span className="text-zinc-300 font-semibold uppercase tracking-wider">
                Permission Scope Matrix ({createPerms.length} selected)
              </span>
            </div>
            <div className="mt-3 space-y-4 max-h-[45vh] overflow-y-auto pr-1">
              {Array.from(permsByResource.entries()).map(([resource, perms]) => (
                <div key={resource} className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5">
                  <div className="flex items-center justify-between mb-2 pb-1 border-b border-zinc-800/60">
                    <span className="text-sky-400 font-bold uppercase">{resource}</span>
                    <button
                      type="button"
                      onClick={() => toggleAllForResource(resource, createPerms, setCreatePerms)}
                      className="text-[10px] text-zinc-500 hover:text-sky-300 underline"
                    >
                      Toggle All
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {perms.map((p) => (
                      <CyberCheckbox
                        key={p.key}
                        variant="pill"
                        title={p.key}
                        label={resource === "pages" ? p.description : p.action}
                        checked={createPerms.includes(p.key)}
                        onChange={() => togglePerm(p.key, createPerms, setCreatePerms)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      {/* Edit Role HUD Modal */}
      {selectedRole && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedRole(null)}
          title={`Role Scope: ${selectedRole.name}`}
          subtitle={selectedRole.is_system ? "Protected system policy (read-only system role)" : "Custom editable authorization role"}
          maxWidth="max-w-3xl"
          footer={
            <div className="flex w-full items-center justify-between">
              <div>
                {!selectedRole.is_system && canWrite && (
                  <button
                    type="button"
                    onClick={deleteRole}
                    disabled={detailBusy}
                    className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-1.5 font-mono text-xs text-rose-300 hover:bg-rose-900/40"
                  >
                    Delete Role
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRole(null)}
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-1.5 font-mono text-xs text-zinc-300 hover:text-white"
                >
                  Close
                </button>
                {!selectedRole.is_system && canWrite && (
                  <button
                    type="button"
                    disabled={detailBusy}
                    onClick={saveRole}
                    className="rounded-lg bg-sky-500 px-4 py-1.5 font-mono text-xs font-semibold text-black hover:bg-sky-400 shadow-[0_0_12px_rgba(0,163,255,0.4)]"
                  >
                    {detailBusy ? "Saving..." : "Save Changes"}
                  </button>
                )}
              </div>
            </div>
          }
        >
          <div className="space-y-4 font-mono text-xs">
            {detailMsg && (
              <div className="rounded-lg border border-sky-500/40 bg-sky-950/30 p-2.5 text-sky-300">
                {detailMsg}
              </div>
            )}

            <div>
              <label className="text-zinc-400 block mb-1">DESCRIPTION</label>
              <input
                type="text"
                value={editDesc}
                disabled={selectedRole.is_system || !canWrite}
                onChange={(e) => setEditDesc(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-zinc-100 outline-none focus:border-sky-500 disabled:opacity-60"
              />
            </div>

            <div>
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <span className="text-zinc-300 font-semibold uppercase tracking-wider">
                  Attached Permissions ({editPerms.length})
                </span>
              </div>
              <div className="mt-3 space-y-4 max-h-[45vh] overflow-y-auto pr-1">
                {Array.from(permsByResource.entries()).map(([resource, perms]) => (
                  <div key={resource} className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5">
                    <div className="flex items-center justify-between mb-2 pb-1 border-b border-zinc-800/60">
                      <span className="text-sky-400 font-bold uppercase">{resource}</span>
                      {!selectedRole.is_system && canWrite && (
                        <button
                          type="button"
                          onClick={() => toggleAllForResource(resource, editPerms, setEditPerms)}
                          className="text-[10px] text-zinc-500 hover:text-sky-300 underline"
                        >
                          Toggle All
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {perms.map((p) => (
                        <CyberCheckbox
                          key={p.key}
                          variant="pill"
                          title={p.key}
                          disabled={selectedRole.is_system || !canWrite}
                          label={resource === "pages" ? p.description : p.action}
                          checked={editPerms.includes(p.key)}
                          onChange={() => togglePerm(p.key, editPerms, setEditPerms)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
