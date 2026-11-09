import { useForm } from "@tanstack/react-form";
import { Spinner, useToast } from "heroui-native";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { z } from "zod";

import { TextField as FormTextField } from "@/platform/forms/text-field";
import { useTranslation } from "@/platform/i18n";
import { useUpdateProfile } from "../use-account-actions";

import { useCurrentUser } from "../use-current-user";
import { Button } from "@/platform/ui/button";
import { Card } from "@/platform/ui/card";
import { Field } from "@/platform/ui/field";

import { ChangeEmailSection } from "./change-email-section";

export function ProfileSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useCurrentUser();

  const { updateProfile } = useUpdateProfile();
  const [changingEmail, setChangingEmail] = useState(false);

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
    <>
      <View className="gap-2">
        <Text
          accessibilityRole="header"
          className="px-1 font-semibold text-overline uppercase text-muted"
        >
          {t("settings__profile_details")}
        </Text>
        <Card>
          <Card.Body className="gap-4">
            <form.Field name="name">
              {(field) => (
                <FormTextField
                  field={field}
                  label={t("settings__profile_name")}
                  description={t("settings__profile_hint")}
                  autoComplete="name"
                  textContentType="name"
                />
              )}
            </form.Field>
            <form.Subscribe
              selector={(state) => ({
                isSubmitting: state.isSubmitting,
                dirty: state.values.name.trim() !== (user?.name ?? ""),
              })}
            >
              {({ isSubmitting, dirty }) =>
                dirty ? (
                  <Button onPress={() => void form.handleSubmit()} isDisabled={isSubmitting}>
                    {isSubmitting ? <Spinner size="sm" /> : null}
                    <Button.Label>{t("common__save")}</Button.Label>
                  </Button>
                ) : null
              }
            </form.Subscribe>
          </Card.Body>
        </Card>
        <Card>
          <Card.Body>
            <Field
              label={t("auth__email")}
              value={user?.email ?? ""}
              editable={false}
              end={
                changingEmail ? null : (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => setChangingEmail(true)}
                  >
                    <Text className="text-label font-semibold text-foreground">
                      {t("settings__email_change")}
                    </Text>
                  </Pressable>
                )
              }
            />
          </Card.Body>
        </Card>
      </View>
      {changingEmail ? <ChangeEmailSection onDone={() => setChangingEmail(false)} /> : null}
    </>
  );
}
