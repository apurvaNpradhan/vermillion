import { useMutation, useQueryClient } from "@tanstack/react-query";
import { SESSION_QUERY_KEY } from "@workspace/client/session";
import { pendingOnboardingSteps } from "@workspace/shared";

import { refreshSession, useSession } from "@/auth";
import { authClient } from "@/platform/auth-client";

/** The required steps the signed-in person still has to complete, in order. */
export function useOnboarding() {
  const { session, isPending } = useSession();
  const steps = session ? pendingOnboardingSteps(session.user) : [];
  return { steps, isPending };
}

/** Saves the display name with Better Auth and refreshes the session that onboarding derives from. */
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
