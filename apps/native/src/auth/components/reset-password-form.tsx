import { useQueryClient } from "@tanstack/react-query";
import { clearSession } from "@workspace/client/session";
import { useForm } from "@tanstack/react-form";
import { authErrorKey } from "@workspace/client/auth-error";
import { Spinner } from "heroui-native";
import { LockSimple } from "phosphor-react-native";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { z } from "zod";

import { authClient } from "@/platform/auth-client";
import { TextField } from "@/platform/forms/text-field";
import { useTranslation } from "@/platform/i18n";
import { FormError } from "@/platform/ui/form-error";

import { AuthLayout } from "./auth-layout";
import { AuthLink } from "./auth-link";
import { Button } from "@/platform/ui/button";

/** The screen the reset email links to; Better Auth appends `token` (or `error=INVALID_TOKEN`). */
export function ResetPasswordForm({ token, error }: { token?: string; error?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      z.object({
        password: z
          .string()
          .min(10, t("auth__error_password_short"))
          .max(128, t("auth__error_password_long")),
      }),
    [t],
  );

  const form = useForm({
    defaultValues: { password: "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      if (!token) return;
      setFailure(null);
      const result = await authClient.resetPassword({ newPassword: value.password, token });
      if (result.error) {
        setFailure(t(authErrorKey(result.error)));
        return;
      }
      await clearSession(queryClient);
      router.replace({ pathname: "/sign-in", params: { reset: "done" } });
    },
  });

  if (!token || error) {
    return (
      <AuthLayout
        title={t("auth__reset_title")}
        footer={<AuthLink href="/forgot-password">{t("auth__forgot_title")}</AuthLink>}
      >
        <FormError message={t("auth__reset_invalid")} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("auth__reset_title")}>
      <FormError message={failure} />
      <form.Field name="password">
        {(field) => (
          <TextField
            field={field}
            label={t("auth__password_new")}
            icon={LockSimple}
            description={t("auth__password_hint")}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
          />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <Button
            size="lg"
            className="h-14 rounded-xl"
            onPress={() => void form.handleSubmit()}
            isDisabled={isSubmitting}
          >
            {isSubmitting ? <Spinner size="sm" /> : null}
            <Button.Label>{t("auth__reset_action")}</Button.Label>
          </Button>
        )}
      </form.Subscribe>
    </AuthLayout>
  );
}
