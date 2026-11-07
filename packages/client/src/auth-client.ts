import type { BetterAuthClientPlugin } from "better-auth";
import { lastLoginMethodClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Where Better Auth lives on the API server. */
export function authBaseUrl(serverUrl: string): string {
  return new URL("/api/auth", serverUrl).toString();
}

/**
 * The auth client every app uses. Native passes its session-storage plugin as
 * `extraPlugins`; the web needs none.
 */
export function createAppAuthClient<const Extra extends BetterAuthClientPlugin[]>(
  serverUrl: string,
  ...extraPlugins: Extra
) {
  return createAuthClient({
    baseURL: authBaseUrl(serverUrl),
    plugins: [lastLoginMethodClient(), ...extraPlugins],
  });
}
