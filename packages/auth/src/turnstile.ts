import { TURNSTILE_ACTION } from "@workspace/shared";
import { z } from "zod";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** A token as a client may send it; anything but a short string is refused. */
export type CaptchaToken = string | null | undefined;

export type TurnstileResult = { ok: true } | { ok: false; reason: string };

export { TURNSTILE_ACTION };

export type TurnstileOptions = {
  /** Secret key; when unset the check is skipped (CAPTCHA is opt-in per deployment). */
  secret: string | undefined;
  /** Hostname the widget ran on; the response must report the same one. */
  hostname: string;
  isProduction: boolean;
  fetch?: typeof fetch;
};

const tokenSchema = z.string().min(1).max(2048);

const verdictSchema = z.object({
  success: z.literal(true),
  action: z.literal(TURNSTILE_ACTION),
  hostname: z.string(),
});

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/**
 * Strict Turnstile verification. Fails closed on every doubt: a missing or
 * oversized token, a lookup error or timeout, a non-success answer, a wrong
 * action or hostname, and localhost in production. One token is redeemed at
 * initiation only, never again at an OAuth callback.
 */
export async function verifyTurnstile(
  token: CaptchaToken,
  { secret, hostname, isProduction, fetch: doFetch = fetch }: TurnstileOptions,
): Promise<TurnstileResult> {
  if (!secret) return { ok: true };
  const failure = { ok: false, reason: "Captcha verification failed." } as const;
  const parsedToken = tokenSchema.safeParse(token);
  if (!parsedToken.success) return failure;
  if (isProduction && LOCAL_HOSTS.includes(hostname)) return failure;
  try {
    const response = await doFetch(VERIFY_URL, {
      method: "POST",
      body: new URLSearchParams({ secret, response: parsedToken.data }),
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return failure;
    const verdict = verdictSchema.safeParse(await response.json());
    if (verdict.success && verdict.data.hostname === hostname) return { ok: true };
  } catch {
    // Fail closed without retaining the token, the secret or an upstream body.
  }
  return failure;
}
