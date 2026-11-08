import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { z } from "zod";

import { authClient } from "@/platform/auth-client";
import { authErrorKey } from "@workspace/client/auth-error";
import { TextField } from "@/platform/forms/text-field";
import { useTranslation } from "@/platform/i18n";

import { AuthLayout } from "./auth-layout";
import { FormError } from "./form-error";
import { useTurnstile } from "./turnstile-field";

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
      const { error } = await authClient.requestPasswordReset(
        { email: value.email, redirectTo: "/reset-password" },
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
      footer={
        <Link to="/login" className="text-label text-muted-foreground underline">
          {t("auth__back_to_sign_in")}
        </Link>
      }
    >
      {sent ? (
        <Alert variant="success">
          <CheckCircleIcon />
          <AlertDescription>{t("auth__forgot_sent")}</AlertDescription>
        </Alert>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <FormError message={failure} />
          <form.Field name="email">
            {(field) => (
              <TextField field={field} label={t("auth__email")} type="email" autoComplete="email" />
            )}
          </form.Field>
          {turnstile.widget}
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" loading={isSubmitting} disabled={turnstile.pending}>
                {t("auth__forgot_action")}
              </Button>
            )}
          </form.Subscribe>
        </form>
      )}
    </AuthLayout>
  );
}
