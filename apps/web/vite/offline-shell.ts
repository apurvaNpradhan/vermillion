import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { build, loadEnv, type Plugin } from "vite";

import { isPrecacheable } from "../sw/policy.ts";

/**
 * Builds `sw.js` next to the client bundle (ADR 0020). The precache list is the client build's own
 * output, so every fingerprinted chunk, the CSS and the SQLite WASM and workers are included. The
 * `/_shell` document it also caches is prerendered by TanStack Start after the Vite build.
 */
export function offlineShell(): Plugin {
  return {
    name: "offline-shell",
    config: (config, { command, mode }) => {
      if (command === "build") {
        // The shell prerender validates the web env; without it the failure is an opaque fetch error.
        const env = loadEnv(mode, config.envDir || config.root || process.cwd(), "VITE_");
        if (!env.VITE_SERVER_URL && !process.env.VITE_SERVER_URL) {
          throw new Error(
            "offline-shell: VITE_SERVER_URL is not set. Copy apps/web/.env.example to apps/web/.env.",
          );
        }
        // TanStack Start decides "render the shell" from `process.env.TSS_SHELL` / `TSS_PRERENDERING`
        // read inside the server runtime. The prerender runs the built Worker in workerd, which does
        // not see this process's environment unless the Cloudflare plugin is told to pass it on.
        // Without this the prerender renders the full `/` page, not a route-less shell. Only the
        // local build-time preview Worker gets these; nothing is written into the deployed config.
        process.env.TSS_SHELL = "true";
        process.env.CLOUDFLARE_INCLUDE_PROCESS_ENV = "true";
      }
      return { define: { __OFFLINE_SHELL__: JSON.stringify(command === "build") } };
    },
    applyToEnvironment: (environment) => environment.name === "client",
    async writeBundle(options, bundle) {
      if (!options.dir) return;
      const urls = Object.keys(bundle)
        .filter(isPrecacheable)
        .sort()
        .map((file) => `/${file}`);
      const buildId = createHash("sha256").update(urls.join("\n")).digest("hex").slice(0, 12);
      await build({
        configFile: false,
        logLevel: "warn",
        publicDir: false,
        define: { __PRECACHE__: JSON.stringify(urls), __BUILD_ID__: JSON.stringify(buildId) },
        build: {
          outDir: options.dir,
          emptyOutDir: false,
          target: "es2022",
          lib: {
            entry: fileURLToPath(new URL("../sw/sw.ts", import.meta.url)),
            formats: ["iife"],
            name: "offlineShellWorker",
            fileName: () => "sw.js",
          },
        },
      });
    },
  };
}
