import { defineConfig } from "vitest/config";

// Separate from vite.config.ts: the Cloudflare plugin there needs a Worker runtime.
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
