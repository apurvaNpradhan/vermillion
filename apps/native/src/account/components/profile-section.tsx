import { isNetworkError } from "@workspace/client/network-error";
import { useForm } from "@tanstack/react-form";
import { Spinner } from "heroui-native";
import { useAppToast } from "@/platform/ui/use-app-toast";
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
import { FormError } from "@/platform/ui/form-error";

import { ChangeEmailSection } from "./change-email-section";

export function ProfileSection() {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const { user } = useCurrentUser();

  const { updateProfile } = useUpdateProfile();
  const [changingEmail, setChangingEmail] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const schema = useMemo(
    () => z.object({ name: z.string().trim().min(1, t("auth__error_name_required")).max(200) }),
    [t],
  );
  const form = useForm({
    defaultValues: { name: user?.name ?? "" },
    validators: { onSubmit: schema },
    onSubmit: async ({ value }) => {
      setFailure(null);
      try {
        await updateProfile({ name: value.name });
      } catch (error) {
        // Offline: say so where the user tapped; any other failure is toasted by the query client.
        if (error instanceof Error && isNetworkError(error)) {
          setFailure(t("errors__offline"));
          return;
        }
        throw error;
      }
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
            <FormError message={failure} />
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
