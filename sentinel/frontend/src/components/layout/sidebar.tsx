"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { hasPermission } from "@/lib/permissions";

const nav = [
  { href: "/dashboard", label: "Dashboard", perm: ["alerts", "read"] as const },
  { href: "/alerts", label: "Alerts", perm: ["alerts", "read"] as const },
  { href: "/events", label: "Events", perm: ["events", "read"] as const },
  { href: "/servers", label: "Servers", perm: ["servers", "write"] as const },
  { href: "/rules", label: "Rules", perm: ["rules", "read"] as const },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-800 bg-black/80">
      <div className="flex items-center gap-3 border-b border-zinc-800 px-5 py-5">
        <Image src="/sentinel-logo.png" alt="Sentinel" width={40} height={40} priority />
        <div>
          <p className="font-display text-lg font-bold tracking-[0.2em] text-white">SENTINEL</p>
          <p className="text-[10px] uppercase tracking-[0.35em] text-brand-400">Monitor · Detect · Protect</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {nav.map((item) => {
          if (!hasPermission(user, item.perm[0], item.perm[1])) return null;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-brand-500/15 text-brand-200 ring-1 ring-brand-500/30"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-zinc-800 px-4 py-4 text-xs text-zinc-500">
        <p className="truncate text-zinc-300">{user?.email}</p>
        <p className="mt-1 truncate">{user?.roles?.join(", ")}</p>
        <button
          type="button"
          onClick={() => void logout()}
          className="mt-3 w-full rounded-lg border border-zinc-700 px-3 py-2 text-left text-sm text-zinc-300 hover:border-brand-500/50 hover:text-brand-200"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
