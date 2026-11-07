import { createRpc } from "@workspace/client/rpc";

import { authClient } from "./auth-client";
import { env } from "./env";

async function expoFetch(url: string, init: RequestInit) {
  const { fetch } = await import("expo/fetch");
  // SAFETY: expo/fetch takes the same init as the standard fetch; only its body typing is narrower.
  return fetch(url, init as Parameters<typeof fetch>[1]);
}

/**
 * Native has no cookie jar: the session cookie Better Auth stored is sent by
 * hand, and the server (no `Origin` header) trusts it as a credential.
 */
export const { client, orpc } = createRpc({
  serverUrl: env.EXPO_PUBLIC_SERVER_URL,
  fetch: (url, init) => expoFetch(url, { ...init, credentials: "omit" }),
  headers: async () => {
    const cookie = await authClient.getCookie();
    const headers: Record<string, string> = {};
    if (cookie) headers["Cookie"] = cookie;
    return headers;
  },
});
