import { defineConfig } from "vitest/config";

// Seam 3 (ADR 0024): real Postgres, PowerSync and API, driven by headless clients.
// This workspace may import both server-side and client-side packages (ADR 0016
// forbids that for ordinary packages). It is not part of `pnpm test`.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"], testTimeout: 60_000, hookTimeout: 60_000 },
});
