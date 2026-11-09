import { useForm } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { InfoIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { z } from "zod";

import { authErrorKey } from "@workspace/client/auth-error";
import { TextField } from "@/platform/forms/text-field";
import { useTranslation } from "@/platform/i18n";

import { useEmailCode } from "../use-email-code";
import { useRegistrationStatus } from "../use-registration-status";
import { AuthLayout } from "./auth-layout";
import { FormError } from "./form-error";
import { SocialButtons } from "./social-buttons";
import { useTurnstile } from "./turnstile-field";

/** The one sign-in screen: an email address (a code follows) or a social provider. */
export function EmailForm({
  redirect,
  providerError,
}: {
  redirect?: string | undefined;
  providerError?: string | undefined;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const turnstile = useTurnstile();
  const status = useRegistrationStatus();
  const { sendCode } = useEmailCode();
  const [failure, setFailure] = useState<string | null>(null);

  const schema = useMemo(() => z.object({ email: z.email(t("auth__error_email_invalid")) }), [t]);

  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setFailure(null);
      const email = value.email.trim();
      const error = await sendCode(email, turnstile.headers);
      turnstile.reset();
      if (error) {
        setFailure(t(error));
        return;
      }
      await router.navigate({
        to: "/verify-code",
        search: { email, ...(redirect ? { redirect } : {}) },
      });
    },
  });

  return (
    <AuthLayout title={t("auth__email_title")} description={t("auth__email_body")}>
      {status && !status.open ? (
        <Alert variant="info">
          <InfoIcon />
          <AlertDescription>{t("auth__closed")}</AlertDescription>
        </Alert>
      ) : null}
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FormError
          message={
            failure ??
            (providerError ? t(authErrorKey({ code: providerError.toUpperCase() })) : null)
          }
        />
        <form.Field name="email">
          {(field) => (
            <TextField
              field={field}
              label={t("auth__email")}
              type="email"
              autoComplete="email"
              placeholder={t("auth__email_placeholder")}
            />
          )}
        </form.Field>
        {turnstile.widget}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" loading={isSubmitting} disabled={turnstile.pending}>
              {t("auth__send_code")}
            </Button>
          )}
        </form.Subscribe>
      </form>
      <SocialButtons
        redirect={redirect}
        headers={turnstile.headers}
        blocked={turnstile.pending}
        onDone={turnstile.reset}
      />
    </AuthLayout>
  );
}
