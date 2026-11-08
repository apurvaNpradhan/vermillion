import { Link } from "@tanstack/react-router";
import { LocaleMenu, ThemeMenu } from "@/preferences";
import type { ReactNode } from "react";

import { appConfig } from "@/platform/app-config";
import { useTranslation } from "@/platform/i18n";

import { SessionSlot } from "./session-slot";

/** Header and footer around public, server-rendered pages. */
export function PublicLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <Link to="/" className="text-title-md">
            {appConfig.displayName}
          </Link>
          <div className="flex items-center gap-1">
            <LocaleMenu />
            <ThemeMenu />
            <SessionSlot />
          </div>
        </div>
      </header>
      <main id="content" className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        {children}
      </main>
      <footer className="border-t">
        <nav
          aria-label={t("nav__legal")}
          className="mx-auto flex h-12 w-full max-w-5xl items-center gap-4 px-4 text-label text-muted-foreground"
        >
          <Link to="/terms">{t("nav__terms")}</Link>
          <Link to="/privacy">{t("nav__privacy")}</Link>
        </nav>
      </footer>
    </div>
  );
}
