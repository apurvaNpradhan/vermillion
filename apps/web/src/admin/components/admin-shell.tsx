import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { appConfig } from "@/platform/app-config";
import { useT, type SiteKey } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";

const NAV: { to: string; label: SiteKey }[] = [
  { to: "/admin", label: "admin__nav_overview" },
  { to: "/admin/catalog", label: "admin__nav_catalog" },
  { to: "/admin/users", label: "admin__nav_users" },
  { to: "/admin/access", label: "admin__nav_access" },
  { to: "/admin/releases", label: "admin__nav_releases" },
  { to: "/admin/audit", label: "admin__nav_audit" },
];

/** Sidebar on wide screens, a scrolling row on phones; the page beside it. */
export function AdminShell({
  email,
  onSignOut,
  children,
}: {
  email: string | null;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 border-hairline border-b p-4 md:w-56 md:border-e md:border-b-0">
        <p className="font-semibold text-text-primary">
          {t("admin__title", { app: appConfig.displayName })}
        </p>
        <nav className="-mx-1 flex gap-1 overflow-x-auto md:flex-col">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/admin", includeSearch: false }}
              className="whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-control data-[status=active]:bg-surface-control data-[status=active]:text-text-primary"
            >
              {t(item.label)}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden flex-col gap-2 md:flex">
          <p className="truncate text-text-muted text-xs">{email}</p>
          <Button variant="outline" size="sm" onClick={onSignOut}>
            {t("admin__sign_out")}
          </Button>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">{children}</main>
    </div>
  );
}
