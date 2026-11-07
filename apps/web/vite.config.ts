import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { appConfig } from "../../app.config.ts";
import { offlineShell } from "./vite/offline-shell.ts";

export default defineConfig(({ command }) => ({
  server: {
    port: appConfig.ports.web,
    strictPort: true,
    // Same origin as production: Cloudflare routes /api and /rpc to the server there,
    // the dev server does it here. Cookies stay host-only and no CORS is needed.
    proxy: {
      "/api": appConfig.urls.server,
      "/rpc": appConfig.urls.server,
    },
  },
  // @powersync/web spawns its workers and loads wa-sqlite WASM through `new URL(..., import.meta.url)`;
  // Vite only rewrites those when the package is not pre-bundled.
  optimizeDeps: {
    exclude: ["@journeyapps/wa-sqlite", "@powersync/web"],
    include: ["@powersync/web > comlink"],
  },
  worker: { format: "es" },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    // The SSR environment runs in workerd (dev and build), the same runtime as the deployed Worker.
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    tanstackStart({
      // Prerenders a document with no matched routes (`/_shell`) at build time. The offline service
      // worker serves it for any navigation it cannot reach the network for (ADR 0020). Server
      // rendering of every other request is unchanged. Build only: under `vite dev` SPA mode
      // hard-codes TSS_SHELL=true and every request would render the empty shell.
      spa: { enabled: command === "build", prerender: { outputPath: "/_shell" } },
    }),
    react(),
    offlineShell(),
  ],
}));
