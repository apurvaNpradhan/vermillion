import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearSession } from "@workspace/client/session";

import { authClient } from "@/platform/auth-client";
import { confirmAccountDeleted } from "@/sync";
import { orpc } from "@/platform/orpc";

/** Redeem an emailed token with SecureStore credentials, not the browser cookie jar. */
export function useConfirmDeletion() {
  const queryClient = useQueryClient();
  const mutation = useMutation(
    orpc.account.confirmDeletion.mutationOptions({
      onSuccess: async () => {
        // The server confirmed the deletion: remove this device's copy of the account's data.
        await confirmAccountDeleted().catch(() => undefined);
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
