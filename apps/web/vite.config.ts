import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { appConfig } from "../../app.config.ts";
import { sigilTheme } from "./theme-plugin.ts";

// The site has no data, so every page is prerendered at build time and served as a static asset by
// the Worker. The Cloudflare plugin must come first, then TanStack Start, then React.
export default defineConfig({
  server: { port: appConfig.ports.web },
  plugins: [
    sigilTheme(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart({
      prerender: { enabled: true },
      pages: [
        { path: "/" },
        { path: "/screens" },
        { path: "/privacy" },
        { path: "/terms" },
        { path: "/delete-account" },
      ],
    }),
    viteReact(),
  ],
});
