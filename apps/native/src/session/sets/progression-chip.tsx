import { type Progression, type WeightUnit } from "@workspace/shared";
import { BottomSheet } from "heroui-native";
import { useState } from "react";

import { useMountOnOpen } from "@/platform/ui/mount-on-open";
import { Pressable, Text } from "react-native";
import { useTranslation } from "@/platform/i18n";
import {
  progressionParams,
  progressionLabelKey,
  progressionReasonKey,
} from "@/platform/ui/progression-reason";
import { SHEET_SPRING, useSheetAnimation } from "@/platform/ui/sheet-motion";

export function ProgressionChip({
  suggestion,
  unit,
}: {
  suggestion: Progression;
  unit: WeightUnit;
}) {
  const animation = useSheetAnimation();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const sheet = useMountOnOpen(open);
  const explanations = suggestion.outcomes.flatMap((outcome, index) => {
    if (!outcome) return [];
    const params = progressionParams(suggestion, outcome, unit);
    return [
      {
        index,
        label: t(progressionLabelKey(outcome.reason), params),
        reason: t(progressionReasonKey(outcome), params),
        show: outcome.reason !== "same_as_last",
      },
    ];
  });
  const first = explanations[0];
  if (!first || !explanations.some((entry) => entry.show)) return null;
  const mixed = explanations.some((entry) => entry.reason !== first.reason);
  const label = mixed ? t("progress__label_mixed") : first.label;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        className="min-h-11 max-w-full self-start justify-center pl-3 pr-2 active:opacity-70"
      >
        <Text className="text-caption font-semibold text-foreground">{label}</Text>
      </Pressable>
      {sheet.mounted ? (
        <BottomSheet animation={animation} isOpen={sheet.open} onOpenChange={setOpen}>
          <BottomSheet.Portal>
            <BottomSheet.Overlay />
            <BottomSheet.Content
              animationConfigs={SHEET_SPRING}
              backgroundClassName="rounded-t-[20px] bg-overlay"
              contentContainerClassName="px-5 pb-10 gap-3"
            >
              <BottomSheet.Title>{t("progress__next")}</BottomSheet.Title>
              <BottomSheet.Description>
                {mixed
                  ? explanations
                      .map(({ index, reason }) =>
                        t("progress__set_reason", { number: index + 1, reason }),
                      )
                      .join("\n")
                  : first.reason}
              </BottomSheet.Description>
            </BottomSheet.Content>
          </BottomSheet.Portal>
        </BottomSheet>
      ) : null}
    </>
  );
}
