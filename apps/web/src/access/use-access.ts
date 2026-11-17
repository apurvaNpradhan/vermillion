import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InviteState } from "@workspace/shared";

import { getRpc } from "@/platform/orpc";

export type AccessSearch = {
  state?: InviteState | undefined;
  search?: string | undefined;
  page: number;
};
export const ACCESS_PAGE = 25;

export function useInvites(search: AccessSearch) {
  const query = useQuery(
    getRpc().orpc.admin.access.list.queryOptions({ input: { ...search, limit: ACCESS_PAGE } }),
  );
  return {
    invites: query.data?.invites ?? [],
    total: query.data?.total ?? 0,
    loading: query.isLoading,
  };
}

export function useAccessActions() {
  const queryClient = useQueryClient();
  const { client, orpc } = getRpc();
  const done = {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.admin.access.key() }),
  };
  const invite = useMutation({
    mutationFn: (email: string) => client.admin.access.invite({ email }),
    ...done,
  });
  return {
    approve: useMutation({
      mutationFn: (id: string) => client.admin.access.approve({ id }),
      ...done,
    }).mutateAsync,
    resend: useMutation({ mutationFn: (id: string) => client.admin.access.resend({ id }), ...done })
      .mutateAsync,
    revoke: useMutation({ mutationFn: (id: string) => client.admin.access.revoke({ id }), ...done })
      .mutateAsync,
    invite: invite.mutateAsync,
    inviting: invite.isPending,
  };
}
