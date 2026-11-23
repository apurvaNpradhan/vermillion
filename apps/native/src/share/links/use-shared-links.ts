import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { orpc } from "@/platform/orpc";

/** The signed-in user's live Share links, and revoking one. */
export function useSharedLinks() {
  const queryClient = useQueryClient();
  const query = useQuery(orpc.share.list.queryOptions({ meta: { silent: true } }));
  const revoke = useMutation(
    orpc.share.revoke.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.share.list.key() }),
    }),
  );
  const { mutateAsync } = revoke;
  return {
    links: query.data?.links ?? null,
    isLoading: query.isPending && !query.isError,
    isError: query.isError,
    refetch: useCallback(() => void query.refetch(), [query]),
    revoke: useCallback(
      (code: string) =>
        mutateAsync({ code }).then(
          () => true,
          () => false,
        ),
      [mutateAsync],
    ),
  };
}
