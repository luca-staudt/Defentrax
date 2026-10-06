"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { canSeePage, firstAllowedHref, pageForPathname } from "@/lib/pages";
import { EmptyState } from "@/components/ui/empty-state";

export function PageAccess({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const page = pageForPathname(pathname);

  if (!page || canSeePage(user, page.action)) {
    return <>{children}</>;
  }

  const next = firstAllowedHref(user);
  return (
    <div className="space-y-4">
      <EmptyState
        title="No access to this page"
        description={`Your role cannot open ${page.label}. An admin can grant pages:${page.action} under Roles.`}
      />
      {next ? (
        <p className="text-center text-sm">
          <Link href={next} className="text-brand-400 hover:text-brand-300">
            Open a page you can view
          </Link>
        </p>
      ) : null}
    </div>
  );
}
