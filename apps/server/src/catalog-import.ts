// Imports the bundled exercise catalog into the database. The server does this on every start
// (after migrations); run this to do it by hand: `pnpm --filter server catalog:import [--force]`.
import { runCatalogImport } from "@workspace/api";
import { env } from "@workspace/env/server";
import { initLogger, log } from "@workspace/logger";

import { appConfig } from "../../../app.config";

initLogger({ env: { service: `${appConfig.name}-catalog-import` } });

try {
  await runCatalogImport(env.DATABASE_URL, process.argv.includes("--force"));
} catch (error) {
  log.error({
    action: "exercise.catalog.import",
    message: error instanceof Error ? error.message : "Catalog import failed",
  });
  process.exit(1);
}
