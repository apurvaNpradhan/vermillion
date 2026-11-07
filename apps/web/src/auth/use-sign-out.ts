import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";

import { authClient } from "@/platform/auth-client";

import { clearSession } from "@workspace/client/session";

/** Signs out, drops everything cached for the user and returns to the public home page. */
export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message ?? "Sign-out failed");
    },
    onSuccess: async () => {
      await clearSession(queryClient);
      await navigate({ to: "/" });
    },
  });
}
