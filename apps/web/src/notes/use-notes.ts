import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/platform/orpc";

/** The signed-in user's notes and the actions on them. */
export function useNotes() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: orpc.notes.key() });

  const query = useQuery(orpc.notes.list.queryOptions());
  const create = useMutation(orpc.notes.create.mutationOptions({ onSuccess: refresh }));
  const update = useMutation(orpc.notes.update.mutationOptions({ onSuccess: refresh }));
  const remove = useMutation(orpc.notes.delete.mutationOptions({ onSuccess: refresh }));

  return {
    notes: query.data ?? [],
    isLoading: query.isPending,
    create: async (input: { title: string; body: string }) => {
      await create.mutateAsync(input);
    },
    update: async (input: { id: string; title: string; body: string }) => {
      await update.mutateAsync(input);
    },
    remove: async (id: string) => {
      await remove.mutateAsync({ id });
    },
  };
}

export type Note = ReturnType<typeof useNotes>["notes"][number];
