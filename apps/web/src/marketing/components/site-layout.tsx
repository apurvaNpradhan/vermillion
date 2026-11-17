import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { appConfig } from "@/platform/app-config";
import { useT, type SiteKey } from "@/platform/i18n";

const FOOTER: { to: string; label: SiteKey }[] = [
  { to: "/download", label: "site__nav_download" },
  { to: "/privacy", label: "site__nav_privacy" },
  { to: "/terms", label: "site__nav_terms" },
  { to: "/delete-account", label: "site__nav_delete" },
  { to: "/support", label: "site__nav_support" },
];

/** Header and footer of every public page; readable at phone width (16px gutters). */
export function SiteLayout({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-5">
        <Link to="/" className="font-semibold text-lg tracking-tight text-text-primary">
          {appConfig.displayName}
        </Link>
        <Link to="/download" className="text-sm text-text-secondary hover:text-text-primary">
          {t("site__nav_download")}
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16">{children}</main>
      <footer className="border-t border-hairline">
        <nav className="mx-auto flex w-full max-w-3xl flex-wrap gap-x-5 gap-y-2 px-4 py-6 text-sm text-text-muted">
          {FOOTER.map((item) => (
            <Link key={item.to} to={item.to} className="hover:text-text-primary">
              {t(item.label)}
            </Link>
          ))}
          <span className="ms-auto">{t("site__footer_note", { app: appConfig.displayName })}</span>
        </nav>
      </footer>
    </div>
  );
}
