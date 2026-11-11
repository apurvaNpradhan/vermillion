/**
 * Single source of truth for app identity: name, URLs, ports, bundle ids, scheme and version.
 * Consumed by the apps and packages.
 */
export const appConfig = {
  name: "vermillion",
  displayName: "vermillion",
  description: "vermillion is a mobile application",
  version: "1.0.0",
  urls: {
    server: "http://localhost:3000",
    /** Public base URL of the exercise media bucket (thumbnails and videos; rows hold keys). */
    exerciseMedia: "https://media.lostsignal.cloud",
  },
  ports: {
    server: 3000,
    native: 8081,
    postgres: 5432,
    /** Development PowerSync service, bound to 127.0.0.1. */
    powersync: 8090,
  },
  bundleIds: {
    ios: "com.anonymous.vermillion",
    android: "com.anonymous.vermillion",
  },
  scheme: "vermillion",
  /** Expo project id from `eas init`; links EAS Build and enables EAS Update. */
  easProjectId: "0e4f60c6-c991-403e-9182-6212a8bca424",
} as const;

export type AppConfig = typeof appConfig;
