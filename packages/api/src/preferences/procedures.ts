import { localeSchema, preferencesSchema, updatePreferencesSchema } from "@workspace/shared";
import { openapi } from "@orpc/openapi";
import { z } from "zod";

import { authed, base, readSession } from "../platform/orpc/base";
import { rateLimit } from "../platform/orpc/rate-limit";
import { getPreferences } from "./operations/get-preferences";
import { resolveRequestLocale } from "./operations/resolve-request-locale";
import { updatePreferences } from "./operations/update-preferences";

const preferencesApi = authed.meta(openapi({ tags: ["Preferences"] }));

const get = preferencesApi
  .meta(openapi({ method: "GET", path: "/preferences", summary: "Get preferences" }))
  .output(preferencesSchema)
  .handler(({ context }) => getPreferences(context.services.db, context.userId));

const update = preferencesApi
  .meta(
    openapi({
      method: "PATCH",
      path: "/preferences",
      summary: "Update preferences",
      description: "Send only the fields to change.",
    }),
  )
  .use(rateLimit({ name: "preferences.update", windowMs: 60_000, max: 60 }))
  .input(updatePreferencesSchema)
  .output(preferencesSchema)
  .handler(({ context, input }) => updatePreferences(context.services.db, context.userId, input));

/** The language for this request, signed in or not. */
const locale = base
  .meta(
    openapi({
      tags: ["Preferences"],
      method: "GET",
      path: "/preferences/locale",
      summary: "Resolve the request language",
      description: "Works signed in or not: the saved preference first, then the request headers.",
    }),
  )
  .output(z.object({ locale: localeSchema }))
  .handler(async ({ context }) => {
    const session = await readSession(context);
    return {
      locale: await resolveRequestLocale(context.services.db, context.headers, session?.user.id),
    };
  });

export const preferencesRouter = { get, update, locale };
