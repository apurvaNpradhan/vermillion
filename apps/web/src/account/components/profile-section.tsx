import { useForm } from "@tanstack/react-form";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@workspace/ui/components/card";
import { toastManager } from "@workspace/ui/components/toast";
import { useMemo } from "react";
import { z } from "zod";

import { TextField } from "@/platform/forms/text-field";
import { useTranslation } from "@/platform/i18n";
import { useUpdateProfile } from "../use-account-actions";

import { useCurrentUser } from "../use-current-user";
import { ChangeEmail } from "./change-email";

export function ProfileSection() {
  const { t } = useTranslation();
  const { user } = useCurrentUser();

  const { updateProfile } = useUpdateProfile();

  const schema = useMemo(
    () => z.object({ name: z.string().trim().min(1, t("auth__error_name_required")).max(200) }),
    [t],
  );
  const form = useForm({
    defaultValues: { name: user?.name ?? "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      await updateProfile({ name: value.name });
      toastManager.add({ type: "success", title: t("settings__profile_saved") });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle render={<h2 />}>{t("settings__profile_title")}</CardTitle>
        <CardDescription>{t("settings__profile_hint")}</CardDescription>
      </CardHeader>
      <CardPanel className="flex max-w-sm flex-col gap-4">
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field name="name">
            {(field) => (
              <TextField field={field} label={t("settings__profile_name")} autoComplete="name" />
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" className="self-start" loading={isSubmitting}>
                {t("common__save")}
              </Button>
            )}
          </form.Subscribe>
        </form>
        {/* Outside the form: it has its own steps and forms. */}
        <ChangeEmail email={user?.email ?? ""} />
      </CardPanel>
    </Card>
  );
}
