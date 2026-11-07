import { defineConfig } from "vitest/config";

// Seam 3 (ADR 0024): real Postgres, PowerSync and API, driven by headless clients.
// This workspace may import both server-side and client-side packages (ADR 0016
// forbids that for ordinary packages). It is not part of `pnpm test`.
// Files run one after another: the fault suites stop PowerSync and cut database sessions,
// which would break a neighbouring file.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 90_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
