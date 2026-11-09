import { useQueryClient } from "@tanstack/react-query";
import { authErrorKey } from "@workspace/client/auth-error";
import { SESSION_QUERY_KEY } from "@workspace/client/session";
import { useCallback } from "react";

import { authClient } from "@/platform/auth-client";
import { orpc } from "@/platform/orpc";

/**
 * Changing the address takes a code sent to the new one. Both steps return a translation key on
 * failure and null on success; a wrong code for an address someone else owns reads the same.
 */
export function useChangeEmail() {
  const queryClient = useQueryClient();

  const requestChange = useCallback(async (newEmail: string) => {
    const { error } = await authClient.emailOtp.requestEmailChange({ newEmail });
    return error ? authErrorKey(error) : null;
  }, []);

  const confirmChange = useCallback(
    async (newEmail: string, otp: string) => {
      const { error } = await authClient.emailOtp.changeEmail({ newEmail, otp });
      if (error) return authErrorKey(error);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orpc.account.me.key() }),
        queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
      ]);
      return null;
    },
    [queryClient],
  );

  return { requestChange, confirmChange };
}
