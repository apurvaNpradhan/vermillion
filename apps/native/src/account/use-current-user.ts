import { useQuery } from "@tanstack/react-query";

import { orpc } from "@/platform/orpc";

/** The signed-in user's profile as the API sees it. */
export function useCurrentUser() {
  const query = useQuery(orpc.account.me.queryOptions());
  return { user: query.data ?? null, isPending: query.isPending };
}
