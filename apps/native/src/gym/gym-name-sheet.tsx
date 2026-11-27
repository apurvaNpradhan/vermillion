import { useForm } from "@tanstack/react-form";
import { SheetPortal } from "@/platform/ui/modal-state";
import { GYM_LIMITS } from "@workspace/shared";
import { BottomSheet } from "heroui-native";
import { useEffect } from "react";
import { Keyboard, View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { TextField } from "@/platform/forms/text-field";
import { mountOnOpen } from "@/platform/ui/mount-on-open";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";

/** A gym's name: the new gym's, or a rename. */
function GymNameSheetBody({
  isOpen,
  onOpenChange,
  title,
  description,
  value,
  confirmLabel,
  onSave,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  value: string;
  confirmLabel: string;
  onSave: (name: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const keyboardHeight = useKeyboardState((state) => state.height);
  const form = useForm({
    defaultValues: { name: value },
    onSubmit: async ({ value: draft }) => {
      const name = draft.name.trim();
      if (name && (await onSave(name))) {
        Keyboard.dismiss();
        onOpenChange(false);
      }
    },
  });
  useEffect(() => {
    if (isOpen) form.reset({ name: value });
  }, [form, isOpen, value]);
  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) Keyboard.dismiss();
        onOpenChange(open);
      }}
    >
      <SheetPortal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          bottomInset={keyboardHeight}
          keyboardBehavior="extend"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
          enableContentPanningGesture={false}
          animationConfigs={SHEET_SPRING}
          backgroundClassName="rounded-t-[28px] bg-overlay"
          contentContainerClassName="gap-4 px-4 pt-2"
          contentContainerProps={{ style: { paddingBottom: bottom + 16 } }}
        >
          <View className="gap-1">
            <BottomSheet.Title className="font-semibold text-title-lg">{title}</BottomSheet.Title>
            {description ? (
              <BottomSheet.Description className="text-body text-muted">
                {description}
              </BottomSheet.Description>
            ) : null}
          </View>
          <form.Field name="name">
            {(field) => (
              <TextField
                field={field}
                label={t("gym__name")}
                maxLength={GYM_LIMITS.nameMax}
                placeholder={t("gym__name_placeholder")}
                returnKeyType="done"
              />
            )}
          </form.Field>
          <form.Subscribe
            selector={(state) => state.isSubmitting || state.values.name.trim() === ""}
          >
            {(disabled) => (
              <Button
                variant="primary"
                isDisabled={disabled}
                onPress={() => void form.handleSubmit()}
              >
                <Button.Label>{confirmLabel}</Button.Label>
              </Button>
            )}
          </form.Subscribe>
        </BottomSheet.Content>
      </SheetPortal>
    </BottomSheet>
  );
}

export const GymNameSheet = mountOnOpen(GymNameSheetBody);
