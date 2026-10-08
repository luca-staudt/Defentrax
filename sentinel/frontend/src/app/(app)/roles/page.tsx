"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingBlock } from "@/components/ui/loading-block";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/context/auth-context";
import {
  PAGE_GRANTS,
  capabilityRows,
  grantIsOpen,
  grantNeedsView,
  pageSummary,
  roleIsFullAccess,
  sameKeys,
  setCapability,
  setChildOpen,
  setPageOpen,
} from "@/lib/access";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { invalidateQueries } from "@/lib/panel/cache";
import { useQuery } from "@/lib/panel/use-query";
import { hasPermission, roleDisplayName } from "@/lib/permissions";
import type { Permission, Role, User } from "@/lib/types";

const EMPTY_PERMISSIONS: Permission[] = [];
const EMPTY_ROLES: Role[] = [];
const EMPTY_USERS: User[] = [];

export default function RolesPage() {
  const { user } = useAuth();
  const canWrite = hasPermission(user, "roles", "write");
  const canAssign = hasPermission(user, "users", "write");
  const canReadUsers = hasPermission(user, "users", "read");

  const rolesQuery = useQuery("roles", async () => (await apiFetch<{ roles: Role[] }>("/roles")).roles || EMPTY_ROLES);
  const permissionsQuery = useQuery(
    "permissions",
    async () => (await apiFetch<{ permissions: Permission[] }>("/permissions")).permissions || EMPTY_PERMISSIONS,
  );
  const usersQuery = useQuery(
    canReadUsers ? "users" : null,
    async () => (await apiFetch<{ users: User[] }>("/users")).users || EMPTY_USERS,
  );

  const roles = rolesQuery.data ?? EMPTY_ROLES;
  const permissions = permissionsQuery.data ?? EMPTY_PERMISSIONS;
  const users = usersQuery.data ?? EMPTY_USERS;
  const rows = useMemo(() => capabilityRows(permissions), [permissions]);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memberId, setMemberId] = useState("");

  const visible = roles.filter((role) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return role.name.toLowerCase().includes(q) || role.description.toLowerCase().includes(q);
  });
  const selected = roles.find((role) => role.id === (selectedId ?? roles[0]?.id)) ?? null;
  const locked = selected ? roleIsFullAccess(selected.name) : false;
  const dirty =
    !!selected &&
    !locked &&
    (description.trim() !== (selected.description || "") || !sameKeys(draft, selected.permissions || []));

  const openRoleId = selected?.id ?? "";
  useEffect(() => {
    if (!selected) return;
    setDraft([...(selected.permissions || [])]);
    setDescription(selected.description || "");
    setError(null);
    setMemberId("");
    // Load this role's saved access when the selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openRoleId]);

  const members = selected ? users.filter((person) => person.roles?.includes(selected.name)) : [];
  const outsiders = selected ? users.filter((person) => !person.roles?.includes(selected.name)) : [];

  async function reload() {
    await Promise.all([rolesQuery.reload(), usersQuery.reload()]);
    invalidateQueries(["roles", "users"]);
  }

  async function save() {
    if (!selected || !canWrite || locked || !dirty) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      if (description.trim() !== (selected.description || "")) {
        await apiFetch(`/roles/${selected.id}`, {
          method: "PATCH",
          body: JSON.stringify({ description: description.trim() }),
        });
      }
      const updated = await apiFetch<Role>(`/roles/${selected.id}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissions: draft }),
      });
      setDraft([...(updated.permissions || [])]);
      setMessage("Saved. People with this role see the change on their next request.");
      await reload();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not save this role");
    } finally {
      setBusy(false);
    }
  }

  async function createRole(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) return;
    setBusy(true);
    setError(null);
    try {
      const template = roles.find((role) => role.id === templateId);
      const created = await apiFetch<Role>("/roles", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          description: createDescription.trim(),
          permissions: template?.permissions || [],
        }),
      });
      setCreating(false);
      setName("");
      setCreateDescription("");
      setTemplateId("");
      setSelectedId(created.id);
      setMessage(`Created ${roleDisplayName(created.name)}.`);
      await reload();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not create the role");
    } finally {
      setBusy(false);
    }
  }

  async function removeRole() {
    if (!selected || !canWrite || selected.is_system) return;
    if (members.length > 0) {
      setError("Move every person off this role before deleting it.");
      return;
    }
    if (!window.confirm(`Delete ${roleDisplayName(selected.name)}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/roles/${selected.id}`, { method: "DELETE" });
      setSelectedId(null);
      setMessage("Role deleted.");
      await reload();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not delete the role");
    } finally {
      setBusy(false);
    }
  }

  async function addMember() {
    if (!selected || !canAssign || !memberId) return;
    const person = users.find((item) => item.id === memberId);
    if (!person) return;
    setBusy(true);
    setError(null);
    try {
      const next = [...(person.roles || []), selected.name];
      await apiFetch(`/users/${person.id}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roles: next }),
      });
      setMemberId("");
      setMessage(`${person.display_name || person.email} now has ${roleDisplayName(selected.name)}.`);
      await reload();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not assign the role");
    } finally {
      setBusy(false);
    }
  }

  async function removeMember(person: User) {
    if (!selected || !canAssign) return;
    const next = (person.roles || []).filter((role) => role !== selected.name);
    if (next.length === 0) {
      setError("Give them another role first. An operator cannot have zero roles.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/users/${person.id}/roles`, {
        method: "PUT",
        body: JSON.stringify({ roles: next }),
      });
      setMessage(`${person.display_name || person.email} no longer has ${roleDisplayName(selected.name)}.`);
      await reload();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Could not remove the role");
    } finally {
      setBusy(false);
    }
  }

  if (rolesQuery.loading || permissionsQuery.loading) return <LoadingBlock label="Loading access..." />;

  return (
    <>
      <PageHeader
        title="Access"
        subtitle="Choose a role, decide which pages it opens, then put people on it."
        actions={
          canWrite ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreating((open) => !open)}>
              {creating ? "Close" : "New role"}
            </button>
          ) : null
        }
      />

      {rolesQuery.error || permissionsQuery.error ? (
        <div className="alert alert-danger">{rolesQuery.error || permissionsQuery.error}</div>
      ) : null}
      {error ? <div className="alert alert-danger">{error}</div> : null}
      {message ? <div className="alert alert-success">{message}</div> : null}

      {creating && canWrite ? (
        <div className="card">
          <div className="card-body">
            <form className="row g-3" onSubmit={(event) => void createRole(event)}>
              <div className="col-md-4">
                <label className="form-label">Name</label>
                <input className="form-control" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Shift lead" />
              </div>
              <div className="col-md-4">
                <label className="form-label">Start from</label>
                <select className="form-select" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                  <option value="">Empty</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {roleDisplayName(role.name)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-md-4">
                <label className="form-label">Description</label>
                <input className="form-control" value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} />
              </div>
              <div className="col-12 text-end">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? "Creating…" : "Create role"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="row">
        <div className="col-xl-3">
          <div className="card">
            <div className="card-body">
              <input className="form-control mb-3" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a role" />
              {visible.length === 0 ? (
                <EmptyState title="No roles" description="Nothing matches that search." />
              ) : (
                <div className="d-flex flex-column gap-2">
                  {visible.map((role) => {
                    const active = selected?.id === role.id;
                    const count = users.filter((person) => person.roles?.includes(role.name)).length;
                    return (
                      <button
                        key={role.id}
                        type="button"
                        className={`dx-role-pick ${active ? "is-on" : ""}`}
                        onClick={() => setSelectedId(role.id)}
                      >
                        <span className="flex-grow-1 text-start">
                          <span className="d-block fw-medium">{roleDisplayName(role.name)}</span>
                          <span className="d-block text-muted fs-12">
                            {pageSummary(role)}
                            {canReadUsers ? ` · ${count} ${count === 1 ? "person" : "people"}` : ""}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-xl-9">
          {!selected ? (
            <EmptyState title="No role selected" description="Create a role to start granting pages." />
          ) : (
            <>
              <div className="card">
                <div className="card-body">
                  <div className="d-flex flex-wrap justify-content-between gap-2 mb-3">
                    <div>
                      <h4 className="mb-1">{roleDisplayName(selected.name)}</h4>
                      <div className="text-muted fs-12">{selected.name}</div>
                    </div>
                    <div className="d-flex gap-2">
                      {selected.is_system ? <span className="badge bg-secondary-subtle text-secondary">Built-in</span> : <span className="badge bg-primary-subtle text-primary">Custom</span>}
                    </div>
                  </div>
                  {locked ? (
                    <div className="alert alert-primary mb-0">
                      This role opens every page and can change every record. The panel does not consult a permission list for it.
                    </div>
                  ) : (
                    <>
                      <label className="form-label">What this role is for</label>
                      <textarea
                        className="form-control"
                        rows={2}
                        value={description}
                        disabled={!canWrite || busy}
                        onChange={(event) => setDescription(event.target.value)}
                      />
                    </>
                  )}
                </div>
              </div>

              {locked ? null : (
                <>
                  <div className="card">
                    <div className="card-header">
                      <h4 className="card-title mb-0">Pages</h4>
                    </div>
                    <div className="card-body">
                      <p className="text-muted">Turning a page on also grants the view right that page needs to load.</p>
                      <div className="row g-3">
                        {PAGE_GRANTS.map((grant) => {
                          const open = grantIsOpen(draft, grant);
                          const childOn = grant.child ? draft.includes(`pages:${grant.child.page}`) : false;
                          return (
                            <div className="col-md-6" key={grant.id}>
                              <div className={`dx-page-grant ${open ? "is-on" : ""}`}>
                                <div className="form-check form-switch">
                                  <input
                                    className="form-check-input"
                                    type="checkbox"
                                    role="switch"
                                    id={`page-${grant.id}`}
                                    checked={open}
                                    disabled={!canWrite || busy}
                                    onChange={(event) => setDraft(setPageOpen(draft, grant, event.target.checked))}
                                  />
                                  <label className="form-check-label fw-medium" htmlFor={`page-${grant.id}`}>
                                    {grant.label}
                                  </label>
                                </div>
                                <p className="text-muted fs-12 mb-0">{grant.hint}</p>
                                {grantNeedsView(draft, grant) ? (
                                  <p className="text-warning fs-12 mb-0 mt-2">View access is off, so this page stays closed.</p>
                                ) : null}
                                {grant.child && open ? (
                                  <div className="form-check form-switch mt-3 mb-0">
                                    <input
                                      className="form-check-input"
                                      type="checkbox"
                                      role="switch"
                                      id={`page-${grant.id}-child`}
                                      checked={childOn}
                                      disabled={!canWrite || busy}
                                      onChange={(event) => setDraft(setChildOpen(draft, grant, event.target.checked))}
                                    />
                                    <label className="form-check-label" htmlFor={`page-${grant.id}-child`}>
                                      {grant.child.label}
                                    </label>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-header">
                      <h4 className="card-title mb-0">What they can change</h4>
                    </div>
                    <div className="card-body">
                      <div className="table-responsive">
                        <table className="table align-middle mb-0">
                          <thead className="table-light">
                            <tr>
                              <th>Area</th>
                              <th>Rights</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row) => (
                              <tr key={row.resource}>
                                <td className="fw-medium">{row.label}</td>
                                <td>
                                  <div className="d-flex flex-wrap gap-3">
                                    {row.actions.map((action) => (
                                      <div className="form-check form-switch mb-0" key={action.key}>
                                        <input
                                          className="form-check-input"
                                          type="checkbox"
                                          role="switch"
                                          id={action.key}
                                          checked={draft.includes(action.key)}
                                          disabled={!canWrite || busy}
                                          onChange={(event) => setDraft(setCapability(draft, row.resource, action.action, event.target.checked))}
                                        />
                                        <label className="form-check-label" htmlFor={action.key}>
                                          {action.label}
                                        </label>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="card">
                <div className="card-header d-flex align-items-center">
                  <h4 className="card-title mb-0 flex-grow-1">People</h4>
                  <Link href="/users" className="btn btn-sm btn-light">
                    Team
                  </Link>
                </div>
                <div className="card-body">
                  {!canReadUsers ? (
                    <p className="text-muted mb-0">You can edit this role, but you cannot see who has it.</p>
                  ) : (
                    <>
                      {canAssign ? (
                        <div className="row g-2 mb-3">
                          <div className="col">
                            <select className="form-select" value={memberId} onChange={(event) => setMemberId(event.target.value)} disabled={busy}>
                              <option value="">Add a person…</option>
                              {outsiders.map((person) => (
                                <option key={person.id} value={person.id}>
                                  {person.display_name || person.email}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-auto">
                            <button type="button" className="btn btn-primary" disabled={!memberId || busy} onClick={() => void addMember()}>
                              Assign
                            </button>
                          </div>
                        </div>
                      ) : null}
                      {members.length === 0 ? (
                        <p className="text-muted mb-0">Nobody has this role.</p>
                      ) : (
                        <ul className="list-group">
                          {members.map((person) => (
                            <li key={person.id} className="list-group-item d-flex justify-content-between align-items-center">
                              <span>
                                <span className="fw-medium">{person.display_name || person.email}</span>
                                <span className="d-block text-muted fs-12">{person.email}</span>
                              </span>
                              {canAssign ? (
                                <button type="button" className="btn btn-sm btn-light" disabled={busy} onClick={() => void removeMember(person)}>
                                  Remove
                                </button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="d-flex justify-content-between mb-4">
                {!selected.is_system && canWrite ? (
                  <button type="button" className="btn btn-danger" disabled={busy} onClick={() => void removeRole()}>
                    Delete role
                  </button>
                ) : (
                  <span />
                )}
                {!locked && canWrite ? (
                  <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={() => void save()}>
                    {busy ? "Saving…" : "Save access"}
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
