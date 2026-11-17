import { createRpc } from "@workspace/client/rpc";
import { APP_VERSION_HEADER } from "@workspace/shared";
import Constants from "expo-constants";

import { appConfig } from "./app-config";
import { authClient } from "./auth-client";
import { env } from "./env";

async function expoFetch(url: string, init: RequestInit) {
  const { fetch } = await import("expo/fetch");
  // SAFETY: expo/fetch takes the same init as the standard fetch; only its body typing is narrower.
  return fetch(url, init as Parameters<typeof fetch>[1]);
}

/** `1.2.0+45`: the JavaScript version and the Android build number, when the build has one. */
const build = Constants.expoConfig?.android?.versionCode;
const appVersion = build ? `${appConfig.version}+${build}` : appConfig.version;

/**
 * Native has no cookie jar: the session cookie Better Auth stored is sent by
 * hand, and the server (no `Origin` header) trusts it as a credential.
 */
export const { client, orpc } = createRpc({
  serverUrl: env.EXPO_PUBLIC_SERVER_URL,
  fetch: (url, init) => expoFetch(url, { ...init, credentials: "omit" }),
  headers: async () => {
    const cookie = await authClient.getCookie();
    const version = { [APP_VERSION_HEADER]: appVersion };
    return cookie ? { ...version, Cookie: cookie } : version;
  },
});
