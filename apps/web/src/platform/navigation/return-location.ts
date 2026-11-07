import { z } from "zod";

/** Where a signed-in user lands when no (valid) return location was given. */
export const DEFAULT_RETURN_LOCATION = "/app";

/** Pages that must never be a return target: returning there would loop or confuse. */
const AUTH_PATHS = new Set(["/login", "/sign-up", "/forgot-password", "/reset-password"]);

/** Router search params are parsed JSON at runtime, so `raw` may not be a string at all. */
const rawLocationSchema = z.string().min(1).max(2048);

/** Backslashes and control characters (including newlines) have no place in a path. */
function hasUnsafeCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (character === "\\" || code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * A safe in-app path to return to after sign-in, or the fallback. Only a
 * single-slash path is accepted, so the redirect can never leave this origin:
 * absolute URLs, protocol-relative `//host`, backslash tricks, control
 * characters and the auth pages themselves are all refused.
 */
export function safeReturnLocation(
  raw: string | null | undefined,
  fallback: string = DEFAULT_RETURN_LOCATION,
): string {
  const parsed = rawLocationSchema.safeParse(raw);
  if (!parsed.success) return fallback;
  const location = parsed.data;
  if (!location.startsWith("/") || location.startsWith("//") || location.startsWith("/\\"))
    return fallback;
  if (hasUnsafeCharacter(location)) return fallback;
  let url: URL;
  try {
    // A throwaway origin: the result must resolve to exactly the path we were given.
    url = new URL(location, "http://return.invalid");
  } catch {
    return fallback;
  }
  if (url.origin !== "http://return.invalid") return fallback;
  if (AUTH_PATHS.has(url.pathname.replace(/\/+$/, "") || "/")) return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}
