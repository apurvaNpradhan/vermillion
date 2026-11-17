import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getRpc } from "@/platform/orpc";

export function useReleaseSettings() {
  const queryClient = useQueryClient();
  const { client, orpc } = getRpc();
  const query = useQuery(orpc.admin.releases.get.queryOptions());
  const set = useMutation({
    mutationFn: (version: string) => client.admin.releases.setMinimum({ version }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.admin.key() }),
  });
  return { status: query.data ?? null, setMinimum: set.mutateAsync, saving: set.isPending };
}
