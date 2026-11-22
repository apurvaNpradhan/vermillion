import { useForm } from "@tanstack/react-form";
import { BottomSheet, Spinner } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { ScopedTheme } from "uniwind";

import { useTranslation } from "@/platform/i18n";
import { confirmOnline } from "@/platform/network";
import { Button } from "@/platform/ui/button";
import { Field } from "@/platform/ui/field";
import { NeedsConnection } from "@/platform/ui/needs-connection";
import { ScrollableSheetContent } from "@/platform/ui/scrollable-sheet-content";

import { submitEmail } from "../send-code";
import { useEmailCode } from "../use-email-code";

/**
 * The welcome screen's email step, as a bottom sheet: the field, its validation and the one
 * "Send code" button. A successful send hands the address to `onSent`, which opens the code
 * screen; the sheet never asks for the address a second time. Errors sit under the field, with an
 * icon and words. `scope` re-applies the welcome screen's theme, because a sheet renders in a
 * portal outside the screen's scoped theme.
 */
export function EmailSheet({
  isOpen,
  onOpenChange,
  onSent,
  scope,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: (email: string) => void;
  scope: Parameters<typeof ScopedTheme>[0]["theme"];
}) {
  const { t } = useTranslation();
  const { sendCode } = useEmailCode();
  const [error, setError] = useState<string | undefined>(undefined);

  const form = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      setError(undefined);
      const outcome = await submitEmail(value.email, { confirmOnline, sendCode });
      if (outcome.status === "invalid") setError(t("auth__error_email_invalid"));
      else if (outcome.status === "failed") setError(t(outcome.errorKey));
      else if (outcome.status === "sent") onSent(outcome.email);
    },
  });

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <ScopedTheme theme={scope}>
          <ScrollableSheetContent
            footer={
              <form.Subscribe
                selector={(state) => [state.isSubmitting, state.values.email] as const}
              >
                {([isSubmitting, email]) => (
                  <Button
                    variant="primary"
                    size="lg"
                    className="h-auto min-h-13 rounded-full py-3"
                    isDisabled={email.trim() === "" || isSubmitting}
                    accessibilityState={{
                      disabled: email.trim() === "" || isSubmitting,
                      busy: isSubmitting,
                    }}
                    onPress={() => void form.handleSubmit()}
                  >
                    {isSubmitting ? <Spinner size="sm" /> : null}
                    <Button.Label className="shrink text-body-lg font-semibold">
                      {t("auth__send_code")}
                    </Button.Label>
                  </Button>
                )}
              </form.Subscribe>
            }
          >
            <View className="gap-1">
              <BottomSheet.Title className="font-semibold text-title-lg">
                {t("auth__continue_with_email")}
              </BottomSheet.Title>
              <BottomSheet.Description className="font-normal text-body text-muted">
                {t("auth__email_helper")}
              </BottomSheet.Description>
            </View>
            <form.Field name="email">
              {(field) => (
                <Field
                  accessibilityLabel={t("auth__email")}
                  placeholder={t("auth__email_placeholder")}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  autoCorrect={false}
                  textContentType="emailAddress"
                  returnKeyType="send"
                  autoFocus
                  value={field.state.value}
                  onChangeText={(next) => {
                    if (error) setError(undefined);
                    field.handleChange(next);
                  }}
                  onBlur={field.handleBlur}
                  onSubmitEditing={() => void form.handleSubmit()}
                  error={error}
                />
              )}
            </form.Field>
            <NeedsConnection />
          </ScrollableSheetContent>
        </ScopedTheme>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
