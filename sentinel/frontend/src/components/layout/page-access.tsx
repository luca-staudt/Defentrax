"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/context/auth-context";
import { canSeePage, firstAllowedHref, pageForPathname } from "@/lib/pages";
import { EmptyState } from "@/components/ui/empty-state";

export function PageAccess({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useI18n();
  const page = pageForPathname(pathname);

  if (!page || canSeePage(user, page.action)) {
    return <>{children}</>;
  }

  const next = firstAllowedHref(user);
  return (
    <div>
      <EmptyState
        title={t("access.denied")}
        description={`${t("access.deniedLead")} ${t(`nav.${page.action}`)}. ${t("access.deniedTail")}`}
      />
      {next ? (
        <p className="text-center mt-3">
          <Link href={next} className="btn btn-primary">
            {t("access.openAllowed")}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
