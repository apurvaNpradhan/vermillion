import { isNetworkError } from "@workspace/client/network-error";
import { authErrorKey } from "@workspace/client/auth-error";
import { useCallback } from "react";

import { authClient } from "@/platform/auth-client";

type Headers = Record<string, string>;

/** A call that threw: "needs a connection" when offline, else the generic auth message. */
function thrownKey(caught: Error | null | undefined) {
  return isNetworkError(caught) ? "errors__offline" : "auth__error_unknown";
}

/** Asking for and redeeming sign-in codes. Every result is a translation key or null. */
export function useEmailCode() {
  /** Sends a code. The answer is the same for known and unknown addresses. */
  const sendCode = useCallback(async (email: string, headers: Headers) => {
    try {
      const { error } = await authClient.emailOtp.sendVerificationOtp(
        { email, type: "sign-in" },
        { headers },
      );
      return error ? authErrorKey(error) : null;
    } catch (caught) {
      return thrownKey(caught instanceof Error ? caught : null);
    }
  }, []);

  /** Redeems a code: signs in, or creates the account on first use. */
  const redeemCode = useCallback(async (email: string, otp: string) => {
    try {
      const { data, error } = await authClient.signIn.emailOtp({ email, otp });
      if (error || !data) return { error: authErrorKey(error) } as const;
      return { error: null } as const;
    } catch (caught) {
      return { error: thrownKey(caught instanceof Error ? caught : null) } as const;
    }
  }, []);

  return { sendCode, redeemCode };
}
