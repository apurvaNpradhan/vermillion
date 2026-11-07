import { Link } from "@tanstack/react-router";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@workspace/ui/components/card";
import type { ReactNode } from "react";

import { appConfig } from "@/platform/app-config";
import { useTranslation } from "@/platform/i18n";

/** Centered card shared by every auth screen. */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
      <Link to="/" className="font-semibold text-lg tracking-tight">
        {appConfig.displayName}
      </Link>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle render={<h1 />}>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardPanel className="flex flex-col gap-4">{children}</CardPanel>
      </Card>
      {footer}
      <nav aria-label={t("nav__legal")} className="flex gap-4 text-muted-foreground text-xs">
        <Link to="/terms">{t("nav__terms")}</Link>
        <Link to="/privacy">{t("nav__privacy")}</Link>
      </nav>
    </main>
  );
}
