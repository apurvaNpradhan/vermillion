import { useQueryClient } from "@tanstack/react-query";
import { clearSession } from "@workspace/client/session";
import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@workspace/ui/components/button";
import { useMemo, useState } from "react";
import { z } from "zod";

import { authClient } from "@/platform/auth-client";
import { authErrorKey } from "@workspace/client/auth-error";
import { TextField } from "@/platform/forms/text-field";
import { useTranslation } from "@/platform/i18n";

import { AuthLayout } from "./auth-layout";
import { FormError } from "./form-error";

/** The page the reset email links to; Better Auth appends `token` (or `error=INVALID_TOKEN`). */
export function ResetPasswordForm({
  token,
  error,
}: {
  token?: string | undefined;
  error?: string | undefined;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
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
      await navigate({ to: "/login", search: { reset: "done" } });
    },
  });

  if (!token || error) {
    return (
      <AuthLayout
        title={t("auth__reset_title")}
        footer={
          <Link to="/forgot-password" className="text-label text-muted-foreground underline">
            {t("auth__forgot_title")}
          </Link>
        }
      >
        <FormError message={t("auth__reset_invalid")} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t("auth__reset_title")}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FormError message={failure} />
        <form.Field name="password">
          {(field) => (
            <TextField
              field={field}
              label={t("auth__password_new")}
              type="password"
              autoComplete="new-password"
              description={t("auth__password_hint")}
            />
          )}
        </form.Field>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" loading={isSubmitting}>
              {t("auth__reset_action")}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </AuthLayout>
  );
}
