import { hasPermission } from "@/lib/permissions";

type PageUser = { permissions?: string[]; roles?: string[] } | null | undefined;

/** One panel route. Permission key is `pages:<action>`. */
export type PanelPage = {
  action: string;
  label: string;
  /** Present for sidebar entries. Detail routes are gated but not listed. */
  href?: string;
  nav: boolean;
};

/**
 * Every authenticated panel route. Order is the sidebar order and the
 * fallback order when the current page is forbidden.
 */
export const PANEL_PAGES: PanelPage[] = [
  { action: "dashboard", label: "Dashboard", href: "/dashboard", nav: true },
  { action: "alerts", label: "Alerts", href: "/alerts", nav: true },
  { action: "alert_detail", label: "Alert detail", nav: false },
  { action: "events", label: "Events", href: "/events", nav: true },
  { action: "servers", label: "Servers", href: "/servers", nav: true },
  { action: "server_detail", label: "Server detail", nav: false },
  { action: "rules", label: "Rules", href: "/rules", nav: true },
  { action: "notifications", label: "Notifications", href: "/notifications", nav: true },
  { action: "team", label: "Team", href: "/users", nav: true },
  { action: "roles", label: "Roles", href: "/roles", nav: true },
  { action: "audit", label: "Audit logs", href: "/audit", nav: true },
];

function byAction(action: string): PanelPage {
  const page = PANEL_PAGES.find((p) => p.action === action);
  if (!page) throw new Error(`unknown panel page ${action}`);
  return page;
}

/** Map a pathname (no query string) to the page permission that guards it. */
export function pageForPathname(pathname: string): PanelPage | null {
  if (pathname.startsWith("/alerts/") && pathname !== "/alerts") {
    return byAction("alert_detail");
  }
  if (pathname === "/alerts") return byAction("alerts");
  if (pathname.startsWith("/servers/") && pathname !== "/servers") {
    return byAction("server_detail");
  }
  if (pathname === "/servers") return byAction("servers");
  return PANEL_PAGES.find((p) => p.href === pathname) ?? null;
}

/** Read permission that must also be granted before the page can load its data. */
const PAGE_READ: Record<string, readonly [string, string]> = {
  dashboard: ["alerts", "read"],
  alerts: ["alerts", "read"],
  alert_detail: ["alerts", "read"],
  events: ["events", "read"],
  servers: ["servers", "read"],
  server_detail: ["servers", "read"],
  rules: ["rules", "read"],
  notifications: ["notifications", "read"],
  team: ["users", "read"],
  roles: ["roles", "read"],
  audit: ["audit_logs", "read"],
};

export function canSeePage(user: PageUser, action: string): boolean {
  if (!hasPermission(user, "pages", action)) return false;
  const read = PAGE_READ[action];
  if (!read) return true;
  return hasPermission(user, read[0], read[1]);
}

/** First sidebar page this user may open, or null when none are granted. */
export function firstAllowedHref(user: PageUser): string | null {
  for (const page of PANEL_PAGES) {
    if (!page.nav || !page.href) continue;
    if (canSeePage(user, page.action)) return page.href;
  }
  return null;
}
