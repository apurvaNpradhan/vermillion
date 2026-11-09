import { openapi } from "@orpc/openapi";
import { z } from "zod";

import { authed } from "../platform/orpc/base";
import { rateLimit } from "../platform/orpc/rate-limit";

/**
 * Only same-origin paths ("/x", never "//x" or "/\\x") and deep links into
 * this app's own scheme ("scheme://x") may receive the user; anything else
 * would be an open redirect.
 */
function isAllowedCallback(value: string, appScheme: string) {
  // oxlint-disable-next-line no-control-regex
  if (/[\u0000-\u0020\u007f\\]/.test(value)) return false;
  if (/^\/(?![/\\])/.test(value)) return true;
  return value.startsWith(`${appScheme}://`) && !value.slice(appScheme.length + 3).includes("@");
}

const currentUser = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  image: z.string().nullable(),
});

const accountApi = authed.meta(openapi({ tags: ["Account"] }));

const me = accountApi
  .meta(openapi({ method: "GET", path: "/account/me", summary: "Get the current user" }))
  .output(currentUser)
  .handler(({ context }) => ({
    id: context.user.id,
    name: context.user.name,
    email: context.user.email,
    emailVerified: context.user.emailVerified,
    image: context.user.image ?? null,
  }));

const updateProfile = accountApi
  .meta(openapi({ method: "PATCH", path: "/account/profile", summary: "Update the profile" }))
  .use(rateLimit({ name: "account.updateProfile", windowMs: 60_000, max: 20 }))
  .input(z.object({ name: z.string().trim().min(1).max(200) }))
  .output(z.object({ status: z.boolean() }))
  .handler(({ context, input }) =>
    context.services.auth.api.updateUser({ headers: context.headers, body: { name: input.name } }),
  );

/**
 * Starts account deletion: Better Auth emails a confirmation link, and the
 * account is deleted only when the user follows it (typed confirmation in the
 * client comes first).
 */
const requestDeletion = accountApi
  .meta(
    openapi({
      method: "POST",
      path: "/account/deletion",
      summary: "Request account deletion",
      description: "Emails a confirmation link; the account is deleted only when it is followed.",
    }),
  )
  .use(rateLimit({ name: "account.requestDeletion", windowMs: 60_000, max: 3 }))
  // Where the confirmation link sends the user afterwards: an in-app path for
  // web, or a deep link into the native app (checked against the app scheme).
  .input(z.object({ callbackURL: z.string().max(512).optional() }).optional())
  .output(z.object({ success: z.boolean() }))
  .handler(({ context, input, errors }) => {
    const callbackURL = input?.callbackURL;
    if (
      callbackURL !== undefined &&
      !isAllowedCallback(callbackURL, context.services.config.appScheme)
    ) {
      throw errors.BAD_REQUEST({ message: "Invalid callback URL." });
    }
    return context.services.auth.api.deleteUser({
      headers: context.headers,
      body: callbackURL ? { callbackURL } : {},
    });
  });

/** Redeems an emailed token with the native client’s session; never requires browser cookies. */
const confirmDeletion = accountApi
  .meta(
    openapi({
      method: "POST",
      path: "/account/deletion/confirm",
      summary: "Confirm account deletion",
      description: "Redeems the emailed token with the caller's own session.",
    }),
  )
  .use(rateLimit({ name: "account.confirmDeletion", windowMs: 60_000, max: 5 }))
  .input(z.object({ token: z.string().min(1).max(256) }))
  .output(z.object({ success: z.boolean() }))
  .handler(({ context, input }) =>
    context.services.auth.api.deleteUser({
      headers: context.headers,
      body: { token: input.token },
    }),
  );

export const accountRouter = { me, updateProfile, requestDeletion, confirmDeletion };
