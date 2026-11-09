import { Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { OTP_LENGTH, OTP_RESEND_SECONDS } from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import { Field, FieldLabel } from "@workspace/ui/components/field";
import { OTPField, OTPFieldInput } from "@workspace/ui/components/otp-field";
import { useRef, useState } from "react";

import { useTranslation } from "@/platform/i18n";

import { postSignInTarget } from "../post-sign-in";
import { refreshSession } from "../session";
import { useCountdown } from "../use-countdown";
import { useEmailCode } from "../use-email-code";
import { AuthLayout } from "./auth-layout";
import { FormError } from "./form-error";
import { useTurnstile } from "./turnstile-field";

const SLOTS = Array.from({ length: OTP_LENGTH }, (_, slot) => slot);

/** Enter the emailed code. Submits itself on the last digit; a wrong code clears the field. */
export function VerifyCodeForm({
  email,
  redirect,
}: {
  email: string;
  redirect?: string | undefined;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const turnstile = useTurnstile();
  const { sendCode, redeemCode } = useEmailCode();
  const countdown = useCountdown(OTP_RESEND_SECONDS);
  const [value, setValue] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  const focusFirst = () => container.current?.querySelector("input")?.focus();

  async function submit(code: string) {
    if (checking) return;
    setChecking(true);
    setFailure(null);
    setNotice(null);
    const result = await redeemCode(email, code);
    if (result.error) {
      setChecking(false);
      setValue("");
      setFailure(t(result.error));
      // Let the field re-enable before focusing it.
      setTimeout(focusFirst, 0);
      return;
    }
    const session = await refreshSession(queryClient);
    await router.navigate(postSignInTarget(session?.user ?? result.user, redirect));
  }

  async function resend() {
    setResending(true);
    setFailure(null);
    const error = await sendCode(email, turnstile.headers);
    turnstile.reset();
    setResending(false);
    if (error) {
      setFailure(t(error));
      return;
    }
    setValue("");
    setNotice(t("auth__code_resent"));
    countdown.restart();
    focusFirst();
  }

  return (
    <AuthLayout
      title={t("auth__code_title")}
      description={t("auth__code_body", { email })}
      footer={
        <Link
          to="/login"
          search={redirect ? { redirect } : {}}
          className="text-label text-muted-foreground underline"
        >
          {t("auth__code_other_email")}
        </Link>
      }
    >
      <FormError message={failure} />
      <div ref={container} className="flex flex-col gap-4">
        <Field>
          <FieldLabel className="sr-only">{t("auth__code_label")}</FieldLabel>
          <OTPField
            length={OTP_LENGTH}
            size="lg"
            value={value}
            disabled={checking}
            onValueChange={(next) => {
              setValue(next);
              if (failure) setFailure(null);
            }}
            onValueComplete={(code) => void submit(code)}
            className="justify-center"
          >
            {SLOTS.map((slot) => (
              <OTPFieldInput
                key={slot}
                autoFocus={slot === 0}
                // The first box is labelled by the field label above.
                {...(slot > 0
                  ? {
                      "aria-label": t("auth__code_digit", { current: slot + 1, total: OTP_LENGTH }),
                    }
                  : {})}
                aria-invalid={failure ? true : undefined}
              />
            ))}
          </OTPField>
        </Field>
        {notice ? (
          <p role="status" className="text-center text-label text-muted-foreground">
            {notice}
          </p>
        ) : null}
      </div>
      {turnstile.widget}
      <Button
        variant="outline"
        loading={resending}
        disabled={countdown.remaining > 0 || turnstile.pending || checking}
        onClick={() => void resend()}
      >
        {countdown.remaining > 0
          ? t("auth__code_resend_in", { seconds: countdown.remaining })
          : t("auth__code_resend")}
      </Button>
    </AuthLayout>
  );
}
