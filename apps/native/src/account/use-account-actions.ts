import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SESSION_QUERY_KEY } from "@workspace/client/session";

import { orpc } from "@/platform/orpc";

/** Account transport seam: components receive actions and status, never query builders. */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const mutation = useMutation(
    orpc.account.updateProfile.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: orpc.account.me.key() }),
          queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
        ]);
      },
    }),
  );
  return { updateProfile: mutation.mutateAsync, isPending: mutation.isPending };
}

export function useRequestDeletion() {
  const mutation = useMutation(orpc.account.requestDeletion.mutationOptions());
  return {
    requestDeletion: mutation.mutate,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
  };
}
