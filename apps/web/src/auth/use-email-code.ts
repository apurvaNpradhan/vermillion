import { authErrorKey } from "@workspace/client/auth-error";
import { useCallback } from "react";

import { authClient } from "@/platform/auth-client";

type Headers = Record<string, string>;

/** Asking for and redeeming sign-in codes. Every result is a translation key or null. */
export function useEmailCode() {
  /** Sends a code. The answer is the same for known and unknown addresses. */
  const sendCode = useCallback(async (email: string, headers: Headers) => {
    const { error } = await authClient.emailOtp.sendVerificationOtp(
      { email, type: "sign-in" },
      { headers },
    );
    return error ? authErrorKey(error) : null;
  }, []);

  /** Redeems a code: signs in, or creates the account on first use. */
  const redeemCode = useCallback(async (email: string, otp: string) => {
    const { data, error } = await authClient.signIn.emailOtp({ email, otp });
    if (error || !data) return { user: null, error: authErrorKey(error) } as const;
    return { user: data.user, error: null } as const;
  }, []);

  return { sendCode, redeemCode };
}
