import { defineConfig } from "tsdown";

// Development only: a self-contained bundle the compose bootstrap service runs
// on a plain Node image, without building the whole server.
export default defineConfig({
  entry: { "sync-bootstrap": "./src/sync-bootstrap.ts" },
  format: "esm",
  outDir: "./dist-bootstrap",
  clean: true,
  deps: { alwaysBundle: [/.*/] },
});
