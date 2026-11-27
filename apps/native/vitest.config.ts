import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // One worker per thread starts 15 at once beside the API suite; on a 14 GB laptop workers
    // were killed while starting (SIGKILL). Six keep the run as fast and stop the kills.
    maxWorkers: 6,
  },
});
