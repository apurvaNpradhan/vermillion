import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The site has no data, so every page is prerendered at build time and served as a static asset by
// the Worker. The Cloudflare plugin must come first, then TanStack Start, then React.
export default defineConfig({
  server: { port: 3001 },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart({
      prerender: { enabled: true },
      pages: [{ path: "/" }, { path: "/privacy" }, { path: "/terms" }, { path: "/delete-account" }],
    }),
    viteReact(),
  ],
});
