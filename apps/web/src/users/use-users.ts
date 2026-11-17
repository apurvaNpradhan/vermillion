import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getRpc } from "@/platform/orpc";

export type UsersSearch = {
  search?: string | undefined;
  banned?: boolean | undefined;
  page: number;
};
export const USERS_PAGE = 25;

export function useUsersList(search: UsersSearch) {
  const query = useQuery(
    getRpc().orpc.admin.users.list.queryOptions({ input: { ...search, limit: USERS_PAGE } }),
  );
  return {
    users: query.data?.users ?? [],
    total: query.data?.total ?? 0,
    loading: query.isLoading,
  };
}

export function useAccountView(userId: string | null) {
  const query = useQuery({
    ...getRpc().orpc.admin.users.get.queryOptions({ input: { userId: userId ?? "" } }),
    enabled: Boolean(userId),
  });
  return { account: query.data ?? null, loading: query.isLoading };
}

export function useUserActions() {
  const queryClient = useQueryClient();
  const { client, orpc } = getRpc();
  const done = {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.admin.users.key() }),
  };
  return {
    ban: useMutation({
      mutationFn: (input: { userId: string; reason: string }) => client.admin.users.ban(input),
      ...done,
    }).mutateAsync,
    unban: useMutation({
      mutationFn: (userId: string) => client.admin.users.unban({ userId }),
      ...done,
    }).mutateAsync,
    revoke: useMutation({
      mutationFn: (userId: string) => client.admin.users.revokeSessions({ userId }),
      ...done,
    }).mutateAsync,
    remove: useMutation({
      mutationFn: (input: { userId: string; email: string }) => client.admin.users.delete(input),
      ...done,
    }).mutateAsync,
  };
}
