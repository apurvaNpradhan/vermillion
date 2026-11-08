import { useForm } from "@tanstack/react-form";
import { useQueryClient } from "@tanstack/react-query";
import { authErrorKey } from "@workspace/client/auth-error";
import { Spinner } from "heroui-native";
import { EnvelopeSimple, LockSimple } from "phosphor-react-native";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Text } from "react-native";
import { z } from "zod";

import { authClient } from "@/platform/auth-client";
import { TextField } from "@/platform/forms/text-field";
import { useTranslation } from "@/platform/i18n";
import { FormError } from "@/platform/ui/form-error";
import { Notice } from "@/platform/ui/notice";

import { refreshSession } from "../session";
import { rememberLoginMethod } from "../last-login-method";
import { AuthLayout } from "./auth-layout";
import { AuthLink } from "./auth-link";
import { SocialButtons } from "./social-buttons";
import { useTurnstile } from "./use-turnstile";
import { Button } from "@/platform/ui/button";

export function SignInForm({ resetDone }: { resetDone?: boolean }) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const turnstile = useTurnstile();
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
      const { error } = await authClient.signIn.email(value, { headers: turnstile.headers });
      turnstile.reset();
      if (error) {
        if (error.code === "EMAIL_NOT_VERIFIED") {
          // Better Auth has just sent a fresh verification link.
          router.push({ pathname: "/verify-email", params: { email: value.email } });
          return;
        }
        setFailure(t(authErrorKey(error)));
        return;
      }
      rememberLoginMethod("email");
      // The route guard moves to the signed-in screens once the session is known.
      await refreshSession(queryClient);
    },
  });

  return (
    <AuthLayout
      title={t("auth__sign_in_title")}
      description={t("auth__sign_in_body")}
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
                {t("auth__sign_in_action")}
              </Button.Label>
            </Button>
          )}
        </form.Subscribe>
      }
      footer={
        <Text className="text-body text-muted">
          {t("auth__no_account")}{" "}
          <AuthLink href="/sign-up" replace>
            {t("nav__sign_up")}
          </AuthLink>
        </Text>
      }
    >
      {resetDone ? <Notice status="success" message={t("auth__reset_done")} /> : null}
      <FormError message={failure} />
      <SocialButtons
        headers={turnstile.headers}
        blocked={turnstile.pending}
        onDone={turnstile.reset}
      />
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
            labelAccessory={<AuthLink href="/forgot-password">{t("auth__forgot_short")}</AuthLink>}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void form.handleSubmit()}
          />
        )}
      </form.Field>
      {turnstile.widget}
    </AuthLayout>
  );
}
