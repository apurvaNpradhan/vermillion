import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  refreshSession as refreshSharedSession,
  sessionQueryOptions as sharedSessionQueryOptions,
} from "@workspace/client/session";

import { authClient } from "@/platform/auth-client";

/** The signed-in session query, bound to the native auth client. */
export function sessionQueryOptions() {
  return sharedSessionQueryOptions(authClient);
}

/** The signed-in session (null when signed out); `isPending` until the first answer. */
export function useSession() {
  const query = useQuery(sessionQueryOptions());
  return { session: query.data ?? null, isPending: query.isPending };
}

/** Fetches the session again, bypassing the cache (after sign-in or verification). */
export function refreshSession(queryClient: QueryClient) {
  return refreshSharedSession(queryClient, authClient);
}
