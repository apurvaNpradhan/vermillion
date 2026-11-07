import { useQuery, type QueryClient } from "@tanstack/react-query";
import {
  refreshSession as refreshSharedSession,
  sessionQueryOptions as sharedSessionQueryOptions,
} from "@workspace/client/session";

import { authClient } from "@/platform/auth-client";

/** The signed-in session query, bound to the web auth client. */
export function sessionQueryOptions() {
  return sharedSessionQueryOptions(authClient);
}

/** Reads the session on the client only: public pages render signed out on the server. */
export function useSession() {
  const query = useQuery({ ...sessionQueryOptions(), enabled: typeof window !== "undefined" });
  return { session: query.data ?? null, isPending: query.isPending };
}

/** Fetches the session again, bypassing the cache (after sign-in or verification). */
export function refreshSession(queryClient: QueryClient) {
  return refreshSharedSession(queryClient, authClient);
}
