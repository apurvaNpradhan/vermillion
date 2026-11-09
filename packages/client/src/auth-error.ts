import type { TranslationKey } from "@workspace/i18n";

/** What Better Auth's client returns on failure. */
export type AuthFailure = { code?: string | undefined; status?: number | undefined };

const KEYS = new Map<string, TranslationKey>([
  ["ACCESS_DENIED", "auth__error_oauth_denied"],
  ["ACCOUNT_NOT_LINKED", "auth__error_account_linking"],
  ["UNABLE_TO_LINK_ACCOUNT", "auth__error_account_linking"],
  ["INVALID_OTP", "auth__error_code_invalid"],
  ["OTP_EXPIRED", "auth__error_code_expired"],
  ["TOO_MANY_ATTEMPTS", "auth__error_code_attempts"],
  ["INVALID_EMAIL", "auth__error_email_invalid"],
  ["CAPTCHA_FAILED", "errors__captcha_failed"],
  ["REGISTRATION_CLOSED", "errors__registration_closed"],
  ["DISPOSABLE_EMAIL_NOT_ALLOWED", "errors__disposable_email"],
  ["INVALID_TOKEN", "auth__error_invalid_token"],
  ["BANNED_USER", "auth__error_banned"],
]);

/** The translation key for a failed Better Auth call. The failure's own text is never shown. */
export function authErrorKey(failure: AuthFailure | null | undefined): TranslationKey {
  if (failure?.code) {
    const key = KEYS.get(failure.code);
    if (key) return key;
  }
  if (failure?.status === 429) return "errors__too_many_requests";
  return "auth__error_unknown";
}
