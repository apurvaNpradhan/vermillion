import { expo } from "@better-auth/expo";
import { passkey } from "@better-auth/passkey";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@workspace/db";
import { uuidv7 } from "@workspace/db/columns";
import * as schema from "@workspace/db/schema/auth";
import {
  CLIENT_IP_HEADER,
  OTP_ALLOWED_ATTEMPTS,
  OTP_EXPIRY_SECONDS,
  OTP_LENGTH,
  isAndroidOrigin,
  readCookie,
  LOCALE_COOKIE,
  resolveLocale,
  SYNC_JWKS_ROTATION_SECONDS,
  SYNC_JWT_AUDIENCE,
  SYNC_JWT_TTL_SECONDS,
  TURNSTILE_TOKEN_HEADER,
} from "@workspace/shared";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP, jwt, lastLoginMethod, openAPI } from "better-auth/plugins";
import { z } from "zod";

import { isDisposableEmail } from "./disposable-email";
import type { AuthEmail } from "./email-jobs";
import { assertStrongSecret } from "./secret";
import { verifyTurnstile } from "./turnstile";
import { parseUserAgent } from "./user-agent";

export { authEmailSchema, type AuthEmail } from "./email-jobs";
// Re-exported so the declaration of `createAuth` can name the passkey plugin's WebAuthn types.
export type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/server";
export { isDisposableEmail } from "./disposable-email";
export { assertStrongSecret } from "./secret";
export { TURNSTILE_ACTION, verifyTurnstile, type TurnstileResult } from "./turnstile";

type OAuthCredentials = { clientId: string; clientSecret: string };

export type AuthOptions = {
  db: Database;
  /** Public origin of the API (`https://api.<domain>`); auth cookies stay host-only. */
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
  /**
   * WebAuthn relying party. `origins` is the complete list a ceremony may come from (HTTPS origins
   * and `android:apk-key-hash:` origins); the request cannot add to it.
   */
  passkey: { rpId: string; rpName: string; origins: readonly string[] };
  registrationOpen: boolean;
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

const SEND_CODE_PATH = "/email-otp/send-verification-otp";
const REQUEST_EMAIL_CHANGE_PATH = "/email-otp/request-email-change";
const CHANGE_EMAIL_PATH = "/email-otp/change-email";

/** An account this young was created by the sign-in that is being reported. */
const NEW_ACCOUNT_MS = 30_000;

/** A code is requested here, so the CAPTCHA runs before one is sent. Social starts at initiation. */
const CAPTCHA_PATHS = new Set([SEND_CODE_PATH, "/sign-in/social"]);

/**
 * Parts of the email-OTP plugin we do not use. Sign-in codes are the only kind a person can ask
 * for, so the verify-email, check and password-reset endpoints stay closed.
 */
const DISABLED_OTP_PATHS = new Set([
  "/email-otp/verify-email",
  "/email-otp/check-verification-otp",
  "/email-otp/request-password-reset",
  "/email-otp/reset-password",
  "/forget-password/email-otp",
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

  const notify = (email: AuthEmail) => options.runInBackground(options.queueEmail(email));

  function assertNotDisposable(email: string) {
    if (isDisposableEmail(email)) {
      throw new APIError("BAD_REQUEST", {
        code: "DISPOSABLE_EMAIL_NOT_ALLOWED",
        message: "Email addresses from disposable providers are not allowed.",
      });
    }
  }

  function assertMayRegister(email: string) {
    if (!options.registrationOpen) {
      throw new APIError("FORBIDDEN", {
        code: "REGISTRATION_CLOSED",
        message: "Registration is currently closed.",
      });
    }
    assertNotDisposable(email);
  }

  return betterAuth({
    baseURL: origin.origin,
    secret,
    database: drizzleAdapter(options.db, { provider: "pg", schema }),
    trustedOrigins: [
      origin.origin,
      `${options.appScheme}://`,
      ...(options.isProduction ? [] : ["exp://", `http://localhost:${options.nativePort}`]),
      // Other HTTPS origins of the app (a dev tunnel, a preview host). Android origins are not
      // HTTP origins: the passkey plugin checks them against `passkey.origins` instead.
      ...options.passkey.origins.filter((entry) => !isAndroidOrigin(entry)),
    ],
    user: {
      deleteUser: {
        enabled: true,
        deleteTokenExpiresIn: 60 * 60,
        sendDeleteAccountVerification: async ({ user, url, token }, request) => {
          const callback = new URL(url).searchParams.get("callbackURL");
          // Only our explicit native confirmation destination receives a token. Any other callback keeps Better Auth's HTTPS link.
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
      // Passkeys sign in an existing account and are added from a signed-in session (fresh,
      // the plugin default); they never create accounts. See ADR 0032.
      passkey({
        rpID: options.passkey.rpId,
        rpName: options.passkey.rpName,
        origin: [...options.passkey.origins],
      }),
      // Email codes are the only way in besides social providers (ADR 0029). Every new address
      // gets a code and every code is redeemed through sign-in, so the answer is the same
      // whether or not the account exists, and the account is created verified on first redeem.
      emailOTP({
        otpLength: OTP_LENGTH,
        expiresIn: OTP_EXPIRY_SECONDS,
        allowedAttempts: OTP_ALLOWED_ATTEMPTS,
        // The database never holds a usable code, and "send again" replaces the old one.
        storeOTP: "hashed",
        resendStrategy: "rotate",
        // The code goes to the new address; the current session is the proof of the old one.
        changeEmail: { enabled: true, verifyCurrentEmail: false },
        sendVerificationOTP: async ({ email, otp, type }, ctx) => {
          const request = requestDetails(ctx?.request);
          if (type === "sign-in") {
            const existing = await ctx?.context.internalAdapter.findUserByEmail(email);
            notify({
              kind: "sign-in-code",
              to: email,
              otp,
              request,
              ...(existing ? { userId: existing.user.id } : {}),
            });
            return;
          }
          if (type === "change-email") {
            const userId = ctx?.context.session?.user.id;
            if (userId) notify({ kind: "change-email-code", userId, to: email, otp, request });
          }
        },
      }),
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
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      freshAge: 60 * 60 * 24,
    },
    rateLimit: {
      // On in every environment (Better Auth defaults to production only).
      // Counters live in process memory: no Redis, per instance, reset on restart.
      enabled: true,
      storage: "memory",
      window: 10,
      max: 100,
      customRules: {
        [SEND_CODE_PATH]: { window: 60, max: 3 },
        "/sign-in/email-otp": { window: 60, max: 10 },
        [REQUEST_EMAIL_CHANGE_PATH]: { window: 60, max: 3 },
        [CHANGE_EMAIL_PATH]: { window: 60, max: 3 },
        "/delete-user": { window: 60, max: 3 },
        "/sign-in/social": { window: 60, max: 10 },
        "/passkey/generate-authenticate-options": { window: 60, max: 20 },
        "/passkey/verify-authentication": { window: 60, max: 10 },
        "/passkey/verify-registration": { window: 60, max: 10 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            // Backstop for provider sign-ups, which skip the sign-up endpoint.
            assertMayRegister(user.email);
          },
        },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        const session = ctx.context.newSession;
        if (
          session &&
          (ctx.path === "/sign-in/email-otp" ||
            ctx.path === "/passkey/verify-authentication" ||
            ctx.path.startsWith("/callback/") ||
            ctx.path === "/sign-in/social")
        ) {
          // The first code of a new account is the sign-up itself, not news to its owner.
          const signedUp =
            ctx.path === "/sign-in/email-otp" &&
            Date.now() - session.user.createdAt.getTime() < NEW_ACCOUNT_MS;
          if (!signedUp) {
            notify({
              kind: "sign-in-notice",
              userId: session.user.id,
              request: requestDetails(ctx.request),
            });
          }
        }
        // The old address learns the change happened; the session still describes it. The plugin
        // has replaced the address by now, so the job is told where to send it.
        const previous = ctx.context.session?.user;
        if (
          ctx.path === CHANGE_EMAIL_PATH &&
          previous &&
          !(ctx.context.returned instanceof APIError)
        ) {
          notify({
            kind: "security-notice",
            userId: previous.id,
            to: previous.email,
            request: requestDetails(ctx.request),
          });
        }
      }),
      before: createAuthMiddleware(async (ctx) => {
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

        if (DISABLED_OTP_PATHS.has(ctx.path)) {
          throw new APIError("NOT_FOUND", { message: "Not found" });
        }

        const email = z.string().safeParse(ctx.body?.email);
        const newEmail = z.string().safeParse(ctx.body?.newEmail);

        if (ctx.path === SEND_CODE_PATH && email.success) {
          // Only sign-in codes can be asked for; the other kinds are for flows we do not run.
          if (ctx.body?.type !== "sign-in") {
            throw new APIError("BAD_REQUEST", { message: "Invalid code type." });
          }
          // Same answer for every address ...
          assertNotDisposable(email.data);
          // ... except while registration is closed, when an unknown address is refused up front
          // instead of being sent a code that could never be redeemed.
          if (!options.registrationOpen) {
            const existing = await ctx.context.internalAdapter.findUserByEmail(
              email.data.trim().toLowerCase(),
            );
            if (!existing) assertMayRegister(email.data);
          }
        }
        if (ctx.path === REQUEST_EMAIL_CHANGE_PATH && newEmail.success) {
          assertNotDisposable(newEmail.data);
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
