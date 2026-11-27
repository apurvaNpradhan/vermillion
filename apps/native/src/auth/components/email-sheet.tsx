import { SheetPortal } from "@/platform/ui/modal-state";
import { useForm } from "@tanstack/react-form";
import { BottomSheet, Spinner } from "heroui-native";
import { useLayoutEffect, useRef, useState } from "react";
import { View, type TextInput } from "react-native";

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
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: (email: string) => void;
}) {
  const { t } = useTranslation();
  const { sendCode } = useEmailCode();
  const [error, setError] = useState<string | undefined>(undefined);
  const input = useRef<TextInput>(null);

  const focusPending = useRef(false);

  function cancelFocus() {
    focusPending.current = false;
    input.current?.blur();
  }

  useLayoutEffect(() => {
    focusPending.current = isOpen;
    if (!isOpen) input.current?.blur();
  }, [isOpen]);

  function focusAtDetent(index: number) {
    if (index < 0 || !focusPending.current) return;
    focusPending.current = false;
    input.current?.focus();
  }

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
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) cancelFocus();
        onOpenChange(open);
      }}
    >
      <SheetPortal>
        <BottomSheet.Overlay />
        <ScrollableSheetContent
          onChange={focusAtDetent}
          onAnimate={(_from, to) => {
            if (to < 0) cancelFocus();
          }}
          footer={
            <form.Subscribe selector={(state) => [state.isSubmitting, state.values.email] as const}>
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
                ref={input}
                accessibilityLabel={t("auth__email")}
                placeholder={t("auth__email_placeholder")}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                textContentType="emailAddress"
                returnKeyType="send"
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
      </SheetPortal>
    </BottomSheet>
  );
}
