/**
 * Single source of truth for app identity: name, URLs, ports, bundle ids, scheme and version.
 * Consumed by the apps and packages.
 *
 * Every public host derives from `domain`. Moving to the final domain means changing it here,
 * then the derived names that cannot import this file (compose, EAS profiles, workflow variables);
 * see docs/deployment.md, "Moving to the final domain".
 */
const domain = "lostsignal.cloud";
/** The product slug used for the scheme, bundle id suffix and host prefixes. */
const name = "sigil";
/** Typed so a fingerprint can be added without widening the config. */
const androidCertSha256: readonly string[] = [];

export const appConfig = {
  name,
  displayName: "Sigil",
  tagline: "Hit your reps. The weight goes up.",
  description: "Sigil is a private strength-training log",
  /** Longer line for store listings and the site. */
  subtitle: "A private log for training — and soon, food.",
  /** Contact for support, privacy and deletion requests, and where "Send feedback" in Settings writes to. */
  supportEmail: "apurvanarayanpradhan@gmail.com",
  /** Who runs the service, named on the legal pages. */
  operator: { name: "Apurva Pradhan", country: "India" },
  version: "0.1.0",
  /** Base domain of every public host. */
  domain,
  urls: {
    server: "http://localhost:3000",
    /** The public website (`apps/web` on a Cloudflare Worker): landing, legal pages, download. */
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
  /**
   * Android App Links (ADR 0058): the SHA-256 fingerprints of the certificates the installed APK
   * is signed with, colon-separated hex (`AA:BB:…`, 32 bytes). The site publishes them at
   * `/.well-known/assetlinks.json`; until one is set the file is empty and links open in the
   * browser. Get the release one with `keytool -list -v -keystore <release keystore>`; add the
   * debug or EAS key as a second entry to verify development builds.
   */
  androidCertSha256,
  /** The public GitHub repository whose Releases hold the Android builds. */
  releases: { owner: "apurvaNpradhan", repo: "vermillion" },
  /** Slug of the existing Expo project linked by easProjectId. */
  easSlug: "vermillion",
  /** Expo project id from `eas init`; links EAS Build and enables EAS Update. */
  easProjectId: "0e4f60c6-c991-403e-9182-6212a8bca424",
} as const;

export type AppConfig = typeof appConfig;
