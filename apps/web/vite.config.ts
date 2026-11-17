import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { appConfig } from "../../app.config.ts";

/**
 * The public pages, prerendered at build time. The admin and the invite link are client-only:
 * the Worker serves them the `/_shell` page.
 */
const PUBLIC_PAGES = ["/", "/privacy", "/terms", "/delete-account", "/support", "/download"];

export default defineConfig({
  server: {
    port: appConfig.ports.web,
    strictPort: true,
    // Same origin as production: the Worker forwards /api and /rpc there, the dev server here.
    proxy: {
      "/api": appConfig.urls.server,
      "/rpc": appConfig.urls.server,
    },
  },
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackStart({
      spa: { enabled: true, prerender: { outputPath: "/_shell", crawlLinks: false } },
      prerender: {
        enabled: true,
        crawlLinks: false,
        autoStaticPathsDiscovery: false,
        failOnError: true,
      },
      pages: PUBLIC_PAGES.map((path) => ({ path })),
    }),
    react(),
  ],
});
