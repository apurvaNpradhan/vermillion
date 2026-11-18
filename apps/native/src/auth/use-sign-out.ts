import { useMutation, useQueryClient } from "@tanstack/react-query";
import { clearSession } from "@workspace/client/session";

import { authClient } from "@/platform/auth-client";

import { setSignedOut } from "./signed-out";

/**
 * Signs out and drops everything cached for the user; the route guard shows the welcome screen.
 * The device keeps its local data and unsent changes for the next sign-in (ADR 0021).
 */
export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? "Sign-out failed");
    },
    onSuccess: () => {
      // Before the session clears, so the guard goes to the welcome screen in one step.
      setSignedOut(true);
      return clearSession(queryClient);
    },
  });
}
