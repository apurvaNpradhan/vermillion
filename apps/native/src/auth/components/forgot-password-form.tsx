import { useForm } from "@tanstack/react-form";
import { authErrorKey } from "@workspace/client/auth-error";
import { Button, Spinner } from "heroui-native";
import { createURL } from "expo-linking";
import { useMemo, useState } from "react";
import { z } from "zod";

import { authClient } from "@/platform/auth-client";
import { TextField } from "@/platform/forms/text-field";
import { useTranslation } from "@/platform/i18n";
import { FormError } from "@/platform/ui/form-error";
import { Notice } from "@/platform/ui/notice";

import { AuthLayout } from "./auth-layout";
import { AuthLink } from "./auth-link";
import { useTurnstile } from "./use-turnstile";

export function ForgotPasswordForm() {
  const { t } = useTranslation();
  const turnstile = useTurnstile();
  const [failure, setFailure] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const schema = useMemo(() => z.object({ email: z.email(t("auth__error_email_invalid")) }), [t]);

  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setFailure(null);
      // The reset link in the email opens the app at this deep link (the scheme is a trusted origin).
      const { error } = await authClient.requestPasswordReset(
        { email: value.email, redirectTo: createURL("/reset-password") },
        { headers: turnstile.headers },
      );
      turnstile.reset();
      if (error) {
        setFailure(t(authErrorKey(error)));
        return;
      }
      setSent(true);
    },
  });

  return (
    <AuthLayout
      title={t("auth__forgot_title")}
      description={t("auth__forgot_body")}
      footer={<AuthLink href="/sign-in">{t("auth__back_to_sign_in")}</AuthLink>}
    >
      {sent ? (
        <Notice status="success" message={t("auth__forgot_sent")} />
      ) : (
        <>
          <FormError message={failure} />
          <form.Field name="email">
            {(field) => (
              <TextField
                field={field}
                label={t("auth__email")}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
              />
            )}
          </form.Field>
          {turnstile.widget}
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button
                onPress={() => void form.handleSubmit()}
                isDisabled={isSubmitting || turnstile.pending}
              >
                {isSubmitting ? <Spinner size="sm" /> : null}
                <Button.Label>{t("auth__forgot_action")}</Button.Label>
              </Button>
            )}
          </form.Subscribe>
        </>
      )}
    </AuthLayout>
  );
}
