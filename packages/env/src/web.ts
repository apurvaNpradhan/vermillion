import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Public build-time values of the web app. Nothing secret belongs here: the
 * bundle is served to browsers and runs in a Worker. Pass the framework's own
 * env object, for example `createWebEnv(import.meta.env)`.
 */
export function createWebEnv(runtimeEnv: Record<string, string | boolean | number | undefined>) {
  return createEnv({
    clientPrefix: "VITE_",
    client: {
      /** Public origin of the app; web and API share it, so requests stay same-origin. */
      VITE_SERVER_URL: z.url(),
      /** Turnstile site key; the widget is shown only when it is set. */
      VITE_TURNSTILE_SITE_KEY: z.string().optional(),
    },
    runtimeEnv,
    emptyStringAsUndefined: true,
  });
}
