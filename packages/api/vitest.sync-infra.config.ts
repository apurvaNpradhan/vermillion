import { defineConfig } from "vitest/config";

// Needs the compose Postgres (`pnpm db:start`); skips with a message otherwise.
export default defineConfig({
  test: { include: ["src/**/*.infra.test.ts"], testTimeout: 60_000, hookTimeout: 60_000 },
});
