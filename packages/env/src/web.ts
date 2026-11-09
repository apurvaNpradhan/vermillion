import { createEnv } from "@t3-oss/env-core";
import { APPLE_TEAM_ID_PATTERN, CERT_SHA256_PATTERN, parseCsv } from "@workspace/shared";
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
      /**
       * Comma-separated SHA-256 fingerprints of the Android signing certificates. Public: they
       * are published at /.well-known/assetlinks.json. Unset serves 404 there.
       */
      VITE_ANDROID_CERT_SHA256: z
        .string()
        .refine(
          (value) =>
            parseCsv(value).every((entry) => CERT_SHA256_PATTERN.test(entry.toUpperCase())),
          "VITE_ANDROID_CERT_SHA256 must be colon-separated SHA-256 fingerprints",
        )
        .optional(),
      /** Apple Developer team id, published at /.well-known/apple-app-site-association. */
      VITE_APPLE_TEAM_ID: z
        .string()
        .regex(APPLE_TEAM_ID_PATTERN, "VITE_APPLE_TEAM_ID must be 10 uppercase letters or digits")
        .optional(),
    },
    runtimeEnv,
    emptyStringAsUndefined: true,
  });
}
