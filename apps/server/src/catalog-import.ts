// Seeds the exercise catalog from the committed file when the table holds no catalog rows, then
// applies the Catalog patches. The server does this on every start (after migrations); run this
// to do it by hand: `pnpm --filter server catalog:import`. Once seeded, the catalog is edited in
// the admin.
import { runCatalogSeed } from "@workspace/api";
import { env } from "@workspace/env/server";
import { initLogger, log } from "@workspace/logger";

import { appConfig } from "../../../app.config";

initLogger({ env: { service: `${appConfig.name}-catalog-import` } });

try {
  await runCatalogSeed(env.DATABASE_URL, { patchGate: env.CATALOG_PATCH_GATE });
} catch (error) {
  log.error({
    action: "exercise.catalog.seed",
    message: error instanceof Error ? error.message : "Catalog seed failed",
  });
  process.exit(1);
}
