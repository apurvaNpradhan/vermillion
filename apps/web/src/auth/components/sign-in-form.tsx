import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";
import { CheckCircleIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { z } from "zod";

import { authClient } from "@/platform/auth-client";
import { authErrorKey } from "@workspace/client/auth-error";
import { TextField } from "@/platform/forms/text-field";
import { useTranslation } from "@/platform/i18n";
import { safeReturnLocation } from "@/platform/navigation";

import { refreshSession } from "../session";
import { AuthLayout } from "./auth-layout";
import { FormError } from "./form-error";
import { SocialButtons } from "./social-buttons";
import { useTurnstile } from "./turnstile-field";

export function SignInForm({
  redirect,
  resetDone,
  providerError,
}: {
  redirect?: string | undefined;
  resetDone?: boolean | undefined;
  providerError?: string | undefined;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const turnstile = useTurnstile();
  const returnTo = safeReturnLocation(redirect);
  const [failure, setFailure] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        email: z.email(t("auth__error_email_invalid")),
        password: z.string().min(1, t("auth__error_password_required")),
      }),
    [t],
  );

  const form = useForm({
    defaultValues: { email: "", password: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setFailure(null);
      const { error } = await authClient.signIn.email(
        { ...value, callbackURL: returnTo },
        { headers: turnstile.headers },
      );
      turnstile.reset();
      if (error) {
        if (error.code === "EMAIL_NOT_VERIFIED") {
          // Better Auth has just sent a fresh verification link.
          await router.navigate({
            to: "/verify-email",
            search: { email: value.email, ...(redirect ? { redirect } : {}) },
          });
          return;
        }
        setFailure(t(authErrorKey(error)));
        return;
      }
      await refreshSession(queryClient);
      await router.navigate({ href: returnTo });
    },
  });

  return (
    <AuthLayout
      title={t("auth__sign_in_title")}
      footer={
        <p className="text-body text-muted-foreground">
          {t("auth__no_account")}{" "}
          <Link
            to="/sign-up"
            search={redirect ? { redirect } : {}}
            className="text-foreground underline"
          >
            {t("nav__sign_up")}
          </Link>
        </p>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        {resetDone ? (
          <Alert variant="success">
            <CheckCircleIcon />
            <AlertDescription>{t("auth__reset_done")}</AlertDescription>
          </Alert>
        ) : null}
        <FormError
          message={
            failure ??
            (providerError ? t(authErrorKey({ code: providerError.toUpperCase() })) : null)
          }
        />
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
              autoComplete="current-password"
            />
          )}
        </form.Field>
        <Link to="/forgot-password" className="text-label text-muted-foreground underline">
          {t("auth__forgot_link")}
        </Link>
        {turnstile.widget}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" loading={isSubmitting} disabled={turnstile.pending}>
              {t("auth__sign_in_action")}
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
