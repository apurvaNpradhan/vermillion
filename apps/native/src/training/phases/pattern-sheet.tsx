import { PATTERN_PRESETS, PHASES, PHASE_PATTERN_MAX, type Phase } from "@workspace/shared";
import { BottomSheet } from "heroui-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { usePhaseText } from "@/platform/phase-text";
import { Button } from "@/platform/ui/button";
import { ScrollableSheetContent } from "@/platform/ui/scrollable-sheet-content";
import { useSheetPresent } from "@/platform/ui/use-sheet-present";

/** The next phase when a week's chip is tapped: Build, Push, Test, Deload, and round again. */
const nextPhase = (phase: Phase): Phase =>
  PHASES[(PHASES.indexOf(phase) + 1) % PHASES.length] ?? "build";

/**
 * The repeating pattern of a Program's weeks, edited as chips: tap a week to cycle its phase,
 * add or remove the last week, or start from a usual pattern. Nothing is saved until Save; an
 * empty pattern means no phases. Mount it only while wanted.
 */
export function PatternSheet({
  pattern,
  onSave,
  onClose,
}: {
  /** The current pattern; empty when the Program has no phases. */
  pattern: readonly Phase[];
  onSave: (pattern: readonly Phase[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const text = usePhaseText();
  const sheet = useSheetPresent();
  const [draft, setDraft] = useState<readonly Phase[]>(pattern);
  const full = draft.length >= PHASE_PATTERN_MAX;
  const changed =
    draft.length !== pattern.length || draft.some((phase, index) => phase !== pattern[index]);
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
            <View className="gap-2">
              <Button
                isDisabled={!changed}
                onPress={() => {
                  onSave(draft);
                  onClose();
                }}
              >
                <Button.Label>{t("common__save")}</Button.Label>
              </Button>
            </View>
          }
        >
          {sheet.probe}
          <View className="gap-1">
            <BottomSheet.Title className="font-semibold text-title-lg">
              {t("phase__pattern_title")}
            </BottomSheet.Title>
            <BottomSheet.Description className="font-normal text-body text-muted">
              {t("phase__pattern_body")}
            </BottomSheet.Description>
          </View>
          {draft.length === 0 ? (
            <Text className="font-normal text-body text-muted">{t("phase__pattern_empty")}</Text>
          ) : (
            <View className="flex-row flex-wrap gap-2">
              {draft.map((phase, index) => (
                <Pressable
                  // The pattern may repeat a phase; its place is its identity.
                  // eslint-disable-next-line react/no-array-index-key
                  key={index}
                  accessibilityRole="button"
                  accessibilityLabel={t("phase__pattern_week", {
                    week: index + 1,
                    phase: text.name(phase),
                  })}
                  accessibilityHint={t("phase__pattern_week_hint")}
                  onPress={() => {
                    haptic.tick();
                    setDraft((current) =>
                      current.map((item, at) => (at === index ? nextPhase(item) : item)),
                    );
                  }}
                  className="min-h-11 min-w-20 items-center justify-center rounded-xl bg-default px-3 active:opacity-70"
                >
                  <Text className="font-normal text-caption tabular-nums text-muted">
                    {index + 1}
                  </Text>
                  <Text className="font-medium text-body text-foreground">{text.name(phase)}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <View className="flex-row gap-3">
            <Button
              className="flex-1"
              variant="secondary"
              isDisabled={full}
              onPress={() => setDraft((current) => [...current, "build"])}
            >
              <Button.Label>{t("phase__pattern_add")}</Button.Label>
            </Button>
            <Button
              className="flex-1"
              variant="secondary"
              isDisabled={draft.length === 0}
              onPress={() => setDraft((current) => current.slice(0, -1))}
            >
              <Button.Label>{t("phase__pattern_remove")}</Button.Label>
            </Button>
          </View>
          <View className="gap-1">
            {PATTERN_PRESETS.map((preset) => (
              <Pressable
                key={preset.join("-")}
                accessibilityRole="button"
                onPress={() => setDraft(preset)}
                className="min-h-11 justify-center active:opacity-60"
              >
                <Text className="font-normal text-body text-foreground">
                  {text.pattern(preset)}
                </Text>
              </Pressable>
            ))}
            {draft.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setDraft([])}
                className="min-h-11 justify-center active:opacity-60"
              >
                <Text className="font-normal text-body text-muted">
                  {t("phase__pattern_clear")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </ScrollableSheetContent>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
