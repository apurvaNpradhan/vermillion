import type { ObjectStoreConfig } from "../media/index";
import type { SlotLagThresholds } from "./sync/slot-lag";

/**
 * Everything the API needs to know about its deployment. The server builds it
 * from validated environment variables; tests build it by hand.
 */
export type ApiConfig = {
  appName: string;
  /** Version of the app; the API document reports it. */
  appVersion: string;
  /** Public origin of the API (`https://cinnabar-api.<domain>` in production). Auth links are built from it. */
  appUrl: string;
  /** Public origin of the site and admin (`https://cinnabar.<domain>`); trusted like the API's. */
  siteUrl: string;
  /** Lower-cased `ADMIN_EMAILS`. The only source of the admin role; may be empty. */
  adminEmails: string[];
  /** Deep-link scheme of the native app, without "://". */
  appScheme: string;
  nativePort: number;
  isProduction: boolean;
  authSecret: string;
  /** Comma-separated IPs/CIDRs allowed to set X-Forwarded-For, or "none". */
  trustedProxies: string;
  registrationOpen: boolean;
  turnstileSecret?: string | undefined;
  google?: { clientId: string; clientSecret: string } | undefined;
  github?: { clientId: string; clientSecret: string } | undefined;
  /** Serve the OpenAPI reference (off in production by default). */
  openApiReference: boolean;
  /** The private bucket of user media (ADR 0040). */
  media: ObjectStoreConfig;
  /**
   * The public bucket of catalog exercise media. The admin uploads to it through presigned URLs;
   * `publicUrl` is where its objects are read (`https://media.<domain>` in production).
   */
  exerciseMedia: ObjectStoreConfig & { publicUrl: string };
  /** The public GitHub repository whose Releases hold the Android builds. */
  releases: { owner: string; repo: string };
  sync: {
    /** Public URL of the PowerSync service, handed to clients by `sync.credentials`. */
    endpoint?: string | undefined;
    /** Replication slot lag (bytes of WAL behind) that logs a warning, and that degrades readiness. */
    slotLag: SlotLagThresholds;
  };
};
