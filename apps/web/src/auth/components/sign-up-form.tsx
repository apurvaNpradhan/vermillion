import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { InfoIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";

import { authClient } from "@/platform/auth-client";
import { authErrorKey } from "@workspace/client/auth-error";
import { TextField } from "@/platform/forms/text-field";
import { useTranslation } from "@/platform/i18n";
import { safeReturnLocation } from "@/platform/navigation";

import { useRegistrationStatus } from "../use-registration-status";
import { AuthLayout } from "./auth-layout";
import { CheckInbox } from "./check-inbox";
import { FormError } from "./form-error";
import { SocialButtons } from "./social-buttons";
import { useTurnstile } from "./turnstile-field";

export function SignUpForm({ redirect }: { redirect?: string | undefined }) {
  const { t } = useTranslation();
  const turnstile = useTurnstile();
  const status = useRegistrationStatus();
  const returnTo = safeReturnLocation(redirect);
  const [failure, setFailure] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(1, t("auth__error_name_required")).max(200),
        email: z.email(t("auth__error_email_invalid")),
        password: z
          .string()
          .min(10, t("auth__error_password_short"))
          .max(128, t("auth__error_password_long")),
      }),
    [t],
  );

  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setFailure(null);
      const { error } = await authClient.signUp.email(
        { ...value, callbackURL: returnTo },
        { headers: turnstile.headers },
      );
      turnstile.reset();
      if (error) {
        setFailure(t(authErrorKey(error)));
        return;
      }
      // The same screen whether or not the address already had an account.
      setSentTo(value.email);
    },
  });

  if (sentTo) return <CheckInbox email={sentTo} callbackURL={returnTo} />;

  return (
    <AuthLayout
      title={t("auth__sign_up_title")}
      footer={
        <p className="text-muted-foreground text-sm">
          {t("auth__have_account")}{" "}
          <Link
            to="/login"
            search={redirect ? { redirect } : {}}
            className="text-foreground underline"
          >
            {t("nav__sign_in")}
          </Link>
        </p>
      }
    >
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
        <FormError message={failure} />
        <form.Field name="name">
          {(field) => <TextField field={field} label={t("auth__name")} autoComplete="name" />}
        </form.Field>
        <form.Field name="email">
          {(field) => (
            <TextField field={field} label={t("auth__email")} type="email" autoComplete="email" />
          )}
        </form.Field>
        <form.Field name="password">
          {(field) => (
            <TextField
              field={field}
              label={t("auth__password")}
              type="password"
              autoComplete="new-password"
              description={t("auth__password_hint")}
            />
          )}
        </form.Field>
        {turnstile.widget}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" loading={isSubmitting} disabled={turnstile.pending}>
              {t("auth__sign_up_action")}
            </Button>
          )}
        </form.Subscribe>
      </form>
      <SocialButtons
        returnTo={returnTo}
        headers={turnstile.headers}
        blocked={turnstile.pending}
        onDone={turnstile.reset}
      />
    </AuthLayout>
  );
}
