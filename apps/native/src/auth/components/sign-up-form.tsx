import { useForm } from "@tanstack/react-form";
import { authErrorKey } from "@workspace/client/auth-error";
import { Spinner } from "heroui-native";
import { EnvelopeSimple, LockSimple, User } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { Text } from "react-native";
import { z } from "zod";

import { authClient } from "@/platform/auth-client";
import { TextField } from "@/platform/forms/text-field";
import { useTranslation } from "@/platform/i18n";
import { FormError } from "@/platform/ui/form-error";
import { Notice } from "@/platform/ui/notice";

import { useRegistrationStatus } from "../use-registration-status";
import { AuthLayout } from "./auth-layout";
import { AuthLink } from "./auth-link";
import { CheckInbox } from "./check-inbox";
import { SocialButtons } from "./social-buttons";
import { useTurnstile } from "./use-turnstile";
import { Button } from "@/platform/ui/button";

export function SignUpForm() {
  const { t } = useTranslation();
  const turnstile = useTurnstile();
  const status = useRegistrationStatus();
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
      // A relative callback becomes a deep link into the app once the email link is followed.
      const { error } = await authClient.signUp.email(
        { ...value, callbackURL: "/" },
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

  if (sentTo) return <CheckInbox email={sentTo} />;

  return (
    <AuthLayout
      title={t("auth__sign_up_title")}
      description={t("auth__sign_up_body")}
      action={
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              size="lg"
              className="h-14 rounded-xl"
              onPress={() => void form.handleSubmit()}
              isDisabled={isSubmitting || turnstile.pending}
            >
              {isSubmitting ? <Spinner size="sm" /> : null}
              <Button.Label className="text-body-lg font-semibold">
                {t("auth__sign_up_action")}
              </Button.Label>
            </Button>
          )}
        </form.Subscribe>
      }
      footer={
        <Text className="text-body text-muted">
          {t("auth__have_account")}{" "}
          <AuthLink href="/sign-in" replace>
            {t("nav__sign_in")}
          </AuthLink>
        </Text>
      }
    >
      {status && !status.open ? <Notice status="accent" message={t("auth__closed")} /> : null}
      <FormError message={failure} />
      <SocialButtons
        headers={turnstile.headers}
        blocked={turnstile.pending}
        onDone={turnstile.reset}
      />
      <form.Field name="name">
        {(field) => (
          <TextField
            field={field}
            label={t("auth__name")}
            icon={User}
            placeholder={t("auth__name_placeholder")}
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
          />
        )}
      </form.Field>
      <form.Field name="email">
        {(field) => (
          <TextField
            field={field}
            label={t("auth__email")}
            icon={EnvelopeSimple}
            placeholder={t("auth__email_placeholder")}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
          />
        )}
      </form.Field>
      <form.Field name="password">
        {(field) => (
          <TextField
            field={field}
            label={t("auth__password")}
            icon={LockSimple}
            description={t("auth__password_hint")}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={() => void form.handleSubmit()}
          />
        )}
      </form.Field>
      {turnstile.widget}
    </AuthLayout>
  );
}
