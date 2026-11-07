import type { MiddlewareHandler } from "hono";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Rejects state-changing browser requests from other origins. Browsers always
 * send `Origin` on cross-site and POST requests, so an absent header means a
 * native or server client (which brings its own credentials); a present one
 * must be this app's origin, so a hostile page can't ride the session cookie.
 */
export function requireTrustedOrigin(allowed: readonly string[]): MiddlewareHandler {
  const origins = new Set(allowed.map((value) => new URL(value).origin));
  return async (c, next) => {
    const origin = c.req.header("origin");
    if (!SAFE_METHODS.has(c.req.method) && origin !== undefined && !origins.has(origin)) {
      return c.json({ code: "FORBIDDEN", message: "Origin is not allowed" }, 403);
    }
    return next();
  };
}
