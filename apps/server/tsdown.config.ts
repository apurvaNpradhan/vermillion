import { defineConfig } from "tsdown";

export default defineConfig({
  // `sync-bootstrap.mjs` is the one-shot replication bootstrap job (ADR 0023).
  entry: { index: "./src/index.ts", "sync-bootstrap": "./src/sync-bootstrap.ts" },
  format: "esm",
  outDir: "./dist",
  clean: true,
  deps: {
    alwaysBundle: [/.*/],
  },
  // The server applies these on startup (db package: `migrationsFolder`).
  copy: [{ from: "../../packages/db/src/migrations", to: "dist" }],
});
