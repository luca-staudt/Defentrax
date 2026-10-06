"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { canSeePage, PANEL_PAGES } from "@/lib/pages";
import {
  DashboardIcon,
  AlertTriangleIcon,
  ActivityIcon,
  ServerIcon,
  ShieldCheckIcon,
  BellIcon,
  UsersIcon,
  KeyIcon,
  FileTextIcon,
} from "@/components/ui/icons";

const nav = PANEL_PAGES.filter((page) => page.nav && page.href);

const getNavIcon = (action: string) => {
  switch (action) {
    case "dashboard":
      return <DashboardIcon />;
    case "alerts":
      return <AlertTriangleIcon />;
    case "events":
      return <ActivityIcon />;
    case "servers":
      return <ServerIcon />;
    case "rules":
      return <ShieldCheckIcon />;
    case "notifications":
      return <BellIcon />;
    case "users":
      return <UsersIcon />;
    case "roles":
      return <KeyIcon />;
    case "audit":
      return <FileTextIcon />;
    default:
      return <ActivityIcon />;
  }
};

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-zinc-800/80 bg-[#060a12]/95 backdrop-blur-xl">
      {/* Brand Header */}
      <div className="flex items-center gap-3 border-b border-zinc-800/80 px-5 py-4">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-950/40 p-2 shadow-lg shadow-sky-500/10">
          <Image src="/defentrax-logo.png" alt="Defentrax" width={32} height={32} priority className="object-contain" />
          <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-500"></span>
          </span>
        </div>
        <div>
          <span className="font-display text-base font-bold tracking-[0.18em] text-white">DEFENTRAX</span>
          <p className="max-w-[9.5rem] text-[8px] font-mono tracking-[0.08em] text-sky-400 uppercase leading-snug">
            Security & Infrastructure Management
          </p>
        </div>
      </div>

      {/* System Status Pill */}
      <div className="mx-3 mt-3 rounded-lg border border-sky-500/20 bg-sky-950/20 px-3 py-2">
        <div className="flex items-center justify-between text-[10px] font-mono">
          <span className="text-zinc-400 uppercase">SIEM ENGINE</span>
          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            ONLINE
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        <p className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-500">Operations & SIEM</p>
        {nav.map((item) => {
          if (!item.href || !canSeePage(user, item.action)) return null;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`group flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all ${
                active
                  ? "border border-sky-500/40 bg-sky-500/10 text-sky-200 shadow-md shadow-sky-500/5 font-semibold"
                  : "text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900/60 hover:text-zinc-100"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className={active ? "text-sky-400" : "text-zinc-500 group-hover:text-zinc-300"}>
                  {getNavIcon(item.action)}
                </span>
                <span>{item.label}</span>
              </div>
              {active && <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8]" />}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-3">
        <a
          href="https://defentrax.de"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between rounded-xl border border-zinc-800 px-3 py-2 text-xs text-zinc-300 transition hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-200"
        >
          <span>defentrax.de</span>
          <span className="font-mono text-[10px] text-zinc-500">Website</span>
        </a>
      </div>

      {/* User Session Footer */}
      <div className="border-t border-zinc-800/80 p-3 bg-zinc-950/40">
        <div className="flex items-center gap-2.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-950/60 font-display text-xs font-bold text-sky-400">
            {user?.email?.charAt(0).toUpperCase() || "U"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-zinc-200">{user?.email}</p>
            <div className="mt-0.5 flex flex-wrap gap-1">
              {user?.roles?.map((r) => (
                <span key={r} className="rounded bg-sky-500/10 px-1 py-0.2 text-[9px] font-mono text-sky-400">
                  {r}
                </span>
              ))}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void logout()}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  );
}
