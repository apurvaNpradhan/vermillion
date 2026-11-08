import { useForm } from "@tanstack/react-form";
import { Input, Label, Spinner, TextField, useToast } from "heroui-native";
import { useMemo } from "react";
import { z } from "zod";

import { TextField as FormTextField } from "@/platform/forms/text-field";
import { useTranslation } from "@/platform/i18n";
import { useUpdateProfile } from "../use-account-actions";

import { useCurrentUser } from "../use-current-user";
import { Button } from "@/platform/ui/button";
import { Card } from "@/platform/ui/card";

export function ProfileSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
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
      toast.show({ variant: "success", label: t("settings__profile_saved") });
    },
  });

  return (
    <Card>
      <Card.Header>
        <Card.Title>{t("settings__profile_title")}</Card.Title>
        <Card.Description>{t("settings__profile_hint")}</Card.Description>
      </Card.Header>
      <Card.Body className="gap-4">
        <form.Field name="name">
          {(field) => (
            <FormTextField
              field={field}
              label={t("settings__profile_name")}
              autoComplete="name"
              textContentType="name"
            />
          )}
        </form.Field>
        <TextField isDisabled>
          <Label>{t("auth__email")}</Label>
          <Input value={user?.email ?? ""} editable={false} />
        </TextField>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              className="self-start"
              onPress={() => void form.handleSubmit()}
              isDisabled={isSubmitting}
            >
              {isSubmitting ? <Spinner size="sm" /> : null}
              <Button.Label>{t("common__save")}</Button.Label>
            </Button>
          )}
        </form.Subscribe>
      </Card.Body>
    </Card>
  );
}
