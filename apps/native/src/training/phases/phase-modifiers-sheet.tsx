import { SheetPortal } from "@/platform/ui/modal-state";
import { PHASE_PRESETS, type Phase, type PhaseModifiers, type TestTop } from "@workspace/shared";
import { BottomSheet, Switch } from "heroui-native";
import { Text, View } from "react-native";

import { signedEffort, usePhaseText } from "@/platform/phase-text";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { ScrollableSheetContent } from "@/platform/ui/scrollable-sheet-content";
import { SegmentedControl } from "@/platform/ui/segmented-control";
import { useSheetPresent } from "@/platform/ui/use-sheet-present";
import { Stepper } from "@/training/targets/stepper";

import { canStepModifier } from "./phase-modifiers";

/**
 * One phase's modifiers: how its sets are scaled, how its effort targets move and how much of
 * the load it asks for. A Test phase also chooses how its main lift's top set is done.
 * Every adjustment applies immediately. Reset restores the phase's preset effects.
 */
export function PhaseModifiersSheet({
  phase,
  modifiers,
  testTop,
  testWorkups,
  onStep,
  onReset,
  onTopChange,
  onWorkupsChange,
  onClose,
}: {
  phase: Phase;
  modifiers: PhaseModifiers;
  testTop: TestTop;
  testWorkups: boolean;
  onStep: (key: keyof PhaseModifiers, direction: 1 | -1) => void;
  onReset: () => void;
  onTopChange: (value: TestTop) => void;
  onWorkupsChange: (value: boolean) => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const text = usePhaseText();
  const sheet = useSheetPresent();
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 });
  const preset = PHASE_PRESETS[phase];
  const isPreset =
    modifiers.sets === preset.sets &&
    modifiers.rpe === preset.rpe &&
    modifiers.load === preset.load;
  return (
    <BottomSheet
      isOpen={sheet.isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetPortal>
        <BottomSheet.Overlay />
        <ScrollableSheetContent
          footer={
            <Button variant="secondary" onPress={onClose}>
              <Button.Label>{t("common__close")}</Button.Label>
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
                      ? t("phase__value_sets", { value: number.format(modifiers.sets) })
                      : key === "rpe"
                        ? modifiers.rpe === 0
                          ? t("phase__value_none")
                          : t("phase__value_rpe", {
                              value: signedEffort(modifiers.rpe, i18n.language),
                            })
                        : t("phase__value_load", { value: Math.round(modifiers.load * 100) })
                  }
                  onStep={(direction) => onStep(key, direction)}
                  canDecrement={canStepModifier(modifiers, key, -1)}
                  canIncrement={canStepModifier(modifiers, key, 1)}
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
                value={testTop}
                options={[
                  { value: "single", label: t("phase__top_single") },
                  { value: "amrap", label: t("phase__top_amrap") },
                ]}
                onChange={onTopChange}
              />
              {testTop === "single" ? (
                <View className="min-h-11 flex-row items-center justify-between">
                  <Text className="text-body text-foreground">{t("phase__test_workups")}</Text>
                  <Switch
                    accessibilityLabel={t("phase__test_workups")}
                    isSelected={testWorkups}
                    onSelectedChange={onWorkupsChange}
                    hitSlop={10}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
          <Button variant="tertiary" isDisabled={isPreset} onPress={onReset}>
            <Button.Label>{t("phase__reset")}</Button.Label>
          </Button>
        </ScrollableSheetContent>
      </SheetPortal>
    </BottomSheet>
  );
}
