import { defineConfig } from "tsdown";

export default defineConfig({
  entry: "./src/index.ts",
  format: "esm",
  outDir: "./dist",
  clean: true,
  deps: {
    alwaysBundle: [/.*/],
  },
  // The server applies these on startup (db package: `migrationsFolder`).
  copy: [{ from: "../../packages/db/src/migrations", to: "dist" }],
});
