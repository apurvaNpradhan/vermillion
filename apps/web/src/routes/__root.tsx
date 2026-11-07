import { QueryClientProvider } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router";
import { ToastProvider } from "@workspace/ui/components/toast";
import { useEffect, type ReactNode } from "react";

import { I18nextProvider, useTranslation } from "@/platform/i18n";
import type { RouterContext } from "@/platform/router-context";
import { readStoredTheme, THEME_INIT_SCRIPT, ThemeProvider } from "@/platform/theme";
import appCss from "@/styles/app.css?url";

export const Route = createRootRouteWithContext<RouterContext>()({
  // Read on the server from the request cookie and sent to the browser, so both render the same class.
  loader: () => ({ theme: readStoredTheme() }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
  component: () => <Outlet />,
  notFoundComponent: NotFound,
});

function RootDocument({ children }: { children: ReactNode }) {
  const { theme } = Route.useLoaderData();
  const { queryClient, i18n } = Route.useRouteContext();
  return (
    <html
      lang={i18n.language}
      className={theme === "dark" ? "dark" : undefined}
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <QueryClientProvider client={queryClient}>
          <I18nextProvider i18n={i18n}>
            <ThemeProvider initialTheme={theme}>
              <ToastProvider>
                <LangSync />
                {children}
              </ToastProvider>
            </ThemeProvider>
          </I18nextProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}

/** Keeps <html lang> in step with the active language after a switch. */
function LangSync() {
  const { i18n } = useTranslation();
  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);
  return null;
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4">
      <h1 className="font-semibold text-2xl">{t("errors__page_not_found")}</h1>
      <Link to="/" className="underline">
        {t("nav__home")}
      </Link>
    </main>
  );
}
