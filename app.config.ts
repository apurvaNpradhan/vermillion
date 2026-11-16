/**
 * Single source of truth for app identity: name, URLs, ports, bundle ids, scheme and version.
 * Consumed by the apps and packages.
 *
 * Every public host derives from `domain`. Moving to the final domain means changing it here,
 * then the derived names that cannot import this file (compose, EAS profiles, workflow variables,
 * `apps/web/wrangler.jsonc`); see docs/deployment.md, "Moving to the final domain".
 */
const domain = "lostsignal.cloud";

export const appConfig = {
  name: "cinnabar",
  displayName: "Cinnabar",
  description: "Cinnabar is a training log for lifting",
  version: "1.0.0",
  /** Base domain of every public host. */
  domain,
  urls: {
    server: "http://localhost:3000",
    /** The public site and admin (`apps/web`). */
    site: `https://cinnabar.${domain}`,
    /** The API in production (`apps/server`). The native app and the site's Worker call it. */
    api: `https://cinnabar-api.${domain}`,
    /** The PowerSync service in production. */
    sync: `https://cinnabar-sync.${domain}`,
    /** Public base URL of the exercise media bucket (thumbnails and videos; rows hold keys). */
    exerciseMedia: `https://media.${domain}`,
  },
  ports: {
    server: 3000,
    native: 8081,
    /** Development server of the site (`apps/web`); proxies `/rpc` and `/api` to the server. */
    web: 3001,
    postgres: 5432,
    /** Development PowerSync service, bound to 127.0.0.1. */
    powersync: 8090,
  },
  bundleIds: {
    ios: "io.github.apurvanpradhan.cinnabar",
    android: "io.github.apurvanpradhan.cinnabar",
  },
  scheme: "cinnabar",
  /** The public GitHub repository whose Releases hold the Android builds. */
  releases: { owner: "apurvaNpradhan", repo: "vermillion" },
  /** Expo project id from `eas init`; links EAS Build and enables EAS Update. */
  easProjectId: "0e4f60c6-c991-403e-9182-6212a8bca424",
} as const;

export type AppConfig = typeof appConfig;
