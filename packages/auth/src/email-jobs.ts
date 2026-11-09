import { storedLocaleSchema } from "@workspace/shared/locale";
import { z } from "zod";

/** Who asked, as far as a security email may say. Never the raw user agent. */
const requestSchema = z.object({
  ip: z.string().max(64).optional(),
  browser: z.string().max(64).optional(),
  os: z.string().max(64).optional(),
  requestedAt: z.string().max(40),
  /** Language of the request (cookie, then Accept-Language) for users with no saved language. */
  // A job queued before a language was removed must still be delivered, in the default one.
  localeHint: storedLocaleSchema,
});

const base = { userId: z.string().min(1), request: requestSchema };

/**
 * Sensitive outbox content (not the pg-boss payload). The recipient is resolved from `userId` when
 * the job runs. The code kinds carry `to` instead: a sign-in code may go to an address that has no
 * account yet (the account is created when the code is redeemed), and a change-email code goes to
 * the new address. Codes and links are short-lived and removed once delivered.
 */
export const authEmailSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("sign-in-code"),
    /** Set when the address already has an account; its saved language then wins. */
    userId: z.string().min(1).optional(),
    request: requestSchema,
    to: z.email(),
    otp: z.string().min(4).max(12),
  }),
  z.object({
    ...base,
    kind: z.literal("change-email-code"),
    to: z.email(),
    otp: z.string().min(4).max(12),
  }),
  z.object({ ...base, kind: z.literal("delete-account"), url: z.url() }),
  /** `to` overrides the account address: after an email change the notice goes to the old one. */
  z.object({ ...base, kind: z.literal("security-notice"), to: z.email().optional() }),
  z.object({ ...base, kind: z.literal("sign-in-notice") }),
]);
export type AuthEmail = z.infer<typeof authEmailSchema>;
