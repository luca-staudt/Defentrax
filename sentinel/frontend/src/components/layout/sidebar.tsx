"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import SimpleBar from "simplebar-react";
import { Container, DropdownMenu, DropdownToggle, UncontrolledDropdown } from "reactstrap";
import { useAuth } from "@/context/auth-context";
import { canSeePage, PANEL_PAGES, type PanelPage } from "@/lib/pages";
import { useI18n } from "@/lib/i18n";

const NAV_ICONS: Record<string, string> = {
  dashboard: "ri-dashboard-2-line",
  alerts: "ri-alarm-warning-line",
  events: "ri-pulse-line",
  servers: "ri-server-line",
  rules: "ri-shield-check-line",
  notifications: "ri-notification-3-line",
  team: "ri-team-line",
  roles: "ri-key-2-line",
  audit: "ri-file-list-3-line",
};

type NavSection = {
  key: string;
  labelKey: string;
  actions: string[];
};

const NAV_SECTIONS: NavSection[] = [
  { key: "ops", labelKey: "nav.section.ops", actions: ["dashboard", "alerts", "events"] },
  { key: "fleet", labelKey: "nav.section.fleet", actions: ["servers", "rules"] },
  { key: "admin", labelKey: "nav.section.admin", actions: ["notifications", "team", "roles", "audit"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const allowed = PANEL_PAGES.filter((page) => page.nav && page.href && canSeePage(user, page.action));
  const byAction = new Map(allowed.map((page) => [page.action, page]));
  const display = user?.display_name || user?.email || t("header.operator");

  useEffect(() => {
    const verticalOverlay = document.getElementsByClassName("vertical-overlay");
    const overlay = verticalOverlay?.[0];
    if (!overlay) return;
    const close = () => document.body.classList.remove("vertical-sidebar-enable");
    overlay.addEventListener("click", close);
    return () => overlay.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    const ul = document.getElementById("navbar-nav");
    if (!ul) return;
    const links = Array.from(ul.querySelectorAll("a"));
    for (const item of links) item.classList.remove("active");
    let longest = "";
    let match: HTMLAnchorElement | null = null;
    for (const item of links) {
      const itemPath = item.pathname;
      if (itemPath && pathname.startsWith(itemPath) && itemPath.length > longest.length && itemPath !== "/") {
        longest = itemPath;
        match = item;
      }
    }
    if (match) match.classList.add("active");
  }, [pathname]);

  const hoverSidebar = () => {
    const attr = document.documentElement.getAttribute("data-sidebar-size");
    document.documentElement.setAttribute(
      "data-sidebar-size",
      attr === "sm-hover" ? "sm-hover-active" : "sm-hover",
    );
  };

  const renderItem = (item: PanelPage) => (
    <li className="nav-item" key={item.action}>
      <Link className="nav-link menu-link" href={item.href!}>
        <i className={NAV_ICONS[item.action] || "ri-pages-line"}></i>
        <span>{t(`nav.${item.action}`)}</span>
      </Link>
    </li>
  );

  return (
    <>
      <div className="app-menu navbar-menu">
        <div className="navbar-brand-box">
          <Link href="/dashboard" className="logo logo-dark">
            <span className="logo-sm">
              <img src="/defentrax-logo.png" alt="Defentrax" height={22} width={22} />
            </span>
            <span className="logo-lg">
              <img src="/defentrax-logo.png" alt="Defentrax" height={22} width={22} />
            </span>
          </Link>
          <Link href="/dashboard" className="logo logo-light">
            <span className="logo-sm">
              <img src="/defentrax-logo.png" alt="Defentrax" height={22} width={22} />
            </span>
            <span className="logo-lg dx-brand">
              <img src="/defentrax-logo.png" alt="" height={22} width={22} />
              <span className="fs-15 fw-semibold">DEFENTRAX</span>
            </span>
          </Link>
          <button
            onClick={hoverSidebar}
            type="button"
            className="btn btn-sm p-0 fs-20 header-item float-end btn-vertical-sm-hover"
            id="vertical-hover"
          >
            <i className="ri-record-circle-line"></i>
          </button>
        </div>

        <SimpleBar id="scrollbar" className="h-100 dx-sidebar-scroll">
          <Container fluid>
            <div id="two-column-menu"></div>
            <ul className="navbar-nav" id="navbar-nav">
              {NAV_SECTIONS.flatMap((section) => {
                const items = section.actions.map((action) => byAction.get(action)).filter(Boolean) as PanelPage[];
                if (items.length === 0) return [];
                return [
                  <li className="menu-title" key={`${section.key}-title`}>
                    <span>{t(section.labelKey)}</span>
                  </li>,
                  ...items.map(renderItem),
                ];
              })}
              <li className="menu-title">
                <span>{t("nav.links")}</span>
              </li>
              <li className="nav-item">
                <a className="nav-link menu-link" href="https://defentrax.de" target="_blank" rel="noopener noreferrer">
                  <i className="ri-global-line"></i>
                  <span>defentrax.de</span>
                </a>
              </li>
            </ul>
          </Container>
        </SimpleBar>

        <UncontrolledDropdown direction="up" className="sidebar-user dx-sidebar-user">
          <DropdownToggle tag="button" type="button" className="btn material-shadow-none" id="sidebar-user-dropdown">
            <span className="d-flex align-items-center gap-2">
              <span className="avatar-xs flex-shrink-0">
                <span className="avatar-title rounded-circle bg-white text-primary fw-semibold">
                  {display.charAt(0).toUpperCase()}
                </span>
              </span>
              <span className="text-start overflow-hidden">
                <span className="d-block fw-medium sidebar-user-name-text">{display}</span>
                <span className="d-block fs-12 sidebar-user-name-sub-text">
                  <i className="ri ri-circle-fill fs-10 text-success align-baseline"></i>{" "}
                  <span className="align-middle">{t("nav.online")}</span>
                </span>
              </span>
            </span>
          </DropdownToggle>
          <DropdownMenu>
            <h6 className="dropdown-header">{t("header.welcome")} {display}</h6>
            <button type="button" className="dropdown-item" onClick={() => void logout()}>
              <i className="mdi mdi-logout text-muted fs-16 align-middle me-1"></i>
              <span className="align-middle">{t("header.logout")}</span>
            </button>
          </DropdownMenu>
        </UncontrolledDropdown>

        <div className="sidebar-background"></div>
      </div>
      <div className="vertical-overlay"></div>
    </>
  );
}
