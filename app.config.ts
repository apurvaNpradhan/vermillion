/**
 * Single source of truth for app identity. Consumed by the apps and packages;
 * a template-init script (later phase) rewrites derived values from here.
 */
export const appConfig = {
  name: "vermillion",
  displayName: "vermillion",
  description: "vermillion is a web application",
  version: "1.0.0",
  urls: {
    web: "http://localhost:3001",
    server: "http://localhost:3000",
  },
  /** Public origin in production (web and API share it). Feeds the wrangler route and the EAS production profile. */
  productionUrl: "https://vermillion.example.com",
  /** Cloudflare DNS zone containing the production hostname (explicit for suffixes such as co.uk). */
  cloudflareZone: "example.com",
  ports: {
    web: 3001,
    server: 3000,
    native: 8081,
    postgres: 5432,
  },
  bundleIds: {
    ios: "com.anonymous.vermillion",
    android: "com.anonymous.vermillion",
  },
  scheme: "vermillion",
  /** Expo project id from `eas init`; enables EAS Update. Leave empty until the project exists. */
  easProjectId: "",
} as const;

export type AppConfig = typeof appConfig;
