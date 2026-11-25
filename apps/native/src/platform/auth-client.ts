import { expoClient } from "@better-auth/expo/client";
import { createAppAuthClient } from "@workspace/client/auth-client";
import { randomUUID } from "expo-crypto";
import { createURL } from "expo-linking";
import * as SecureStore from "expo-secure-store";

import { appConfig } from "./app-config";
import { env } from "./env";
import { AUTH_ATTEMPT_PARAM } from "./auth-callback";
import { openNativeAuthBrowser } from "./native-auth-browser";

const googleAttempts = new WeakMap<
  AbortSignal,
  { setRetryable: (retryable: boolean) => void; storedCookie: boolean }
>();

/** Shared auth client plus the Expo plugin, which keeps the session cookie in secure storage. */
export const authClient = createAppAuthClient(
  env.EXPO_PUBLIC_SERVER_URL,
  expoClient({
    scheme: appConfig.scheme,
    storagePrefix: appConfig.scheme,
    storage: SecureStore,
    // The plugin would keep the whole /get-session answer (token included) in `<scheme>_session_data`.
    // The app remembers identity and expiry itself (`auth/stored-session.ts`).
    disableCache: true,
    openAuthSession(url, returnUrl, options, signal) {
      const attempt = signal && googleAttempts.get(signal);
      if (!signal || !attempt) return undefined;
      return {
        result: openNativeAuthBrowser(url, returnUrl, options, signal, () =>
          attempt.setRetryable(true),
        ).then((result) => {
          if (result.type === "success" && !signal.aborted) attempt.setRetryable(false);
          return result;
        }),
        onCookieStored: () => {
          attempt.storedCookie = true;
        },
      };
    },
  }),
);

/** Only report success after the Expo plugin has stored the cookie from the owned redirect. */
export async function signInWithGoogle(
  signal: AbortSignal,
  setRetryable: (retryable: boolean) => void,
) {
  const attempt = { setRetryable, storedCookie: false };
  googleAttempts.set(signal, attempt);
  try {
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: createURL("/", { queryParams: { [AUTH_ATTEMPT_PARAM]: randomUUID() } }),
      fetchOptions: { signal },
    });
    return { error, signedIn: attempt.storedCookie && !signal.aborted };
  } finally {
    googleAttempts.delete(signal);
  }
}
