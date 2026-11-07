import { ORPCError } from "@orpc/client";
import type { TranslationKey } from "@workspace/i18n";

/** Translation keys for the typed error codes the API throws. */
const CODE_KEYS = new Map<string, TranslationKey>([
  ["BAD_REQUEST", "errors__bad_request"],
  ["UNAUTHORIZED", "errors__unauthorized"],
  ["FORBIDDEN", "errors__forbidden"],
  ["NOT_FOUND", "errors__not_found"],
  ["CONFLICT", "errors__conflict"],
  ["TOO_MANY_REQUESTS", "errors__too_many_requests"],
  ["BAD_GATEWAY", "errors__bad_gateway"],
]);

/**
 * Keys for the finer `data.code` values the server attaches (a Better Auth code
 * such as `ADMIN_ROLE_MANAGED`, or a domain code a vertical throws). Add the
 * code here when you add it on the server.
 */
const DETAIL_KEYS = new Map<string, TranslationKey>([
  ["ADMIN_ROLE_MANAGED", "errors__admin_role_managed"],
  ["REGISTRATION_CLOSED", "errors__registration_closed"],
  ["DISPOSABLE_EMAIL_NOT_ALLOWED", "errors__disposable_email"],
  ["CAPTCHA_FAILED", "errors__captcha_failed"],
]);

/** What a failed query, mutation or call can throw. */
export type ApiError = Error | null | undefined;

/** The typed code of an API error, if it is one. */
export function errorCode(error: ApiError): string | undefined {
  return error instanceof ORPCError ? error.code : undefined;
}

/** Whether an error's `data` payload is an object carrying a string `code`. */
function hasStringCode(data: InstanceType<typeof ORPCError>["data"]): data is { code: string } {
  return (
    typeof data === "object" && data !== null && "code" in data && typeof data.code === "string"
  );
}

/** The finer-grained code some failures carry. */
export function detailCode(error: ApiError): string | undefined {
  if (!(error instanceof ORPCError)) return undefined;
  return hasStringCode(error.data) ? error.data.code : undefined;
}

/** True when the API says the session is gone (not merely that an action is forbidden). */
export function isUnauthorized(error: ApiError): boolean {
  return errorCode(error) === "UNAUTHORIZED";
}

/**
 * The translation key for an API error: the detail code's, else the typed
 * code's, else a generic one. The error's own text is server wording and is
 * never shown.
 */
export function errorMessageKey(error: ApiError): TranslationKey {
  const detail = detailCode(error);
  const code = errorCode(error);
  return (
    (detail ? DETAIL_KEYS.get(detail) : undefined) ??
    (code ? CODE_KEYS.get(code) : undefined) ??
    "errors__unknown"
  );
}
