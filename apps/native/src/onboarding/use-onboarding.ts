import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SESSION_QUERY_KEY } from "@workspace/client/session";

import { refreshSession } from "@/auth";
import { authClient } from "@/platform/auth-client";

/**
 * Saves the display name with Better Auth and refreshes the session that onboarding derives
 * from. Offline this rejects; the screen shows a retry message and keeps the text.
 */
export function useSaveName() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await authClient.updateUser({ name });
      if (error) throw new Error(error.message ?? "Could not save the name");
    },
    onSuccess: async () => {
      await refreshSession(queryClient);
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });
  return { saveName: mutation.mutateAsync, isPending: mutation.isPending };
}
