import { useForm } from "@tanstack/react-form";
import { formatWeight, parseWeight, type WeightUnit } from "@workspace/shared";
import { BottomSheet } from "heroui-native";
import { useEffect } from "react";
import { Keyboard, View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Field } from "@/platform/ui/field";
import { mountOnOpen } from "@/platform/ui/mount-on-open";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";

/** A typed amount in the user's unit as kilograms; empty is null, anything else is invalid. */
export function dumbbellMaxOf(text: string, unit: WeightUnit): number | null | "invalid" {
  if (text.trim() === "") return null;
  const kg = parseWeight(text, unit);
  return kg === null || kg <= 0 ? "invalid" : kg;
}

/** The heaviest dumbbell of a gym, per hand; empty clears the limit. */
function DumbbellMaxSheetBody({
  isOpen,
  onOpenChange,
  valueKg,
  unit,
  onSave,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  valueKg: number | null;
  unit: WeightUnit;
  onSave: (kg: number | null) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const keyboardHeight = useKeyboardState((state) => state.height);
  const shown = valueKg === null ? "" : formatWeight(valueKg, unit);
  const form = useForm({
    defaultValues: { max: shown },
    onSubmit: async ({ value: draft }) => {
      // Saving the text as it was shown keeps the stored weight as it is.
      const next = draft.max === shown ? valueKg : dumbbellMaxOf(draft.max, unit);
      if (next === "invalid") return;
      if (await onSave(next)) {
        Keyboard.dismiss();
        onOpenChange(false);
      }
    },
  });
  useEffect(() => {
    if (isOpen) form.reset({ max: shown });
  }, [form, isOpen, shown]);
  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) Keyboard.dismiss();
        onOpenChange(open);
      }}
    >
      <BottomSheet.Portal>
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
            <BottomSheet.Title className="font-semibold text-title-lg">
              {t("gym__dumbbell_max_title")}
            </BottomSheet.Title>
            <BottomSheet.Description className="text-body text-muted">
              {t("gym__dumbbell_max_hint")}
            </BottomSheet.Description>
          </View>
          <form.Field name="max">
            {(field) => (
              <Field
                label={t("gym__dumbbell_max_label", { unit })}
                value={field.state.value}
                onChangeText={field.handleChange}
                keyboardType="decimal-pad"
                placeholder={t("gym__not_set")}
                error={
                  field.state.value !== shown &&
                  dumbbellMaxOf(field.state.value, unit) === "invalid"
                    ? t("gym__invalid_amount")
                    : undefined
                }
              />
            )}
          </form.Field>
          <form.Subscribe
            selector={(state) =>
              state.isSubmitting ||
              (state.values.max !== shown && dumbbellMaxOf(state.values.max, unit) === "invalid")
            }
          >
            {(disabled) => (
              <Button
                variant="primary"
                isDisabled={disabled}
                onPress={() => void form.handleSubmit()}
              >
                <Button.Label>{t("common__save")}</Button.Label>
              </Button>
            )}
          </form.Subscribe>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

export const DumbbellMaxSheet = mountOnOpen(DumbbellMaxSheetBody);
