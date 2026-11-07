import { appConfig } from "@/platform/app-config";
import { env } from "@/platform/env";

import { seoHead } from "./head";

export { PUBLIC_PATHS } from "./public-paths";
export { buildRobots, buildSitemap } from "./sitemap";

/** The public origin of the site (web and API share it). */
export const siteOrigin = () => env.VITE_SERVER_URL;

/** `head()` for a route, filled with the app's name and origin. */
export function pageHead(input: {
  title?: string;
  description: string;
  path: string;
  noindex?: boolean;
}) {
  return seoHead({ appName: appConfig.displayName, origin: siteOrigin(), ...input });
}
