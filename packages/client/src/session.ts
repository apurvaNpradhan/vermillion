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

/** An answer from the server (a session or "nobody"), or a failure to get one. */
type Lookup = { kind: "answer"; data: SessionData } | { kind: "failed"; error: Error };

/** HTTP 401 from Better Auth: the server says the session is not valid. */
const UNAUTHORIZED = 401;

/** One session lookup that never throws: a failure to reach the server comes back as `failed`. */
async function lookup(authClient: AuthClient): Promise<Lookup> {
  try {
    const { data, error } = await authClient.getSession();
    // A 401 is an answer ("nobody"), not a connection problem: it must end a remembered session.
    if (error?.status === UNAUTHORIZED) return { kind: "answer", data: null };
    if (error)
      return { kind: "failed", error: new Error(error.message ?? "Could not load the session") };
    return { kind: "answer", data };
  } catch (thrown) {
    return {
      kind: "failed",
      error: thrown instanceof Error ? thrown : new Error("Session lookup failed"),
    };
  }
}

/** How long a stored session is waited for the network before the stored one is used. */
export const SESSION_FETCH_TIMEOUT_MS = 4000;

/**
 * Whether a remembered session has run out. An unreadable date counts as expired: a stored
 * session is only trusted while it provably has time left.
 */
export function isSessionExpired(session: NonNullable<SessionData>, now = Date.now()): boolean {
  const expiresAt = new Date(session.session.expiresAt).getTime();
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

/**
 * Bumped whenever the account changes under a running lookup (sign-out, account deletion). A
 * lookup started before the bump must not persist or publish its answer: it was generated for a
 * session that no longer exists, and a query cancel does not stop a running function.
 */
let writeGeneration = 0;

/**
 * Bumped for every lookup that starts. Only the newest lookup may store or publish what it learns:
 * a superseded one (a slow lookup from before sign-in, one that timed out) is stale news.
 */
let lookupGeneration = 0;

/** Fences every session lookup still running: their answers are dropped, never stored. */
export function fenceSessionWrites() {
  writeGeneration += 1;
}

/**
 * The signed-in session, or null. One cached query backs the route guards and every component that
 * needs to know who is signed in. With a `store`, an answer is remembered, and when the server
 * cannot be reached (offline, slow, down) the remembered session stands in for it while it has not
 * expired: a signed-in user stays signed in without a connection. Only an answer from the server,
 * including "nobody" (or a 401), ends or changes the session, even one that arrives after the
 * stored session was already used. The query runs even offline (`networkMode: "always"`) so the
 * guards never wait on a paused request.
 */
export function sessionQueryOptions(authClient: AuthClient, store?: SessionStore) {
  return queryOptions({
    queryKey: SESSION_QUERY_KEY,
    networkMode: "always",
    queryFn: async ({ client }): Promise<SessionData> => {
      const started = writeGeneration;
      const mine = ++lookupGeneration;
      const fresh = () => writeGeneration === started;
      const newest = () => fresh() && lookupGeneration === mine;
      const stored = store?.read() ?? null;
      const expired = stored !== null && isSessionExpired(stored);
      const remembered = expired ? null : stored;
      if (expired) store?.write(null);
      const answer = lookup(authClient);
      const result = await (remembered
        ? Promise.race([
            answer,
            new Promise<Lookup>((resolve) =>
              setTimeout(
                () => resolve({ kind: "failed", error: new Error("Session lookup timed out") }),
                SESSION_FETCH_TIMEOUT_MS,
              ),
            ),
          ])
        : answer);
      if (result.kind === "answer") {
        // Fenced: the account changed while this ran, so what it learned is about someone else.
        if (!fresh()) return null;
        // Superseded by a newer lookup (sign-in refreshed it): its answer is not stored or kept.
        if (!newest()) return client.getQueryData<SessionData>(SESSION_QUERY_KEY) ?? result.data;
        store?.write(result.data);
        return result.data;
      }
      if (remembered) {
        // The stored session stands in now; a definitive answer that still arrives replaces it.
        void answer.then((late) => {
          if (late.kind !== "answer" || !newest()) return;
          store?.write(late.data);
          client.setQueryData(SESSION_QUERY_KEY, late.data);
        });
        // The wait may have outlived the stored session.
        if (isSessionExpired(remembered)) {
          if (newest()) store?.write(null);
          return null;
        }
        return remembered;
      }
      // An expired session is a session that ended, not a lookup that failed.
      if (expired) return null;
      throw result.error;
    },
    staleTime: 60_000,
    meta: { silent: true },
  });
}

/** Drop user data without detaching observers of the session used by route guards. */
export async function clearSession(queryClient: QueryClient) {
  fenceSessionWrites();
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

/**
 * Ends a remembered session that has run out while the app sat in the background or offline: the
 * cache and the store forget it, so the guards react without waiting for a lookup.
 */
export function expireRememberedSession(queryClient: QueryClient, store?: SessionStore) {
  const cached = queryClient.getQueryData<SessionData>(SESSION_QUERY_KEY);
  if (!cached || !isSessionExpired(cached)) return;
  store?.write(null);
  queryClient.setQueryData(SESSION_QUERY_KEY, null);
}

/**
 * Fetches the session again, bypassing the cache (after sign-in or verification). A lookup
 * already running was started before the sign-in, so it is cancelled first: joining it would hand
 * back its answer ("nobody") and send no request at all.
 */
export async function refreshSession(
  queryClient: QueryClient,
  authClient: AuthClient,
  store?: SessionStore,
) {
  await queryClient.cancelQueries({ queryKey: SESSION_QUERY_KEY });
  return queryClient.fetchQuery({ ...sessionQueryOptions(authClient, store), staleTime: 0 });
}
