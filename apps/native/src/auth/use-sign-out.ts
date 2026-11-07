import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearSession } from "@workspace/client/session";

import { authClient } from "@/platform/auth-client";

/** Signs out and drops everything cached for the user; the route guard shows sign-in. */
export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? "Sign-out failed");
    },
    onSuccess: () => clearSession(queryClient),
  });
}
