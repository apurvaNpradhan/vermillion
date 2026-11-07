import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { appConfig } from "../../app.config.ts";

export default defineConfig({
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
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    // The SSR environment runs in workerd (dev and build), the same runtime as the deployed Worker.
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    tanstackStart(),
    react(),
  ],
});
