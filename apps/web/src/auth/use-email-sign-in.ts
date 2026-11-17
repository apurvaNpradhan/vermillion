import { TURNSTILE_TOKEN_HEADER } from "@workspace/shared";
import { useState } from "react";

import { getAuthClient } from "@/platform/auth-client";
import type { SiteKey } from "@/platform/i18n";

/** A Better Auth failure as a translated key (its own code when we know it). */
function failureKey(code: string | undefined): SiteKey {
  switch (code) {
    case "INVALID_OTP":
    case "OTP_EXPIRED":
      return "admin__code_invalid";
    case "TOO_MANY_ATTEMPTS":
      return "admin__code_too_many";
    case "CAPTCHA_FAILED":
      return "errors__captcha_failed";
    case "REGISTRATION_CLOSED":
      return "errors__registration_closed";
    case "BANNED_USER":
      return "errors__banned";
    default:
      return "errors__unknown";
  }
}

/** The admin's email-code sign-in: send a code, then redeem it. */
export function useEmailSignIn() {
  const [pending, setPending] = useState(false);
  const run = async (work: () => Promise<{ error: { code?: string } | null }>) => {
    setPending(true);
    try {
      const { error } = await work();
      return error ? failureKey(error.code) : null;
    } catch {
      return failureKey(undefined);
    } finally {
      setPending(false);
    }
  };
  return {
    pending,
    sendCode: (email: string, turnstileToken: string | undefined) =>
      run(() =>
        getAuthClient().emailOtp.sendVerificationOtp({
          email,
          type: "sign-in",
          fetchOptions: turnstileToken
            ? { headers: { [TURNSTILE_TOKEN_HEADER]: turnstileToken } }
            : {},
        }),
      ),
    redeem: (email: string, otp: string) =>
      run(() => getAuthClient().signIn.emailOtp({ email, otp })),
  };
}

/** Enrolment and the authenticator step (the two-factor plugin's endpoints). */
export function useTwoFactor() {
  const [pending, setPending] = useState(false);
  const run = async <Result>(
    work: () => Promise<{ data: Result | null; error: { code?: string } | null }>,
  ) => {
    setPending(true);
    try {
      const { data, error } = await work();
      return error || !data
        ? { data: null, error: failureKey(error?.code) }
        : { data, error: null };
    } catch {
      return { data: null, error: failureKey(undefined) };
    } finally {
      setPending(false);
    }
  };
  return {
    pending,
    enable: () => run(() => getAuthClient().twoFactor.enable({})),
    verifyTotp: (code: string) => run(() => getAuthClient().twoFactor.verifyTotp({ code })),
    verifyBackupCode: (code: string) =>
      run(() => getAuthClient().twoFactor.verifyBackupCode({ code })),
  };
}
