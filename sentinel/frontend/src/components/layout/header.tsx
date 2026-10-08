"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dropdown, DropdownItem, DropdownMenu, DropdownToggle, Form } from "reactstrap";
import { useAuth } from "@/context/auth-context";
import { VersionBadge } from "@/components/layout/version-badge";
import { LanguageSelect, useI18n } from "@/lib/i18n";
import { apiFetch } from "@/lib/api/client";
import { canSeePage } from "@/lib/pages";
import { useQuery } from "@/lib/panel/use-query";
import type { DashboardStats } from "@/lib/types";

const THEME_KEY = "defentrax-bs-theme";

function applyTheme(mode: "light" | "dark") {
  const root = document.documentElement;
  root.setAttribute("data-bs-theme", mode);
  root.setAttribute("data-topbar", mode === "dark" ? "dark" : "light");
  root.setAttribute("data-sidebar", "dark");
}

export function Header() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const [headerClass, setHeaderClass] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [mode, setMode] = useState<"light" | "dark">("dark");

  const canDashboard = canSeePage(user, "dashboard");
  const canAlerts = canSeePage(user, "alerts");
  const statsQuery = useQuery(canDashboard ? "stats" : null, () => apiFetch<DashboardStats>("/dashboard/stats"));
  const stats = statsQuery.data;

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY);
    const next = stored === "light" ? "light" : "dark";
    setMode(next);
    applyTheme(next);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setHeaderClass(document.documentElement.scrollTop > 50 ? "topbar-shadow" : "");
    };
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (event.target as HTMLElement | null)?.isContentEditable) return;
      event.preventDefault();
      document.getElementById("dx-top-search")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggleMenuBtn = () => {
    const windowSize = document.documentElement.clientWidth;
    const humberIcon = document.querySelector(".hamburger-icon") as HTMLElement | null;
    if (windowSize > 767) humberIcon?.classList.toggle("open");

    if (windowSize < 1025 && windowSize > 767) {
      document.body.classList.remove("vertical-sidebar-enable");
      if (document.documentElement.getAttribute("data-sidebar-size") === "sm") {
        document.documentElement.setAttribute("data-sidebar-size", "");
      } else {
        document.documentElement.setAttribute("data-sidebar-size", "sm");
      }
    } else if (windowSize > 1025) {
      document.body.classList.remove("vertical-sidebar-enable");
      if (document.documentElement.getAttribute("data-sidebar-size") === "lg") {
        document.documentElement.setAttribute("data-sidebar-size", "sm");
      } else {
        document.documentElement.setAttribute("data-sidebar-size", "lg");
      }
    } else if (windowSize <= 767) {
      document.body.classList.add("vertical-sidebar-enable");
      document.documentElement.setAttribute("data-sidebar-size", "lg");
    }
  };

  const toggleTheme = () => {
    const next = mode === "dark" ? "light" : "dark";
    setMode(next);
    applyTheme(next);
    window.localStorage.setItem(THEME_KEY, next);
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/events?q=${encodeURIComponent(q)}` : "/events");
    setSearchOpen(false);
  };

  const display = user?.display_name || user?.email || t("header.operator");
  const openAlerts = stats?.alerts_open ?? 0;

  return (
    <header id="page-topbar" className={headerClass}>
      <div className="layout-width">
        <div className="navbar-header">
          <div className="d-flex align-items-center">
            <div className="navbar-brand-box horizontal-logo">
              <Link href="/dashboard" className="logo logo-dark">
                <span className="logo-sm">
                  <img src="/defentrax-logo.png" alt="" height={22} width={22} />
                </span>
                <span className="logo-lg">
                  <img src="/defentrax-logo.png" alt="Defentrax" height={22} width={22} />
                </span>
              </Link>
              <Link href="/dashboard" className="logo logo-light">
                <span className="logo-sm">
                  <img src="/defentrax-logo.png" alt="" height={22} width={22} />
                </span>
                <span className="logo-lg dx-brand">
                  <img src="/defentrax-logo.png" alt="" height={20} width={20} />
                  <span className="fs-15 fw-semibold">DEFENTRAX</span>
                </span>
              </Link>
            </div>

            <button
              onClick={toggleMenuBtn}
              type="button"
              className="btn btn-sm px-3 fs-16 header-item vertical-menu-btn topnav-hamburger"
              id="topnav-hamburger-icon"
              aria-label={t("header.menu")}
            >
              <span className="hamburger-icon">
                <span></span>
                <span></span>
                <span></span>
              </span>
            </button>

            <form className="app-search d-none d-md-block" onSubmit={onSearch}>
              <div className="position-relative">
                <input
                  id="dx-top-search"
                  type="text"
                  className="form-control"
                  placeholder={t("header.search")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <span className="bx bx-search-alt search-widget-icon"></span>
                <kbd className="dx-search-kbd d-none d-xl-inline">/</kbd>
              </div>
            </form>
          </div>

          <div className="d-flex align-items-center">
            <Dropdown isOpen={searchOpen} toggle={() => setSearchOpen((v) => !v)} className="d-md-none topbar-head-dropdown header-item">
              <DropdownToggle type="button" tag="button" className="btn btn-icon btn-topbar btn-ghost-secondary rounded-circle" aria-label="Search">
                <i className="bx bx-search fs-22"></i>
              </DropdownToggle>
              <DropdownMenu className="dropdown-menu-lg dropdown-menu-end p-0">
                <Form className="p-3" onSubmit={onSearch}>
                  <div className="form-group m-0">
                    <div className="input-group">
                      <input
                        type="text"
                        className="form-control"
                        placeholder={t("header.searchShort")}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      <button className="btn btn-primary" type="submit" aria-label={t("header.submitSearch")}>
                        <i className="mdi mdi-magnify"></i>
                      </button>
                    </div>
                  </div>
                </Form>
              </DropdownMenu>
            </Dropdown>

            {canAlerts ? (
              <div className="ms-1 header-item d-flex">
                <Link
                  href="/alerts"
                  className="btn btn-icon btn-topbar btn-ghost-secondary rounded-circle"
                  aria-label={t("header.alerts")}
                >
                  <i className="bx bx-bell fs-22"></i>
                  {stats && openAlerts > 0 ? (
                    <span className="position-absolute topbar-badge fs-10 translate-middle badge rounded-pill bg-danger">
                      {openAlerts > 99 ? "99+" : openAlerts}
                      <span className="visually-hidden">{t("dash.open")}</span>
                    </span>
                  ) : null}
                </Link>
              </div>
            ) : null}

            <div className="ms-1 header-item d-flex align-items-center">
              <LanguageSelect />
            </div>

            <div className="ms-1 header-item d-flex">
              <button
                onClick={toggleTheme}
                type="button"
                className="btn btn-icon btn-topbar btn-ghost-secondary rounded-circle light-dark-mode"
                aria-label={mode === "dark" ? t("header.light") : t("header.dark")}
              >
                <i className="bx bx-moon fs-22"></i>
              </button>
            </div>

            <div className="ms-1 header-item d-none d-sm-flex align-items-center">
              <VersionBadge />
            </div>

            <Dropdown isOpen={menuOpen} toggle={() => setMenuOpen((v) => !v)} className="ms-sm-3 header-item topbar-user">
              <DropdownToggle tag="button" type="button" className="btn material-shadow-none">
                <span className="d-flex align-items-center">
                  <span className="avatar-xs">
                    <span className="avatar-title rounded-circle bg-primary-subtle text-primary">
                      {display.charAt(0).toUpperCase()}
                    </span>
                  </span>
                  <span className="text-start ms-xl-2">
                    <span className="d-none d-xl-inline-block ms-1 fw-medium user-name-text">{display}</span>
                    <span className="d-none d-xl-block ms-1 fs-12 user-name-sub-text">
                      {user?.roles?.[0] || t("header.operator")}
                    </span>
                  </span>
                </span>
              </DropdownToggle>
              <DropdownMenu className="dropdown-menu-end">
                <h6 className="dropdown-header">{t("header.welcome")} {display}</h6>
                {canDashboard ? (
                  <DropdownItem tag={Link} href="/dashboard">
                    <i className="ri-dashboard-2-line text-muted fs-16 align-middle me-1"></i>
                    <span className="align-middle">{t("nav.dashboard")}</span>
                  </DropdownItem>
                ) : null}
                {canAlerts ? (
                  <DropdownItem tag={Link} href="/alerts">
                    <i className="ri-alarm-warning-line text-muted fs-16 align-middle me-1"></i>
                    <span className="align-middle">{t("nav.alerts")}</span>
                  </DropdownItem>
                ) : null}
                <DropdownItem divider />
                <button type="button" className="dropdown-item" onClick={() => void logout()}>
                  <i className="mdi mdi-logout text-muted fs-16 align-middle me-1"></i>
                  <span className="align-middle">{t("header.logout")}</span>
                </button>
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>
      </div>
    </header>
  );
}
