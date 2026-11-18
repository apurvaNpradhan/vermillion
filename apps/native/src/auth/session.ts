import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AppState } from "react-native";
import {
  clearSession,
  expireRememberedSession,
  refreshSession as refreshSharedSession,
  sessionQueryOptions as sharedSessionQueryOptions,
} from "@workspace/client/session";

import { authClient } from "@/platform/auth-client";

import { purgeLegacySessionCaches, storedSession } from "./stored-session";

purgeLegacySessionCaches();

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
  // The fence goes up first: a lookup still running must not store a session after this.
  const cleared = clearSession(queryClient);
  storedSession.write(null);
  return cleared;
}

/** On resume, ends a remembered session that ran out while the app was away. Mount once. */
export function useExpireSessionOnResume() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") expireRememberedSession(queryClient, storedSession);
    });
    return () => subscription.remove();
  }, [queryClient]);
}
