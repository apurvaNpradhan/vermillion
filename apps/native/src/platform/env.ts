import { createNativeEnv } from "@workspace/env/native";

/** Public build-time values only (see `@workspace/env/native`). Expo inlines each reference. */
export const env = createNativeEnv({
  EXPO_PUBLIC_SERVER_URL: process.env.EXPO_PUBLIC_SERVER_URL,
  EXPO_PUBLIC_TURNSTILE_SITE_KEY: process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY,
});
