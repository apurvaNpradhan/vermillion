import { formatWeight, parseWeight, SESSION_LIMITS } from "@workspace/shared";
import type { Equipment, WeightUnit } from "@workspace/shared";
import { BottomSheet } from "heroui-native";
import { useEffect, useState } from "react";
import { Keyboard, View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Field } from "@/platform/ui/field";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";

import { useGyms } from "./use-gyms";
import { useGymSetting } from "./use-gym-setting";

/** A typed amount in the user's unit as kilograms; empty is null, anything else is invalid. */
function kgOf(text: string, unit: WeightUnit): number | null | "invalid" {
  if (text.trim() === "") return null;
  const kg = parseWeight(text, unit);
  return kg === null || kg <= 0 ? "invalid" : kg;
}

const shown = (kg: number | null, unit: WeightUnit) => (kg === null ? "" : formatWeight(kg, unit));

/**
 * Edits what the active gym says about one exercise: the most it can be loaded to, the step it
 * loads in, and a setup note. The same sheet opens from the exercise's settings and from a set in
 * a Session.
 */
export function LoadLimitsSheet({
  isOpen,
  onOpenChange,
  exerciseId,
  title,
  equipment,
  unit,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  exerciseId: string;
  title: string;
  equipment: Equipment;
  unit: WeightUnit;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const keyboardHeight = useKeyboardState((state) => state.height);
  const { multiple, activeGym } = useGyms();
  const setting = useGymSetting(exerciseId, equipment, unit);
  const [max, setMax] = useState("");
  const [step, setStep] = useState("");
  const [note, setNote] = useState("");
  const { maxKg, stepKg, note: savedNote } = setting;
  useEffect(() => {
    if (!isOpen) return;
    setMax(shown(maxKg, unit));
    setStep(shown(stepKg, unit));
    setNote(savedNote ?? "");
  }, [isOpen, maxKg, stepKg, savedNote, unit]);
  const nextMax = kgOf(max, unit);
  const nextStep = kgOf(step, unit);
  const invalid = nextMax === "invalid" || nextStep === "invalid";
  const label = (key: "gym__max_load" | "gym__load_step") =>
    `${t(key)} (${unit})${equipment === "dumbbell" || equipment === "kettlebell" ? ` · ${t("gym__per_hand")}` : ""}`;
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
              {multiple && activeGym
                ? t("gym__limits_hint_at", { gym: activeGym.name })
                : t("gym__limits_hint")}
            </BottomSheet.Description>
          </View>
          <Field
            label={label("gym__max_load")}
            value={max}
            onChangeText={setMax}
            keyboardType="decimal-pad"
            placeholder={t("gym__not_set")}
            error={nextMax === "invalid" ? t("gym__invalid_amount") : undefined}
          />
          <Field
            label={label("gym__load_step")}
            value={step}
            onChangeText={setStep}
            keyboardType="decimal-pad"
            placeholder={t("gym__not_set")}
            error={nextStep === "invalid" ? t("gym__invalid_amount") : undefined}
          />
          <Field
            label={t("gym__setup_note")}
            description={t("gym__setup_note_hint")}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={SESSION_LIMITS.noteMax}
            placeholder={t("gym__setup_note_placeholder")}
          />
          <Button
            variant="primary"
            isDisabled={invalid || !setting.ready}
            onPress={() => {
              Keyboard.dismiss();
              if (nextMax !== "invalid" && nextStep !== "invalid") {
                if (nextMax !== maxKg || nextStep !== stepKg)
                  void setting.setLimits({ maxKg: nextMax, stepKg: nextStep });
                if (note.trim() !== (savedNote ?? "")) void setting.setNote(note);
              }
              onOpenChange(false);
            }}
          >
            <Button.Label>{t("training__effort_done")}</Button.Label>
          </Button>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
