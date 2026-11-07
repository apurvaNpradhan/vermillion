import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Real-Postgres infrastructure tests run through `pnpm test:sync-infra`.
    exclude: [...configDefaults.exclude, "**/*.infra.test.ts"],
  },
});
