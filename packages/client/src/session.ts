import { queryOptions, type QueryClient } from "@tanstack/react-query";

import type { createAppAuthClient } from "./auth-client";

type AuthClient = Pick<ReturnType<typeof createAppAuthClient>, "getSession">;

/** Cache key of the signed-in session (null when signed out). */
export const SESSION_QUERY_KEY = ["auth", "session"] as const;

/**
 * The signed-in session, or null. One cached query backs the route guards and
 * every component that needs to know who is signed in.
 */
export function sessionQueryOptions(authClient: AuthClient) {
  return queryOptions({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await authClient.getSession();
      if (error) throw new Error(error.message ?? "Could not load the session");
      return data;
    },
    staleTime: 60_000,
    meta: { silent: true },
  });
}

/** Drop user data without detaching observers of the session used by route guards. */
export async function clearSession(queryClient: QueryClient) {
  await queryClient.cancelQueries();
  queryClient.setQueryData(SESSION_QUERY_KEY, null);
  queryClient.removeQueries({
    predicate: (query) =>
      query.queryKey.length !== SESSION_QUERY_KEY.length ||
      query.queryKey[0] !== SESSION_QUERY_KEY[0] ||
      query.queryKey[1] !== SESSION_QUERY_KEY[1],
  });
  queryClient.getMutationCache().clear();
}

/** Fetches the session again, bypassing the cache (after sign-in or verification). */
export function refreshSession(queryClient: QueryClient, authClient: AuthClient) {
  return queryClient.fetchQuery({ ...sessionQueryOptions(authClient), staleTime: 0 });
}
