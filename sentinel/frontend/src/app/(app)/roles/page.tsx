"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { CyberCheckbox } from "@/components/ui/cyber-checkbox";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { useQuery } from "@/lib/panel/use-query";
import { hasPermission } from "@/lib/permissions";
import { useAuth } from "@/context/auth-context";
import type { Permission, Role } from "@/lib/types";

const EMPTY_PERMISSIONS: Permission[] = [];

export default function RolesPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, "roles", "write");

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [createPerms, setCreatePerms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailMsg, setDetailMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const rolesQuery = useQuery("roles", async () => (await apiFetch<{ roles: Role[] }>("/roles")).roles || []);
  const permissionsQuery = useQuery(
    "permissions",
    async () => (await apiFetch<{ permissions: Permission[] }>("/permissions")).permissions || [],
  );
  const roles = rolesQuery.data ?? [];
  const permissions = permissionsQuery.data ?? EMPTY_PERMISSIONS;
  const loading = rolesQuery.loading || permissionsQuery.loading;
  const loadError = rolesQuery.error || permissionsQuery.error;
  const load = useCallback(async () => {
    await Promise.all([rolesQuery.reload(), permissionsQuery.reload()]);
  }, [rolesQuery, permissionsQuery]);

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
    if (allSelected) setList(list.filter((k) => !resKeys.includes(k)));
    else setList(Array.from(new Set([...list, ...resKeys])));
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
    (r) => search === "" || r.name.toLowerCase().includes(search.toLowerCase()) || r.description.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) return <LoadingBlock />;

  return (
    <>
      <PageHeader
        title="Roles"
        subtitle="Page access and data permissions"
        actions={
          canWrite ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              Create role
            </button>
          ) : null
        }
      />

      <div className="card">
        <div className="card-body">
          <input className="form-control" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search roles" />
        </div>
      </div>

      {loadError ? <div className="alert alert-danger">{loadError}</div> : null}
      {filteredRoles.length === 0 ? (
        <EmptyState title="No roles" description="No roles match this search." />
      ) : (
        <div className="row">
          {filteredRoles.map((role) => (
            <div className="col-md-6 col-xl-4" key={role.id}>
              <div className="card">
                <div className="card-body">
                  <div className="d-flex justify-content-between">
                    <h5 className="mb-1">{role.name}</h5>
                    {role.is_system ? <span className="badge bg-secondary-subtle text-secondary">System</span> : <span className="badge bg-primary-subtle text-primary">Custom</span>}
                  </div>
                  <p className="text-muted">{role.description || "No description"}</p>
                  <p className="text-muted fs-12">{role.permissions?.length || 0} permissions</p>
                  <button type="button" className="btn btn-sm btn-light" onClick={() => openRoleModal(role)}>
                    {canWrite ? "Edit" : "View"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Create role">
        <form onSubmit={(e) => void onCreate(e)}>
          <div className="mb-3">
            <label className="form-label">Name</label>
            <input required className="form-control" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="mb-3">
            <label className="form-label">Description</label>
            <textarea className="form-control" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <PermissionPicker
            permsByResource={permsByResource}
            selected={createPerms}
            onToggle={(key) => togglePerm(key, createPerms, setCreatePerms)}
            onToggleResource={(resource) => toggleAllForResource(resource, createPerms, setCreatePerms)}
          />
          {formError ? <div className="alert alert-danger">{formError}</div> : null}
          <div className="text-end mt-3">
            <button type="button" className="btn btn-light me-2" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Create"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!selectedRole} onClose={() => setSelectedRole(null)} title={selectedRole?.name || "Role"}>
        {selectedRole ? (
          <>
            {detailMsg ? <div className="alert alert-info">{detailMsg}</div> : null}
            <div className="mb-3">
              <label className="form-label">Description</label>
              <textarea className="form-control" rows={2} value={editDesc} disabled={selectedRole.is_system || !canWrite} onChange={(e) => setEditDesc(e.target.value)} />
            </div>
            <PermissionPicker
              permsByResource={permsByResource}
              selected={editPerms}
              disabled={selectedRole.is_system || !canWrite}
              onToggle={(key) => togglePerm(key, editPerms, setEditPerms)}
              onToggleResource={(resource) => toggleAllForResource(resource, editPerms, setEditPerms)}
            />
            <div className="d-flex justify-content-between mt-3">
              {!selectedRole.is_system && canWrite ? (
                <button type="button" className="btn btn-danger" disabled={detailBusy} onClick={() => void deleteRole()}>
                  Delete
                </button>
              ) : (
                <span />
              )}
              {canWrite && !selectedRole.is_system ? (
                <button type="button" className="btn btn-primary" disabled={detailBusy} onClick={() => void saveRole()}>
                  Save
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </Modal>
    </>
  );
}

function PermissionPicker({
  permsByResource,
  selected,
  disabled,
  onToggle,
  onToggleResource,
}: {
  permsByResource: Map<string, Permission[]>;
  selected: string[];
  disabled?: boolean;
  onToggle: (key: string) => void;
  onToggleResource: (resource: string) => void;
}) {
  return (
    <div>
      {Array.from(permsByResource.entries()).map(([resource, perms]) => (
        <div key={resource} className="mb-3">
          <div className="d-flex justify-content-between align-items-center">
            <h6 className="mb-2 text-uppercase">{resource}</h6>
            <button type="button" className="btn btn-sm btn-link" disabled={disabled} onClick={() => onToggleResource(resource)}>
              Toggle all
            </button>
          </div>
          {perms.map((p) => (
            <CyberCheckbox
              key={p.key}
              variant="pill"
              title={p.key}
              disabled={disabled}
              label={resource === "pages" ? p.description : p.action}
              checked={selected.includes(p.key)}
              onChange={() => onToggle(p.key)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
