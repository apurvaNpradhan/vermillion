import { defineConfig } from "vitest/config";

// Unit tests live next to the code; browser tests are Playwright's (e2e/).
export default defineConfig({
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
