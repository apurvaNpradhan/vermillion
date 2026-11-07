import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useTranslation } from "@/platform/i18n";

/** Settings shell: a section list beside the active section. */
export function SettingsLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const links = [
    { to: "/settings", label: t("settings__nav_profile"), exact: true },
    { to: "/settings/preferences", label: t("settings__nav_preferences"), exact: false },
  ] as const;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="font-semibold text-xl">{t("settings__title")}</h1>
      <div className="flex flex-col gap-6 md:flex-row">
        <nav aria-label={t("settings__title")} className="flex gap-1 md:w-48 md:flex-col">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              activeOptions={{ exact: link.exact }}
              className="rounded-lg px-3 py-1.5 text-muted-foreground text-sm hover:bg-accent data-[status=active]:bg-accent data-[status=active]:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
