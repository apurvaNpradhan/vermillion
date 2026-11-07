import { expo } from "@better-auth/expo";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@workspace/db";
import { uuidv7 } from "@workspace/db/columns";
import * as schema from "@workspace/db/schema/auth";
import {
  CLIENT_IP_HEADER,
  readCookie,
  LOCALE_COOKIE,
  resolveLocale,
  SYNC_JWKS_ROTATION_SECONDS,
  SYNC_JWT_AUDIENCE,
  SYNC_JWT_TTL_SECONDS,
  TURNSTILE_TOKEN_HEADER,
} from "@workspace/shared";
import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { admin as adminPlugin, jwt, lastLoginMethod, openAPI } from "better-auth/plugins";
import { z } from "zod";

import { isAdminRole, syncAdminRole } from "./admin-allowlist";
import { isDisposableEmail } from "./disposable-email";
import type { AuthEmail } from "./email-jobs";
import { assertStrongSecret } from "./secret";
import { verifyTurnstile } from "./turnstile";
import { parseUserAgent } from "./user-agent";

export { authEmailSchema, type AuthEmail } from "./email-jobs";
export {
  isAdminEmail,
  isAdminRole,
  parseAdminEmails,
  reconcileAdminRoles,
  syncAdminRole,
} from "./admin-allowlist";
export { isDisposableEmail } from "./disposable-email";
export { assertStrongSecret } from "./secret";
export { TURNSTILE_ACTION, verifyTurnstile, type TurnstileResult } from "./turnstile";

type OAuthCredentials = { clientId: string; clientSecret: string };

export type AuthOptions = {
  db: Database;
  /** Public origin of the app. Web and API share it, so cookies stay host-only. */
  baseUrl: string;
  secret: string;
  isProduction: boolean;
  /**
   * Expose Better Auth's OpenAPI schema at `/api/auth/open-api/generate-schema`.
   * The reference UI is the API's (`/api/reference`), never Better Auth's own page.
   */
  openApi?: boolean;
  /** Deep-link scheme of the native app, without "://". */
  appScheme: string;
  nativePort: number;
  registrationOpen: boolean;
  adminEmails: readonly string[];
  turnstileSecret?: string | undefined;
  google?: OAuthCredentials | undefined;
  github?: OAuthCredentials | undefined;
  /** Queues an email. Called off the request path via `runInBackground`. */
  queueEmail: (email: AuthEmail) => Promise<void>;
  /** Removes the user's data across verticals; runs before Better Auth deletes the user. */
  beforeDeleteUser: (user: { id: string }) => Promise<void>;
  /** Tracks promises that must not delay the response (and are drained on shutdown). */
  runInBackground: (promise: Promise<unknown>) => void;
  /** Replaced in tests; the CAPTCHA provider is a network boundary. */
  fetch?: typeof fetch;
};

const CAPTCHA_PATHS = new Set([
  "/sign-up/email",
  "/sign-in/email",
  "/request-password-reset",
  "/sign-in/social",
]);

/** Admin endpoints that would grant roles or act as another user. Admins come from ADMIN_EMAILS only. */
const BLOCKED_ADMIN_PATHS = new Set([
  "/admin/set-role",
  "/admin/create-user",
  "/admin/impersonate-user",
  "/admin/stop-impersonating",
]);

function requestDetails(request: Request | undefined) {
  const headers = request?.headers;
  const device = parseUserAgent(headers?.get("user-agent"));
  return {
    ip: headers?.get(CLIENT_IP_HEADER) ?? undefined,
    browser: device?.browser,
    os: device?.os,
    requestedAt: new Date().toISOString(),
    localeHint: resolveLocale({
      cookie: readCookie(headers?.get("cookie"), LOCALE_COOKIE),
      acceptLanguage: headers?.get("accept-language"),
    }),
  };
}

export function createAuth(options: AuthOptions) {
  const secret = assertStrongSecret(options.secret);
  const origin = new URL(options.baseUrl);
  const secure = origin.protocol === "https:";
  const admins = options.adminEmails;

  const notify = (email: AuthEmail) => options.runInBackground(options.queueEmail(email));

  const registrationAllowed = (email: string) =>
    options.registrationOpen || admins.includes(email.trim().toLowerCase());

  function assertMayRegister(email: string) {
    if (!registrationAllowed(email)) {
      throw new APIError("FORBIDDEN", {
        code: "REGISTRATION_CLOSED",
        message: "Registration is currently closed.",
      });
    }
    if (isDisposableEmail(email)) {
      throw new APIError("BAD_REQUEST", {
        code: "DISPOSABLE_EMAIL_NOT_ALLOWED",
        message: "Email addresses from disposable providers are not allowed.",
      });
    }
  }

  return betterAuth({
    baseURL: origin.origin,
    secret,
    database: drizzleAdapter(options.db, { provider: "pg", schema }),
    trustedOrigins: [
      origin.origin,
      `${options.appScheme}://`,
      ...(options.isProduction ? [] : ["exp://", `http://localhost:${options.nativePort}`]),
    ],
    emailAndPassword: {
      enabled: true,
      // Unverified accounts cannot sign in. This also makes sign-up answer
      // existing and new addresses identically (see `onExistingUserSignUp`).
      requireEmailVerification: true,
      autoSignIn: false,
      // Match the admin plugin defaults, not the existing account’s role/ban state.
      customSyntheticUser: ({ coreFields, id }) => ({
        ...coreFields,
        id,
        role: "user",
        banned: false,
        banReason: null,
        banExpires: null,
      }),
      minPasswordLength: 10,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }, request) => {
        notify({ kind: "reset-password", userId: user.id, url, request: requestDetails(request) });
      },
      onPasswordReset: async ({ user }, request) => {
        notify({ kind: "security-notice", userId: user.id, request: requestDetails(request) });
      },
      onExistingUserSignUp: async ({ user }, request) => {
        notify({
          kind: "existing-account",
          userId: user.id,
          url: `${origin.origin}/login`,
          request: requestDetails(request),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60,
      sendVerificationEmail: async ({ user, url }, request) => {
        notify({
          kind: "verification",
          userId: user.id,
          to: user.email,
          url,
          request: requestDetails(request),
        });
      },
    },
    user: {
      changeEmail: {
        enabled: true,
        sendChangeEmailConfirmation: async ({ user, newEmail, url }, request) => {
          notify({
            kind: "change-email",
            userId: user.id,
            url,
            newEmail,
            request: requestDetails(request),
          });
        },
      },
      deleteUser: {
        enabled: true,
        deleteTokenExpiresIn: 60 * 60,
        sendDeleteAccountVerification: async ({ user, url, token }, request) => {
          const callback = new URL(url).searchParams.get("callbackURL");
          // Only our explicit native confirmation destination receives a token. Web keeps the HTTPS callback.
          const confirmation =
            callback === `${options.appScheme}://confirm-deletion`
              ? `${callback}?token=${encodeURIComponent(token)}`
              : url;
          notify({
            kind: "delete-account",
            userId: user.id,
            url: confirmation,
            request: requestDetails(request),
          });
        },
        beforeDelete: async (user) => {
          await options.beforeDeleteUser(user);
        },
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        // A provider only attaches to a local account whose email is verified,
        // so nobody can pre-register an address and take over the real owner's
        // sign-in. (`requireLocalEmailVerified` defaults to true; not overridden.)
        allowDifferentEmails: false,
      },
    },
    socialProviders: {
      ...(options.google ? { google: options.google } : {}),
      ...(options.github ? { github: { ...options.github, scope: ["user:email"] } } : {}),
    },
    plugins: [
      expo(),
      lastLoginMethod(),
      adminPlugin({ defaultRole: "user", adminRoles: ["admin"] }),
      // Tokens for the PowerSync client only (ADR 0017). The session stays the
      // credential for the API; `disableSettingJwtHeader` keeps tokens out of
      // every other response.
      jwt({
        disableSettingJwtHeader: true,
        jwks: {
          keyPairConfig: { alg: "EdDSA", crv: "Ed25519" },
          rotationInterval: SYNC_JWKS_ROTATION_SECONDS,
        },
        jwt: {
          issuer: origin.origin,
          audience: SYNC_JWT_AUDIENCE,
          expirationTime: `${SYNC_JWT_TTL_SECONDS}s`,
          definePayload: () => ({}),
          getSubject: ({ user }) => user.id,
        },
      }),
      ...(options.openApi ? [openAPI({ disableDefaultReference: true })] : []),
    ],
    // No cookie cache: every request consults the session store, so a ban or a
    // deletion takes effect at once.
    session: {},
    rateLimit: {
      // On in every environment (Better Auth defaults to production only).
      // Counters live in process memory: no Redis, per instance, reset on restart.
      enabled: true,
      storage: "memory",
      window: 10,
      max: 100,
      customRules: {
        "/sign-up/email": { window: 60, max: 5 },
        "/sign-in/email": { window: 60, max: 10 },
        "/request-password-reset": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
        "/send-verification-email": { window: 60, max: 3 },
        "/change-email": { window: 60, max: 3 },
        "/delete-user": { window: 60, max: 3 },
        "/sign-in/social": { window: 60, max: 10 },
      },
    },
    databaseHooks: {
      user: {
        update: {
          // An email change or verification can add or remove entitlement.
          after: async (user) => {
            if (user) {
              await syncAdminRole(options.db, user, admins);
            }
          },
        },
        create: {
          before: async (user) => {
            // Backstop for provider sign-ups, which skip the sign-up endpoint.
            // Provider-verified emails still honour the policy; admins pass.
            assertMayRegister(user.email);
          },
          after: async (user) => {
            await syncAdminRole(options.db, user, admins);
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const [row] = await options.db
              .select()
              .from(schema.user)
              .where(eq(schema.user.id, session.userId))
              .limit(1);
            if (row) await syncAdminRole(options.db, row, admins);
          },
        },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        const session = ctx.context.newSession;
        if (
          session &&
          (ctx.path === "/sign-in/email" ||
            ctx.path.startsWith("/callback/") ||
            ctx.path === "/sign-in/social")
        ) {
          notify({
            kind: "sign-in-notice",
            userId: session.user.id,
            request: requestDetails(ctx.request),
          });
        }
      }),
      before: createAuthMiddleware(async (ctx) => {
        if (BLOCKED_ADMIN_PATHS.has(ctx.path)) {
          throw new APIError("FORBIDDEN", {
            code: "ADMIN_ROLE_MANAGED",
            message: "Administrators are set with ADMIN_EMAILS.",
          });
        }
        if (ctx.path === "/admin/update-user" && Object.hasOwn(ctx.body?.data ?? {}, "role")) {
          throw new APIError("FORBIDDEN", {
            code: "ADMIN_ROLE_MANAGED",
            message: "Administrators are set with ADMIN_EMAILS.",
          });
        }

        if (CAPTCHA_PATHS.has(ctx.path)) {
          const verdict = await verifyTurnstile(
            ctx.headers?.get(TURNSTILE_TOKEN_HEADER) ?? ctx.body?.turnstileToken,
            {
              secret: options.turnstileSecret,
              hostname: origin.hostname,
              isProduction: options.isProduction,
              ...(options.fetch ? { fetch: options.fetch } : {}),
            },
          );
          if (!verdict.ok) {
            throw new APIError("FORBIDDEN", { code: "CAPTCHA_FAILED", message: verdict.reason });
          }
        }

        const signUpEmail = z.string().safeParse(ctx.body?.email);
        const newEmail = z.string().safeParse(ctx.body?.newEmail);

        // The same answer for every address of that kind, so these checks reveal
        // nothing about which accounts exist.
        if (ctx.path === "/sign-up/email" && signUpEmail.success) {
          assertMayRegister(signUpEmail.data);
        }
        if (ctx.path === "/change-email" && newEmail.success) {
          if (isDisposableEmail(newEmail.data)) {
            throw new APIError("BAD_REQUEST", {
              code: "DISPOSABLE_EMAIL_NOT_ALLOWED",
              message: "Email addresses from disposable providers are not allowed.",
            });
          }
        }

        // Better Auth's admin remove-user skips `deleteUser.beforeDelete`, so the
        // data cleanup runs here, after confirming the caller is an admin.
        if (ctx.path === "/admin/remove-user") {
          const session = await getSessionFromCtx(ctx, {
            disableCookieCache: true,
            disableRefresh: true,
          });
          if (!session || !isAdminRole(session.user.role)) {
            throw new APIError("FORBIDDEN", { message: "Only administrators can remove users." });
          }
          const userId = z.string().min(1).safeParse(ctx.body?.userId);
          if (userId.success) {
            if (userId.data === session.user.id) {
              throw new APIError("BAD_REQUEST", { message: "You cannot remove yourself." });
            }
            await options.beforeDeleteUser({ id: userId.data });
          }
        }
      }),
    },
    advanced: {
      database: { generateId: () => uuidv7() },
      ipAddress: {
        // Set only by the server's client-IP middleware, never taken from a client.
        ipAddressHeaders: [CLIENT_IP_HEADER],
        trustedProxies: [],
      },
      // Host-only cookies (no Domain attribute); same origin in production.
      defaultCookieAttributes: { sameSite: "lax", secure, httpOnly: true },
      backgroundTasks: { handler: options.runInBackground },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];
