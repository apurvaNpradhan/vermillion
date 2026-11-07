import type { Locale } from "@workspace/shared/locale";

/** Where a security-relevant request came from. */
export type RequestDetails = {
  ip?: string;
  browser?: string;
  os?: string;
  /** ISO timestamp, shown in UTC. */
  requestedAt?: string;
};

type Base = {
  /** Recipient address. */
  to: string;
  name: string;
  locale: Locale;
  appName: string;
  request?: RequestDetails;
};

/** Every email the template sends. Add a variant here, a template, and copy in the i18n package. */
export type EmailInput = Base &
  (
    | { template: "verification"; url: string }
    | { template: "reset-password"; url: string }
    | { template: "change-email"; url: string; newEmail: string }
    | { template: "delete-account"; url: string }
    | { template: "security-notice" }
    | { template: "sign-in-notice" }
    | { template: "existing-account"; url: string }
  );

export type RenderedEmail = { to: string; subject: string; html: string; text: string };
