import type { BetterAuthClientPlugin } from "better-auth";
import { emailOTPClient, lastLoginMethodClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Where Better Auth lives on the API server. */
export function authBaseUrl(serverUrl: string): string {
  return new URL("/api/auth", serverUrl).toString();
}

/**
 * The auth client. Native passes its session-storage plugin as `extraPlugins`.
 */
export function createAppAuthClient<const Extra extends BetterAuthClientPlugin[]>(
  serverUrl: string,
  ...extraPlugins: Extra
) {
  return createAuthClient({
    baseURL: authBaseUrl(serverUrl),
    plugins: [emailOTPClient(), lastLoginMethodClient(), ...extraPlugins],
  });
}
