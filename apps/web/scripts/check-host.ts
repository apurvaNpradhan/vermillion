import { fileURLToPath } from "node:url";
import { unstable_readConfig, type Unstable_Config } from "wrangler";

import { appConfig } from "../../../app.config.ts";

/**
 * wrangler.jsonc cannot import app.config.ts, so its custom domain is written out. This fails
 * the deploy when the two disagree.
 */
const expected = new URL(appConfig.urls.site).hostname;
const { routes } = unstable_readConfig({
  config: fileURLToPath(new URL("../wrangler.jsonc", import.meta.url)),
});
const [route] = routes ?? [];

function isCustomDomain(
  route: NonNullable<Unstable_Config["routes"]>[number] | undefined,
): route is { pattern: string; custom_domain: true } {
  return (
    !!route && typeof route !== "string" && "custom_domain" in route && route.custom_domain === true
  );
}

if (routes?.length !== 1 || !isCustomDomain(route) || route.pattern !== expected) {
  console.error(
    `wrangler.jsonc must have exactly one route with pattern "${expected}" and custom_domain: true.`,
  );
  process.exit(1);
}
console.log(`wrangler.jsonc custom domain matches app.config.ts: ${expected}`);
