import { createFileRoute } from "@tanstack/react-router";

import { buildSitemap, PUBLIC_PATHS, siteOrigin } from "@/lib/seo";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () =>
        new Response(buildSitemap(siteOrigin(), PUBLIC_PATHS), {
          headers: { "Content-Type": "application/xml; charset=utf-8" },
        }),
    },
  },
});
