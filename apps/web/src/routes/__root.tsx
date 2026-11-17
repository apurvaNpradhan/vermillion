import { QueryClientProvider } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { NotFoundPage } from "@/marketing";
import { appConfig } from "@/platform/app-config";
import { t } from "@/platform/i18n";
import { queryClient } from "@/platform/query-client";
import { ToastProvider } from "@/platform/ui/toast";
import appCss from "@/styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "color-scheme", content: "light dark" },
      { title: appConfig.displayName },
      { name: "description", content: t("site__pitch") },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  component: () => <Outlet />,
  notFoundComponent: NotFoundPage,
});

/** No cookies, no analytics: the public pages are plain documents. */
function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh">
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
