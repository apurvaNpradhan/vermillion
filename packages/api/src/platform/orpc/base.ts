import { openapi } from "@orpc/openapi";
import { ORPCError, os } from "@orpc/server";
import { isAdminEmail, isAdminRole, syncAdminRole } from "@workspace/auth";
import type { ErrorCode } from "@workspace/shared";
import { APIError } from "better-auth/api";

import type { Services } from "../services";

/** What the transport hands every procedure: the request headers and the process services. */
export type RequestContext = { headers: Headers; services: Services };

/**
 * Maps Better Auth failures to typed codes. Better Auth answers 401 for a
 * permission denial as well ("not allowed to ..."). By then `authed` has
 * verified the session, so a 401 from it is a refusal, not a lost session:
 * reporting it as UNAUTHORIZED would make the clients sign the user out.
 */
export const CODE_BY_STATUS = new Map<number, ErrorCode>([
  [400, "BAD_REQUEST"],
  [401, "FORBIDDEN"],
  [403, "FORBIDDEN"],
  [404, "NOT_FOUND"],
  [409, "CONFLICT"],
  [422, "BAD_REQUEST"],
  [429, "TOO_MANY_REQUESTS"],
  [502, "BAD_GATEWAY"],
]);

/** A Better Auth failure as a typed oRPC error; statuses without a code stay as they are. */
export function toOrpcError(error: APIError) {
  const code = CODE_BY_STATUS.get(error.statusCode);
  if (!code) return error;
  // Better Auth keeps its own code (e.g. REGISTRATION_CLOSED) in `body.code`
  // so clients can tell failures of one kind apart.
  const authCode = error.body?.code;
  return new ORPCError(code, {
    message: error.message,
    data: authCode ? { code: authCode } : undefined,
  });
}

/** Name of the OpenAPI security scheme for the Better Auth session cookie. */
export const SESSION_SCHEME = "sessionCookie";

/**
 * Procedure builder with the instance's typed error codes. Everything else is
 * built from `base` (public) or `authed` (signed-in) so clients can match on
 * `code` and show a translated message.
 */
export const base = os
  .$context<RequestContext>()
  .errors({
    BAD_REQUEST: {},
    UNAUTHORIZED: { message: "Unauthorized" },
    FORBIDDEN: {},
    NOT_FOUND: {},
    CONFLICT: {},
    TOO_MANY_REQUESTS: {},
    BAD_GATEWAY: {},
  })
  .use(async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      throw error instanceof APIError ? toOrpcError(error) : error;
    }
  });

/** The valid session for these headers, or null when there is none. Throws when the lookup itself fails. */
export async function readSession(context: RequestContext) {
  const session = await context.services.auth.api.getSession({ headers: context.headers });
  return session?.user && session.session ? session : null;
}

/**
 * Signed-in callers only; adds the user to the context. This is the single
 * seam a collaboration fork extends to require workspace membership.
 */
export const authed = base
  .meta(openapi({ spec: (operation) => ({ ...operation, security: [{ [SESSION_SCHEME]: [] }] }) }))
  .use(async ({ context, next }) => {
    const session = await readSession(context);
    if (!session) throw new ORPCError("UNAUTHORIZED");
    return next({
      context: { user: session.user, session: session.session, userId: session.user.id },
    });
  });

/** Instance administrators only (the `ADMIN_EMAILS` allowlist sets the role). */
export const admin = authed.use(async ({ context, next }) => {
  const { user } = context;
  const { adminEmails } = context.services.config;
  // The role column is a cache of the allowlist; authorization re-checks the
  // verified allowlist itself, so a stale role never grants access.
  if (!isAdminRole(user.role) || !isAdminEmail(user.email, user.emailVerified, adminEmails)) {
    await syncAdminRole(context.services.db, user, adminEmails);
    throw new ORPCError("FORBIDDEN", { message: "Administrator access is required" });
  }
  return next();
});
