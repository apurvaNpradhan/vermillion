import { queryOptions, type QueryClient } from "@tanstack/react-query";

import type { createAppAuthClient } from "./auth-client";

type AuthClient = Pick<ReturnType<typeof createAppAuthClient>, "getSession">;

/** Cache key of the signed-in session (null when signed out). */
export const SESSION_QUERY_KEY = ["auth", "session"] as const;

/** The session as Better Auth answers it, or null when signed out. */
export type SessionData = Awaited<ReturnType<AuthClient["getSession"]>>["data"];

/**
 * Where an app keeps the last session it was told about, so a device without a connection still
 * knows who is signed in. `write(null)` forgets it.
 */
export type SessionStore = { read(): SessionData; write(session: SessionData): void };

type Lookup = { data: SessionData; error: null } | { data: null; error: Error };

/** One session lookup that never throws: a failure to reach the server comes back as `error`. */
async function lookup(authClient: AuthClient): Promise<Lookup> {
  try {
    const { data, error } = await authClient.getSession();
    if (error)
      return { data: null, error: new Error(error.message ?? "Could not load the session") };
    return { data, error: null };
  } catch (thrown) {
    return {
      data: null,
      error: thrown instanceof Error ? thrown : new Error("Session lookup failed"),
    };
  }
}

/** How long a stored session is waited for the network before the stored one is used. */
export const SESSION_FETCH_TIMEOUT_MS = 4000;

/**
 * The signed-in session, or null. One cached query backs the route guards and every component that
 * needs to know who is signed in. With a `store`, an answer is remembered, and when the server
 * cannot be reached (offline, slow, down) the remembered session stands in for it: a signed-in
 * user stays signed in without a connection. Only an answer from the server, including "nobody",
 * ends or changes the session; the query runs even offline (`networkMode: "always"`) so the guards
 * never wait on a paused request.
 */
export function sessionQueryOptions(authClient: AuthClient, store?: SessionStore) {
  return queryOptions({
    queryKey: SESSION_QUERY_KEY,
    networkMode: "always",
    queryFn: async (): Promise<SessionData> => {
      const remembered = store?.read() ?? null;
      const answer = lookup(authClient);
      const result = await (remembered
        ? Promise.race([
            answer,
            new Promise<Lookup>((resolve) =>
              setTimeout(
                () => resolve({ data: null, error: new Error("Session lookup timed out") }),
                SESSION_FETCH_TIMEOUT_MS,
              ),
            ),
          ])
        : answer);
      if (result.error) {
        if (remembered) return remembered;
        throw result.error;
      }
      store?.write(result.data);
      return result.data;
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
export function refreshSession(
  queryClient: QueryClient,
  authClient: AuthClient,
  store?: SessionStore,
) {
  return queryClient.fetchQuery({ ...sessionQueryOptions(authClient, store), staleTime: 0 });
}
