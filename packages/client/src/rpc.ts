import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils, type RouterUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "@workspace/api/client";

export type RpcOptions = {
  /** Public origin of the API server (`https://api.<domain>` in production). */
  serverUrl: string;
  /** Fetch implementation; defaults to the global one. Native swaps in `expo/fetch`. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  /** Extra headers per request, for example the session cookie on native. */
  headers?: () => Promise<Record<string, string>> | Record<string, string>;
};

export type Rpc = { client: AppRouterClient; orpc: RouterUtils<AppRouterClient> };

/**
 * The typed oRPC client plus TanStack Query helpers for every procedure.
 * Components reach these only through module hooks.
 */
export function createRpc({ serverUrl, fetch: doFetch, headers }: RpcOptions): Rpc {
  const link = new RPCLink({
    origin: new URL(serverUrl).origin,
    url: "/rpc",
    fetch: doFetch ?? ((url, init) => fetch(url, { ...init, credentials: "include" })),
    ...(headers ? { headers } : {}),
  });
  const client: AppRouterClient = createORPCClient(link);
  return { client, orpc: createTanstackQueryUtils(client) };
}
