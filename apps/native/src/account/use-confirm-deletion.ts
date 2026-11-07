import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearSession } from "@workspace/client/session";

import { authClient } from "@/platform/auth-client";
import { orpc } from "@/platform/orpc";

/** Redeem an emailed token with SecureStore credentials, not the browser cookie jar. */
export function useConfirmDeletion() {
  const queryClient = useQueryClient();
  const mutation = useMutation(
    orpc.account.confirmDeletion.mutationOptions({
      onSuccess: async () => {
        try {
          await authClient.signOut();
        } finally {
          await clearSession(queryClient);
        }
      },
    }),
  );
  return {
    confirmDeletion: mutation.mutate,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error,
  };
}
