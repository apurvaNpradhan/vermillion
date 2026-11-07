import { defineConfig } from "vitest/config";

// Root project: repo tooling tests (lint plugin). Packages and apps run their
// own `test` script through Turborepo once they have tests.
export default defineConfig({
  test: {
    include: ["scripts/**/*.test.mjs", "tools/**/*.test.ts"],
    passWithNoTests: true,
  },
});
