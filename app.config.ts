/**
 * Single source of truth for app identity: name, URLs, ports, bundle ids, scheme and version.
 * Consumed by the apps and packages.
 *
 * Every public host derives from `domain`. Moving to the final domain means changing it here,
 * then the derived names that cannot import this file (compose, EAS profiles, workflow variables);
 * see docs/deployment.md, "Moving to the final domain".
 */
const domain = "lostsignal.cloud";
/** The product slug: EAS slug, scheme, bundle id suffix and the host prefixes below. */
const name = "patina";

export const appConfig = {
  name,
  displayName: "Patina",
  description: "Patina is a calm, private training log",
  /** Short line shown with the name (welcome screen, README). */
  tagline: "Quiet progress.",
  /** Longer line for store listings and the site. */
  subtitle: "A private log for training — and soon, food.",
  /** Where "Send feedback" in Settings writes to. A placeholder on the base domain until a real inbox exists. */
  supportEmail: `support@${domain}`,
  version: "0.1.0",
  /** Base domain of every public host. */
  domain,
  urls: {
    server: "http://localhost:3000",
    /** Existing public site used for account, invite and update links. */
    site: `https://${name}.${domain}`,
    /** The API in production (`apps/server`). */
    api: `https://${name}-api.${domain}`,
    /** The PowerSync service in production. */
    sync: `https://${name}-sync.${domain}`,
    /** Public base URL of the exercise media bucket (thumbnails and videos; rows hold keys). */
    exerciseMedia: `https://media.${domain}`,
  },
  ports: {
    server: 3000,
    native: 8081,
    /** Reserved local site origin for auth and invite compatibility. */
    web: 3001,
    postgres: 5432,
    /** Development PowerSync service, bound to 127.0.0.1. */
    powersync: 8090,
  },
  bundleIds: {
    ios: `io.github.apurvanpradhan.${name}`,
    android: `io.github.apurvanpradhan.${name}`,
  },
  scheme: name,
  /** The public GitHub repository whose Releases hold the Android builds. */
  releases: { owner: "apurvaNpradhan", repo: "vermillion" },
  /** Expo project id from `eas init`; links EAS Build and enables EAS Update. */
  easProjectId: "0e4f60c6-c991-403e-9182-6212a8bca424",
} as const;

export type AppConfig = typeof appConfig;
