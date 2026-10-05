import { redirect } from "next/navigation";
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
      <div className="flex min-h-screen bg-[radial-gradient(ellipse_at_top,_#0a1628_0%,_#030712_55%)]">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">{children}</div>
        </main>
      </div>
    </AuthProvider>
  );
}
