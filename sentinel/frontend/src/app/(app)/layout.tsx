import { redirect } from "next/navigation";
import { PageAccess } from "@/components/layout/page-access";
import { ClientAppShell } from "@/components/layout/client-shell";
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
      <ClientAppShell>
        <PageAccess>{children}</PageAccess>
      </ClientAppShell>
    </AuthProvider>
  );
}
