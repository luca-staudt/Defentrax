"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { VersionBadge } from "@/components/layout/version-badge";

export function ClientAppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-[#030712]">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex shrink-0">
        <Sidebar />
      </div>

      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile Drawer */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-200 ease-in-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onNavigate={() => setMobileOpen(false)} />
      </div>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Responsive Header Bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-[#060a12]/90 px-4 md:px-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            {/* Hamburger Button on Mobile */}
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-zinc-800 p-2 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800 hover:text-white lg:hidden"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="flex items-center gap-2 text-xs">
              <span className="hidden sm:inline font-mono text-zinc-500">CLUSTER:</span>
              <span className="font-mono font-medium text-sky-400 truncate max-w-[150px] sm:max-w-none">
                DEFENTRAX-PRIMARY
              </span>
              <span className="hidden sm:inline text-zinc-700">/</span>
              <span className="flex items-center gap-1.5 text-zinc-400 text-[11px] font-mono">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="hidden md:inline">SIEM AGENT STREAM ACTIVE</span>
                <span className="md:hidden">LIVE</span>
              </span>
            </div>
          </div>

          {/* Auto-synced GitHub release version */}
          <VersionBadge />
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
