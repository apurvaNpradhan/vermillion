import { defineConfig, devices } from "@playwright/test";

import { appConfig } from "../../app.config";

const webUrl = appConfig.urls.web;
const serverUrl = appConfig.urls.server;
const databaseUrl =
  process.env.E2E_DATABASE_URL ?? "postgresql://postgres:password@localhost:5432/vermillion_e2e";

/**
 * Seam 2: the real web app behind the dev proxy, the real API server and a real
 * Postgres. Emails go to the log transport; the tests read links from the
 * server log. Ports come from app.config.ts, so stop your own `pnpm dev` first.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.artifacts/results",
  // Every test registers its own users, but a single worker keeps the dev server
  // and the in-memory rate limiters predictable.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: webUrl,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      cwd: "../server",
      // Recreate the database, then run the server with its log (and so the logged emails) in a file.
      command:
        "node ../web/e2e/support/prepare-database.mjs && pnpm exec tsx src/index.ts 2>&1 | tee ../web/e2e/.artifacts/server.log",
      url: `${serverUrl}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NODE_ENV: "development",
        APP_URL: webUrl,
        DATABASE_URL: databaseUrl,
        E2E_DATABASE_URL: databaseUrl,
        BETTER_AUTH_SECRET: "e2e-secret-000000000000000000000000000000",
        ADMIN_EMAILS: "e2e-admin@example.com",
        REGISTRATION_OPEN: "true",
        SYNC_ENDPOINT_URL: `http://127.0.0.1:${appConfig.ports.powersyncE2e}`,
      },
    },
    {
      command: "node e2e/support/powersync.mjs",
      // Playwright otherwise SIGKILLs the process tree, leaving the Docker container running.
      gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
      url: `http://127.0.0.1:${appConfig.ports.powersyncE2e}/probes/readiness`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        E2E_DATABASE_URL: databaseUrl,
        E2E_POWERSYNC_PORT: String(appConfig.ports.powersyncE2e),
        E2E_SERVER_PORT: String(appConfig.ports.server),
      },
    },
    {
      command: "pnpm exec vite dev",
      url: webUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: { VITE_SERVER_URL: webUrl },
    },
  ],
});
