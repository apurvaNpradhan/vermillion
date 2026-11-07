import { Link, useRouterState } from "@tanstack/react-router";
import { useCurrentUser } from "@/account";
import { LocaleMenu, ThemeMenu, usePreferences } from "@/preferences";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar";
import { LayoutDashboardIcon, NotebookPenIcon, SettingsIcon, UsersIcon } from "lucide-react";
import type { ReactNode } from "react";

import { appConfig } from "@/platform/app-config";
import { useTranslation } from "@/platform/i18n";

import { UserMenu } from "./user-menu";

/** Sidebar shell of the signed-in app. The collapsed state is a saved UI preference. */
export function AppLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { preferences, setUi } = usePreferences();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  const items = [
    {
      to: "/app",
      label: t("nav__dashboard"),
      icon: LayoutDashboardIcon,
      active: pathname === "/app",
    },
    {
      to: "/notes",
      label: t("notes__title"),
      icon: NotebookPenIcon,
      active: pathname.startsWith("/notes"),
    },
    {
      to: "/settings",
      label: t("nav__settings"),
      icon: SettingsIcon,
      active: pathname.startsWith("/settings"),
    },
    ...(user?.role === "admin"
      ? [
          {
            to: "/admin/users",
            label: t("nav__admin_users"),
            icon: UsersIcon,
            active: pathname.startsWith("/admin"),
          },
        ]
      : []),
  ] as const;

  return (
    <SidebarProvider
      open={!preferences.ui.sidebarCollapsed}
      onOpenChange={(open) => setUi({ sidebarCollapsed: !open })}
    >
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <Link to="/app" className="px-2 py-1 font-semibold tracking-tight">
            {appConfig.displayName}
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {items.map((item) => (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      isActive={item.active}
                      tooltip={item.label}
                      render={<Link to={item.to} />}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center justify-between border-b px-4">
          <SidebarTrigger aria-label={t("nav__toggle_sidebar")} />
          <div className="flex items-center gap-1">
            <LocaleMenu />
            <ThemeMenu />
            {user ? <UserMenu name={user.name} email={user.email} /> : null}
          </div>
        </header>
        <main id="content" className="flex-1 p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
