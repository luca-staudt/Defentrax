import { redirect } from "next/navigation";
import { PageAccess } from "@/components/layout/page-access";
import { Sidebar } from "@/components/layout/sidebar";
import { AuthProvider } from "@/context/auth-context";
import { serverApiFetch } from "@/lib/api/server";
import type { User } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data, status } = await serverApiFetch<User>("/auth/me");
  if (status !== 200 || !data) {
    redirect("/login");
  }

  return (
    <AuthProvider initialUser={data}>
      <div className="flex h-screen overflow-hidden bg-[#030712]">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Top Cyber Telemetry Bar */}
          <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-[#060a12]/80 px-6 backdrop-blur-md">
            <div className="flex items-center gap-3 text-xs">
              <span className="font-mono text-zinc-500">NODE:</span>
              <span className="font-mono font-medium text-sky-400">DEFENTRAX-CORE-PRIMARY</span>
              <span className="text-zinc-700">/</span>
              <span className="flex items-center gap-1.5 text-zinc-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                SIEM AGENT STREAM ACTIVE
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-zinc-400">
              <span className="rounded-full border border-sky-500/20 bg-sky-950/30 px-2.5 py-0.5 text-[11px] text-sky-300">
                DEFENTRAX SHIELD v2.4
              </span>
            </div>
          </header>

          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
              <PageAccess>{children}</PageAccess>
            </div>
          </main>
        </div>
      </div>
    </AuthProvider>
  );
}
