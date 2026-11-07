import { defineConfig, devices } from "@playwright/test";

// Test-only override: lets the suite run while the dev ports are taken by another stack.
const port = Number(process.env.OFFLINE_E2E_PORT ?? 4300);
const origin = `http://localhost:${port}`;

/**
 * Seam 2 for the offline shell (ADR 0020): the production build served by `vite preview` (the
 * same workerd runtime as the deployed Worker), no API and no database. The test closes the app,
 * goes offline and opens it again, which an already loaded dev tab cannot prove.
 */
export default defineConfig({
  testDir: "./e2e-offline",
  outputDir: "./e2e-offline/.artifacts/results",
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: origin, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec vite build && pnpm exec vite preview --port ${port} --strictPort`,
    url: `${origin}/_shell`,
    reuseExistingServer: false,
    timeout: 240_000,
    env: { VITE_SERVER_URL: origin },
  },
});
