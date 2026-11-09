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
    | { template: "sign-in-code"; otp: string; existingAccount?: boolean }
    | { template: "change-email-code"; otp: string }
    | { template: "delete-account"; url: string }
    | { template: "security-notice" }
    | { template: "sign-in-notice" }
  );

export type RenderedEmail = { to: string; subject: string; html: string; text: string };
