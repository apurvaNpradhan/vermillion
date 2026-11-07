import { localeSchema } from "@workspace/shared/locale";
import { z } from "zod";

/** Who asked, as far as a security email may say. Never the raw user agent. */
const requestSchema = z.object({
  ip: z.string().max(64).optional(),
  browser: z.string().max(64).optional(),
  os: z.string().max(64).optional(),
  requestedAt: z.string().max(40),
  /** Language of the request (cookie, then Accept-Language) for users with no saved language. */
  localeHint: localeSchema,
});

const base = { userId: z.string().min(1), request: requestSchema };

/**
 * Sensitive outbox content (not the pg-boss payload). The recipient is resolved from `userId` when the
 * job runs; the one exception is `verification`, which can target a new address
 * during an email change and so carries `to`. Links carry short-lived tokens.
 */
export const authEmailSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("verification"), to: z.email(), url: z.url() }),
  z.object({ ...base, kind: z.literal("reset-password"), url: z.url() }),
  z.object({ ...base, kind: z.literal("change-email"), url: z.url(), newEmail: z.email() }),
  z.object({ ...base, kind: z.literal("delete-account"), url: z.url() }),
  z.object({ ...base, kind: z.literal("existing-account"), url: z.url() }),
  z.object({ ...base, kind: z.literal("security-notice") }),
  z.object({ ...base, kind: z.literal("sign-in-notice") }),
]);
export type AuthEmail = z.infer<typeof authEmailSchema>;
