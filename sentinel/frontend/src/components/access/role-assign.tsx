"use client";

import { roleDisplayName } from "@/lib/permissions";
import { pageSummary, roleIsFullAccess } from "@/lib/access";
import type { Role } from "@/lib/types";

export function RoleAssignList({
  roles,
  selected,
  disabled,
  onChange,
}: {
  roles: Role[];
  selected: string[];
  disabled?: boolean;
  onChange: (next: string[]) => void;
}) {
  function toggle(name: string) {
    if (disabled) return;
    if (selected.includes(name)) {
      if (selected.length === 1) return;
      onChange(selected.filter((role) => role !== name));
      return;
    }
    onChange([...selected, name]);
  }

  return (
    <div className="d-flex flex-column gap-2">
      {roles.map((role) => {
        const on = selected.includes(role.name);
        return (
          <button
            key={role.id}
            type="button"
            disabled={disabled}
            className={`dx-role-pick ${on ? "is-on" : ""}`}
            onClick={() => toggle(role.name)}
          >
            <input className="form-check-input" type="checkbox" checked={on} readOnly tabIndex={-1} aria-hidden />
            <span className="flex-grow-1 text-start">
              <span className="d-flex align-items-center gap-2">
                <span className="fw-medium">{roleDisplayName(role.name)}</span>
                {role.is_system ? <span className="badge bg-secondary-subtle text-secondary">Built-in</span> : null}
                {roleIsFullAccess(role.name) ? <span className="badge bg-primary-subtle text-primary">Full access</span> : null}
              </span>
              <span className="d-block text-muted fs-12">{role.description || pageSummary(role)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
