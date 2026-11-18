import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  clearSession,
  refreshSession as refreshSharedSession,
  sessionQueryOptions as sharedSessionQueryOptions,
} from "@workspace/client/session";

import { authClient } from "@/platform/auth-client";

import { storedSession } from "./stored-session";

/** The signed-in session query, bound to the native auth client and the stored last session. */
export function sessionQueryOptions() {
  return sharedSessionQueryOptions(authClient, storedSession);
}

/** The signed-in session (null when signed out); `isPending` until the first answer. */
export function useSession() {
  const query = useQuery(sessionQueryOptions());
  return { session: query.data ?? null, isPending: query.isPending, isError: query.isError };
}

/** Fetches the session again, bypassing the cache (after sign-in or verification). */
export function refreshSession(queryClient: QueryClient) {
  return refreshSharedSession(queryClient, authClient, storedSession);
}

/** Forgets the session, the stored copy included, and every cached query of the user. */
export function clearAccountSession(queryClient: QueryClient) {
  storedSession.write(null);
  return clearSession(queryClient);
}
