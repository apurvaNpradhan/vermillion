import { PHASE_PRESETS, type Phase, type PhaseModifiers, type TestTop } from "@workspace/shared";
import { BottomSheet, Switch } from "heroui-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { signedEffort, usePhaseText } from "@/platform/phase-text";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { ScrollableSheetContent } from "@/platform/ui/scrollable-sheet-content";
import { SegmentedControl } from "@/platform/ui/segmented-control";
import { useSheetPresent } from "@/platform/ui/use-sheet-present";
import { Stepper } from "@/training/targets/stepper";

import { canStepModifier, stepModifier } from "./phase-modifiers";

/**
 * One phase's modifiers: how its sets are scaled, how its effort targets move and how much of
 * the load it asks for. A Test phase also chooses how its main lift's top set is done. Save
 * stores only what differs from the preset; Reset goes back to it. Mount it only while wanted.
 */
export function PhaseModifiersSheet({
  phase,
  modifiers,
  testTop,
  testWorkups,
  onSave,
  onClose,
}: {
  phase: Phase;
  modifiers: PhaseModifiers;
  testTop: TestTop;
  testWorkups: boolean;
  onSave: (modifiers: PhaseModifiers, testTop: TestTop, testWorkups: boolean) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const text = usePhaseText();
  const sheet = useSheetPresent();
  const [draft, setDraft] = useState(modifiers);
  const [top, setTop] = useState(testTop);
  const [workups, setWorkups] = useState(testWorkups);
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  const preset = PHASE_PRESETS[phase];
  const edited =
    draft.sets !== modifiers.sets ||
    draft.rpe !== modifiers.rpe ||
    draft.load !== modifiers.load ||
    top !== testTop ||
    workups !== testWorkups;
  const isPreset =
    draft.sets === preset.sets && draft.rpe === preset.rpe && draft.load === preset.load;
  return (
    <BottomSheet
      isOpen={sheet.isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <ScrollableSheetContent
          footer={
            <Button
              isDisabled={!edited}
              onPress={() => {
                onSave(draft, top, workups);
                onClose();
              }}
            >
              <Button.Label>{t("common__save")}</Button.Label>
            </Button>
          }
        >
          {sheet.probe}
          <View className="gap-1">
            <BottomSheet.Title className="font-semibold text-title-lg">
              {text.name(phase)}
            </BottomSheet.Title>
            <BottomSheet.Description className="font-normal text-body text-muted">
              {text.hint(phase)}
            </BottomSheet.Description>
          </View>
          <View className="gap-1">
            {(["sets", "rpe", "load"] as const).map((key) => (
              <View key={key} className="min-h-12 flex-row items-center justify-between gap-3">
                <Text className="font-normal flex-1 text-body text-foreground">
                  {t(`phase__modifier_${key}`)}
                </Text>
                <Stepper
                  label={t(`phase__modifier_${key}`)}
                  valueText={
                    key === "sets"
                      ? t("phase__value_sets", { value: number.format(draft.sets) })
                      : key === "rpe"
                        ? draft.rpe === 0
                          ? t("phase__value_none")
                          : t("phase__value_rpe", { value: signedEffort(draft.rpe, i18n.language) })
                        : t("phase__value_load", { value: Math.round(draft.load * 100) })
                  }
                  onStep={(direction) =>
                    setDraft((current) => stepModifier(current, key, direction))
                  }
                  canDecrement={canStepModifier(draft, key, -1)}
                  canIncrement={canStepModifier(draft, key, 1)}
                  decrementLabel={t("phase__modifier_less", { name: t(`phase__modifier_${key}`) })}
                  incrementLabel={t("phase__modifier_more", { name: t(`phase__modifier_${key}`) })}
                />
              </View>
            ))}
          </View>
          {phase === "test" ? (
            <View className="gap-2">
              <Text className="text-caption font-medium text-muted">{t("phase__top_title")}</Text>
              <SegmentedControl
                accessibilityLabel={t("phase__top_title")}
                value={top}
                options={[
                  { value: "single", label: t("phase__top_single") },
                  { value: "amrap", label: t("phase__top_amrap") },
                ]}
                onChange={setTop}
              />
              {top === "single" ? (
                <View className="min-h-11 flex-row items-center justify-between">
                  <Text className="text-body text-foreground">{t("phase__test_workups")}</Text>
                  <Switch
                    accessibilityLabel={t("phase__test_workups")}
                    isSelected={workups}
                    onSelectedChange={setWorkups}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
          <Button variant="tertiary" isDisabled={isPreset} onPress={() => setDraft({ ...preset })}>
            <Button.Label>{t("phase__reset")}</Button.Label>
          </Button>
        </ScrollableSheetContent>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
