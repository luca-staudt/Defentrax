"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { hasPermission, roleDisplayName } from "@/lib/permissions";
import { useAuth } from "@/context/auth-context";
import type { Permission, Role } from "@/lib/types";

const inputClass =
  "w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-brand-500/60";
const btnPrimary =
  "rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-black hover:bg-brand-400 disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-brand-500/50";
const btnDanger =
  "rounded-lg border border-red-800/60 px-3 py-1.5 text-xs text-red-300 hover:border-red-500/60";

export default function RolesPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, "roles", "write");

  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [createPerms, setCreatePerms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Role | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailMsg, setDetailMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([
        apiFetch<{ roles: Role[] }>("/roles"),
        apiFetch<{ permissions: Permission[] }>("/permissions"),
      ]);
      setRoles(r.roles || []);
      setPermissions(p.permissions || []);
      setError(null);
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
    const m = new Map<string, Permission[]>();
    for (const p of permissions) {
      const list = m.get(p.resource) || [];
      list.push(p);
      m.set(p.resource, list);
    }
    return m;
  }, [permissions]);

  function openRole(role: Role) {
    setSelected(role);
    setEditDesc(role.description || "");
    setEditPerms([...(role.permissions || [])]);
    setDetailMsg(null);
  }

  function togglePerm(list: string[], key: string, set: (v: string[]) => void) {
    if (list.includes(key)) set(list.filter((k) => k !== key));
    else set([...list, key]);
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
      await load();
    } catch (err) {
      setFormError(
        err instanceof ApiRequestError ? err.message : "Create failed",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveRole() {
    if (!selected || !canWrite) return;
    setDetailBusy(true);
    setDetailMsg(null);
    try {
      await apiFetch<Role>(`/roles/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({ description: editDesc.trim() }),
      });
      const updated = await apiFetch<Role>(`/roles/${selected.id}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions: editPerms }),
      });
      setSelected(updated);
      setDetailMsg("Role saved");
      await load();
    } catch (err) {
      setDetailMsg(
        err instanceof ApiRequestError ? err.message : "Save failed",
      );
    } finally {
      setDetailBusy(false);
    }
  }

  async function deleteRole() {
    if (!selected || !canWrite || selected.is_system) return;
    if (!window.confirm(`Delete custom role ${selected.name}?`)) return;
    setDetailBusy(true);
    try {
      await apiFetch(`/roles/${selected.id}`, { method: "DELETE" });
      setSelected(null);
      await load();
    } catch (err) {
      setDetailMsg(
        err instanceof ApiRequestError ? err.message : "Delete failed",
      );
    } finally {
      setDetailBusy(false);
    }
  }

  if (loading) return <LoadingBlock />;
  if (error) return <EmptyState title="Cannot load roles" description={error} />;

  function PermGrid({
    selectedKeys,
    onToggle,
  }: {
    selectedKeys: string[];
    onToggle: (key: string) => void;
  }) {
    return (
      <div className="space-y-3">
        {[...permsByResource.entries()].map(([resource, perms]) => (
          <div key={resource}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {resource}
            </p>
            <div className="flex flex-wrap gap-2">
              {perms.map((p) => (
                <label
                  key={p.key}
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-300"
                  title={p.description}
                >
                  <input
                    type="checkbox"
                    checked={selectedKeys.includes(p.key)}
                    onChange={() => onToggle(p.key)}
                  />
                  {p.action}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl font-semibold text-white">
          Roles & permissions
        </h1>
        <p className="text-sm text-zinc-500">
          Built-in roles plus custom roles with selectable permission sets.
          Keys use <code className="text-brand-200">resource:action</code>{" "}
          (server-enforced).
        </p>
      </header>

      {canWrite ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Create custom role
          </h2>
          <form className="space-y-4" onSubmit={onCreate}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-xs text-zinc-500">
                Name
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. SOC_LEAD"
                  className={`${inputClass} mt-1`}
                />
              </label>
              <label className="block text-xs text-zinc-500">
                Description
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`${inputClass} mt-1`}
                />
              </label>
            </div>
            <PermGrid
              selectedKeys={createPerms}
              onToggle={(key) =>
                togglePerm(createPerms, key, setCreatePerms)
              }
            />
            {formError ? (
              <p className="text-sm text-red-400">{formError}</p>
            ) : null}
            <button type="submit" disabled={saving} className={btnPrimary}>
              {saving ? "Creating…" : "Create role"}
            </button>
          </form>
        </section>
      ) : null}

      {roles.length === 0 ? (
        <EmptyState title="No roles" description="Roles will appear after migrate." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-zinc-900/80 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Permissions</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {roles.map((role) => (
                <tr key={role.id} className="hover:bg-zinc-900/40">
                  <td className="px-4 py-3">
                    <div className="text-zinc-100">
                      {roleDisplayName(role.name)}
                    </div>
                    <div className="font-mono text-xs text-zinc-600">
                      {role.name}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {role.description || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {role.is_system ? "System" : "Custom"}
                  </td>
                  <td className="max-w-md px-4 py-3 text-xs text-zinc-500">
                    {(role.permissions || []).length} granted
                    <div className="mt-1 line-clamp-2 font-mono text-[10px] text-zinc-600">
                      {(role.permissions || []).join(", ") || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className={btnGhost}
                      onClick={() => openRole(role)}
                    >
                      {canWrite ? "Edit" : "View"}
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
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-white">
                  {roleDisplayName(selected.name)}
                </h2>
                <p className="font-mono text-xs text-zinc-500">{selected.name}</p>
              </div>
              <button
                type="button"
                className={btnGhost}
                onClick={() => setSelected(null)}
              >
                Close
              </button>
            </div>

            <label className="mb-4 block text-xs text-zinc-500">
              Description
              <input
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                disabled={!canWrite}
                className={`${inputClass} mt-1`}
              />
            </label>

            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Permissions
            </p>
            {canWrite ? (
              <PermGrid
                selectedKeys={editPerms}
                onToggle={(key) => togglePerm(editPerms, key, setEditPerms)}
              />
            ) : (
              <p className="font-mono text-xs text-zinc-400">
                {(selected.permissions || []).join(", ") || "None"}
              </p>
            )}

            {canWrite ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={detailBusy}
                  className={btnPrimary}
                  onClick={() => void saveRole()}
                >
                  Save
                </button>
                {!selected.is_system ? (
                  <button
                    type="button"
                    disabled={detailBusy}
                    className={btnDanger}
                    onClick={() => void deleteRole()}
                  >
                    Delete role
                  </button>
                ) : (
                  <p className="self-center text-xs text-zinc-600">
                    System roles cannot be deleted (permissions editable).
                  </p>
                )}
              </div>
            ) : null}

            {detailMsg ? (
              <p className="mt-4 text-sm text-brand-200">{detailMsg}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
