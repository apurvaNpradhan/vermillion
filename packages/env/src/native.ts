import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

/**
 * Public values of the native app. Expo inlines `EXPO_PUBLIC_*` variables at
 * build time, so pass them explicitly:
 * `createNativeEnv({ EXPO_PUBLIC_SERVER_URL: process.env.EXPO_PUBLIC_SERVER_URL, ... })`.
 */
export function createNativeEnv(runtimeEnv: Record<string, string | undefined>) {
  return createEnv({
    clientPrefix: "EXPO_PUBLIC_",
    client: {
      /** Public origin of the API server (`https://api.<domain>` in production). */
      EXPO_PUBLIC_SERVER_URL: z.url(),
      /** Turnstile site key; the widget is shown only when it is set. */
      EXPO_PUBLIC_TURNSTILE_SITE_KEY: z.string().optional(),
    },
    runtimeEnv,
    emptyStringAsUndefined: true,
  });
}
