import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/platform/orpc";

export const ADMIN_PAGE_SIZE = 20;

/** One page of users for the admin screen, plus the actions an admin can take on them. */
export function useAdminUsers({ search, page }: { search: string; page: number }) {
  const queryClient = useQueryClient();
  const query = useQuery(
    orpc.admin.users.list.queryOptions({
      input: { search: search || undefined, page, limit: ADMIN_PAGE_SIZE },
      placeholderData: keepPreviousData,
    }),
  );
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.admin.users.list.key() });

  const ban = useMutation(orpc.admin.users.ban.mutationOptions({ onSuccess: refresh }));
  const unban = useMutation(orpc.admin.users.unban.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(orpc.admin.users.remove.mutationOptions({ onSuccess: refresh }));

  return {
    users: query.data?.users ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isPending,
    ban: (userId: string) => ban.mutateAsync({ userId }),
    unban: (userId: string) => unban.mutateAsync({ userId }),
    remove: (userId: string) => remove.mutateAsync({ userId }),
  };
}
