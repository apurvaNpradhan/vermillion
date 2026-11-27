import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Tests that build a second app clone a database inside the test body, as hooks do.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Every file clones the template database; more parallel files than this make the Docker
    // Postgres the bottleneck and unrelated tests time out at random on a 16-thread laptop.
    maxWorkers: 6,
    // Migrates a template database on the Docker Postgres once per run; fails with
    // a `pnpm db:start` hint when Postgres is missing.
    globalSetup: ["./src/platform/testing/global-setup.ts"],
    // Real-Postgres infrastructure tests run through `pnpm test:sync-infra`.
    exclude: [...configDefaults.exclude, "**/*.infra.test.ts"],
  },
});
