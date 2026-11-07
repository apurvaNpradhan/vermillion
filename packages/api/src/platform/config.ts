import type { SlotLagThresholds } from "./sync/slot-lag";

/**
 * Everything the API needs to know about its deployment. The server builds it
 * from validated environment variables; tests build it by hand.
 */
export type ApiConfig = {
  appName: string;
  /** Version of the app; the API document reports it. */
  appVersion: string;
  /** Public origin of the app. Web and API share it in production. */
  appUrl: string;
  /** Deep-link scheme of the native app, without "://". */
  appScheme: string;
  nativePort: number;
  isProduction: boolean;
  authSecret: string;
  /** Comma-separated IPs/CIDRs allowed to set X-Forwarded-For, or "none". */
  trustedProxies: string;
  registrationOpen: boolean;
  adminEmails: string[];
  turnstileSecret?: string | undefined;
  google?: { clientId: string; clientSecret: string } | undefined;
  github?: { clientId: string; clientSecret: string } | undefined;
  /** Serve the OpenAPI reference (off in production by default). */
  openApiReference: boolean;
  sync: {
    /** Replication slot lag (bytes of WAL behind) that logs a warning, and that degrades readiness. */
    slotLag: SlotLagThresholds;
  };
};
