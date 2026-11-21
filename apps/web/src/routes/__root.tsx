import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";

import { SiteFooter } from "../components/site-footer.tsx";
import { SiteHeader } from "../components/site-header.tsx";
import { en, site } from "../content/en.ts";
import styles from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: `${en.notFoundTitle} | ${site.name}` },
      { name: "theme-color", content: "#19130F" },
    ],
    links: [
      { rel: "stylesheet", href: styles },
      { rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon/favicon-16.png" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "48x48", href: "/favicon/favicon-48.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  component: RootLayout,
});

function RootLayout() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <a className="skip-link" href="#main">
          {en.skipToContent}
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
        <SiteFooter />
        <Scripts />
      </body>
    </html>
  );
}
