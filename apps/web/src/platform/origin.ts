import { appConfig } from "./app-config";

/**
 * The site's own origin. In the browser that is where it was loaded from (the dev server or the
 * Worker), so `/rpc` and `/api` stay same-origin; while prerendering it is the production site.
 */
export function siteOrigin(): string {
  return typeof window === "undefined" ? appConfig.urls.site : window.location.origin;
}
