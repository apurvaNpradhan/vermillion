import { useForm } from "@tanstack/react-form";
import { formatWeight, loadBasisOf, parseWeight, SESSION_LIMITS } from "@workspace/shared";
import type { Equipment, WeightUnit } from "@workspace/shared";
import { BottomSheet } from "heroui-native";
import { useEffect, useState } from "react";
import { Keyboard, View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Field } from "@/platform/ui/field";
import { mountOnOpen } from "@/platform/ui/mount-on-open";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";

import { useGymSetting } from "./use-gym-setting";

/** A typed amount in the user's unit as kilograms; empty is null, anything else is invalid. */
function kgOf(text: string, unit: WeightUnit): number | null | "invalid" {
  if (text.trim() === "") return null;
  const kg = parseWeight(text, unit);
  return kg === null || kg <= 0 ? "invalid" : kg;
}

const shown = (kg: number | null, unit: WeightUnit) => (kg === null ? "" : formatWeight(kg, unit));

/**
 * Edits what a gym says about one exercise: the most it can be loaded to, the step it loads in,
 * and a setup note. The same sheet opens from the exercise's settings (the gym trained at) and
 * from a set in a Session (the Session's gym, else the gym trained at).
 */
function LoadLimitsSheetBody({
  isOpen,
  onOpenChange,
  exerciseId,
  title,
  equipment,
  unit,
  gymId: forGymId,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  exerciseId: string;
  title: string;
  equipment: Equipment;
  unit: WeightUnit;
  /** The gym to edit; none is the gym trained at. */
  gymId?: string | null;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const keyboardHeight = useKeyboardState((state) => state.height);
  const setting = useGymSetting(exerciseId, forGymId);
  const [baseline, setBaseline] = useState<{
    gymId: string;
    exerciseId: string;
    unit: WeightUnit;
    maxKg: number | null;
    stepKg: number | null;
    note: string;
  } | null>(null);
  const { gymId, ready, maxKg, stepKg, note: savedNote } = setting;
  const draftReady =
    ready &&
    baseline !== null &&
    baseline.gymId === gymId &&
    baseline.exerciseId === exerciseId &&
    baseline.unit === unit;
  const amount = (text: string, original: number | null) =>
    text === shown(original, unit) ? original : kgOf(text, unit);
  const maxOf = (text: string) => amount(text, baseline?.maxKg ?? null);
  const stepOf = (text: string) => amount(text, baseline?.stepKg ?? null);
  const stepTooLarge = (step: ReturnType<typeof kgOf>, max: ReturnType<typeof kgOf>) =>
    step !== "invalid" && step !== null && max !== "invalid" && max !== null && step > max;
  const form = useForm({
    defaultValues: { max: "", step: "", note: "" },
    onSubmit: async ({ value: draft }) => {
      const nextMax = maxOf(draft.max);
      const nextStep = stepOf(draft.step);
      if (
        !draftReady ||
        nextMax === "invalid" ||
        nextStep === "invalid" ||
        stepTooLarge(nextStep, nextMax)
      )
        return;
      if (
        await setting.save({
          limits:
            nextMax !== baseline.maxKg || nextStep !== baseline.stepKg
              ? { maxKg: nextMax, stepKg: nextStep }
              : undefined,
          note: draft.note.trim() !== baseline.note ? draft.note : undefined,
        })
      ) {
        Keyboard.dismiss();
        onOpenChange(false);
      }
    },
  });
  useEffect(() => {
    if (!isOpen) {
      setBaseline(null);
      return;
    }
    if (
      !ready ||
      gymId === null ||
      (baseline?.gymId === gymId && baseline.exerciseId === exerciseId && baseline.unit === unit)
    )
      return;
    setBaseline({ gymId, exerciseId, unit, maxKg, stepKg, note: savedNote ?? "" });
    form.reset({ max: shown(maxKg, unit), step: shown(stepKg, unit), note: savedNote ?? "" });
  }, [isOpen, baseline, gymId, exerciseId, ready, maxKg, stepKg, savedNote, unit, form]);
  const label = (key: "gym__max_load" | "gym__load_step") =>
    t(loadBasisOf(equipment) === "per_hand" ? "gym__amount_per_hand_label" : "gym__amount_label", {
      label: t(key),
      unit,
    });
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
            <BottomSheet.Title numberOfLines={1} className="font-semibold text-title-lg">
              {title}
            </BottomSheet.Title>
            <BottomSheet.Description className="text-body text-muted">
              {setting.gymName
                ? t("gym__limits_hint_at", { gym: setting.gymName })
                : t("gym__limits_hint")}
            </BottomSheet.Description>
          </View>
          <form.Field name="max">
            {(field) => (
              <Field
                label={label("gym__max_load")}
                value={field.state.value}
                onChangeText={field.handleChange}
                keyboardType="decimal-pad"
                placeholder={t("gym__not_set")}
                disabled={!draftReady}
                error={
                  maxOf(field.state.value) === "invalid" ? t("gym__invalid_amount") : undefined
                }
              />
            )}
          </form.Field>
          <form.Subscribe selector={(state) => state.values.max}>
            {(max) => (
              <form.Field name="step">
                {(field) => {
                  const step = stepOf(field.state.value);
                  const error =
                    step === "invalid"
                      ? t("gym__invalid_amount")
                      : stepTooLarge(step, maxOf(max))
                        ? t("gym__invalid_step")
                        : undefined;
                  return (
                    <Field
                      label={label("gym__load_step")}
                      value={field.state.value}
                      onChangeText={field.handleChange}
                      keyboardType="decimal-pad"
                      placeholder={t("gym__not_set")}
                      disabled={!draftReady}
                      error={error}
                    />
                  );
                }}
              </form.Field>
            )}
          </form.Subscribe>
          <form.Field name="note">
            {(field) => (
              <Field
                label={t("gym__setup_note")}
                description={t("gym__setup_note_hint")}
                value={field.state.value}
                onChangeText={field.handleChange}
                maxLength={SESSION_LIMITS.noteMax}
                placeholder={t("gym__setup_note_placeholder")}
                disabled={!draftReady}
              />
            )}
          </form.Field>
          <form.Subscribe
            selector={(state) => {
              const max = maxOf(state.values.max);
              const step = stepOf(state.values.step);
              return (
                state.isSubmitting ||
                max === "invalid" ||
                step === "invalid" ||
                stepTooLarge(step, max)
              );
            }}
          >
            {(disabled) => (
              <Button
                variant="primary"
                isDisabled={disabled || !draftReady}
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

export const LoadLimitsSheet = mountOnOpen(LoadLimitsSheetBody);
