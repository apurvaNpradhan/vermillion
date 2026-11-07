import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Migrates a template database on the Docker Postgres once per run; fails with
    // a `pnpm db:start` hint when Postgres is missing.
    globalSetup: ["./src/platform/testing/global-setup.ts"],
    // Real-Postgres infrastructure tests run through `pnpm test:sync-infra`.
    exclude: [...configDefaults.exclude, "**/*.infra.test.ts"],
  },
});
