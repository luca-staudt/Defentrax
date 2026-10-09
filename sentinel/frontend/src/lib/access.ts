import type { Permission, Role } from "@/lib/types";

export type PageGrant = {
  id: string;
  label: string;
  hint: string;
  page: string;
  requires?: readonly [string, string];
  child?: { page: string; label: string; hint: string };
};

/** Screens an operator can be allowed to open. Detail routes sit under their parent. */
export const PAGE_GRANTS: PageGrant[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    hint: "Security overview and live counts.",
    page: "dashboard",
    requires: ["alerts", "read"],
  },
  {
    id: "alerts",
    label: "Alerts",
    hint: "The detection queue.",
    page: "alerts",
    requires: ["alerts", "read"],
    child: { page: "alert_detail", label: "Open one alert", hint: "The full record and status changes." },
  },
  {
    id: "events",
    label: "Events",
    hint: "Ingested telemetry.",
    page: "events",
    requires: ["events", "read"],
  },
  {
    id: "servers",
    label: "Servers",
    hint: "Hosts and agents.",
    page: "servers",
    requires: ["servers", "read"],
    child: { page: "server_detail", label: "Open one server", hint: "Enrollment tokens and heartbeats." },
  },
  {
    id: "rules",
    label: "Rules",
    hint: "Detection rules.",
    page: "rules",
    requires: ["rules", "read"],
  },
  {
    id: "notifications",
    label: "Notifications",
    hint: "Where alerts are sent.",
    page: "notifications",
    requires: ["notifications", "read"],
  },
  {
    id: "team",
    label: "Team",
    hint: "Operators and their roles.",
    page: "team",
    requires: ["users", "read"],
  },
  {
    id: "roles",
    label: "Roles",
    hint: "This access screen.",
    page: "roles",
    requires: ["roles", "read"],
  },
  {
    id: "audit",
    label: "Audit log",
    hint: "Who changed what.",
    page: "audit",
    requires: ["audit_logs", "read"],
  },
  {
    id: "interventions",
    label: "Interventions",
    hint: "Opt-in host block / kill / firewall actions.",
    page: "interventions",
    requires: ["intervention", "read"],
  },
  {
    id: "ai",
    label: "AI analysis",
    hint: "Optional OpenAI-compatible assessments.",
    page: "ai",
    requires: ["ai", "read"],
  },
];

const RESOURCE_LABELS: Record<string, string> = {
  alerts: "Alerts",
  events: "Events",
  servers: "Servers",
  rules: "Detection rules",
  notifications: "Notifications",
  users: "Team",
  roles: "Roles",
  audit_logs: "Audit log",
  api_keys: "API keys",
  intervention: "Interventions",
  ai: "AI analysis",
};

const ACTION_LABELS: Record<string, string> = {
  read: "View",
  write: "Change",
  approve: "Approve",
};

export function permKey(resource: string, action: string) {
  return `${resource}:${action}`;
}

export function roleIsFullAccess(name: string) {
  return name === "ADMIN" || name === "SUPER_ADMIN";
}

export function pageKeys(grant: PageGrant): string[] {
  const keys = [permKey("pages", grant.page)];
  if (grant.child) keys.push(permKey("pages", grant.child.page));
  return keys;
}

export function grantIsOpen(keys: string[], grant: PageGrant) {
  return keys.includes(permKey("pages", grant.page));
}

export function grantNeedsView(keys: string[], grant: PageGrant) {
  if (!grant.requires || !grantIsOpen(keys, grant)) return false;
  return !keys.includes(permKey(grant.requires[0], grant.requires[1]));
}

function stillNeeds(keys: Set<string>, resource: string, action: string, exceptId: string) {
  return PAGE_GRANTS.some((grant) => {
    if (grant.id === exceptId || !grant.requires) return false;
    if (grant.requires[0] !== resource || grant.requires[1] !== action) return false;
    return keys.has(permKey("pages", grant.page));
  });
}

export function setPageOpen(keys: string[], grant: PageGrant, open: boolean): string[] {
  const next = new Set(keys);
  if (open) {
    next.add(permKey("pages", grant.page));
    if (grant.requires) next.add(permKey(grant.requires[0], grant.requires[1]));
    return [...next];
  }
  next.delete(permKey("pages", grant.page));
  if (grant.child) next.delete(permKey("pages", grant.child.page));
  if (grant.requires && !stillNeeds(next, grant.requires[0], grant.requires[1], grant.id)) {
    next.delete(permKey(grant.requires[0], grant.requires[1]));
  }
  return [...next];
}

export function setChildOpen(keys: string[], grant: PageGrant, open: boolean): string[] {
  if (!grant.child) return keys;
  const next = new Set(keys);
  const child = permKey("pages", grant.child.page);
  if (open) {
    next.add(permKey("pages", grant.page));
    next.add(child);
    if (grant.requires) next.add(permKey(grant.requires[0], grant.requires[1]));
  } else {
    next.delete(child);
  }
  return [...next];
}

export function setCapability(keys: string[], resource: string, action: string, on: boolean): string[] {
  const next = new Set(keys);
  const id = permKey(resource, action);
  if (on) next.add(id);
  else next.delete(id);
  return [...next];
}

export type CapabilityRow = {
  resource: string;
  label: string;
  actions: { action: string; label: string; key: string }[];
};

export function capabilityRows(permissions: Permission[]): CapabilityRow[] {
  const grouped = new Map<string, Permission[]>();
  for (const permission of permissions) {
    if (permission.resource === "pages") continue;
    const list = grouped.get(permission.resource) || [];
    list.push(permission);
    grouped.set(permission.resource, list);
  }
  return [...grouped.entries()].map(([resource, list]) => ({
    resource,
    label: RESOURCE_LABELS[resource] || resource.replace(/_/g, " "),
    actions: list
      .slice()
      .sort((a, b) => a.action.localeCompare(b.action))
      .map((permission) => ({
        action: permission.action,
        label: ACTION_LABELS[permission.action] || permission.action,
        key: permission.key,
      })),
  }));
}

export function sameKeys(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  const right = new Set(b);
  return a.every((key) => right.has(key));
}

export function pageSummary(role: Role) {
  const keys = role.permissions || [];
  const open = PAGE_GRANTS.filter((grant) => grantIsOpen(keys, grant)).map((grant) => grant.label);
  if (roleIsFullAccess(role.name)) return "Every page";
  if (open.length === 0) return "No pages";
  if (open.length <= 3) return open.join(", ");
  return `${open.slice(0, 2).join(", ")} +${open.length - 2}`;
}
