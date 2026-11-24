import { formatWeight, type Progression, type WeightUnit } from "@workspace/shared";
import { BottomSheet } from "heroui-native";
import { useState } from "react";

import { useMountOnOpen } from "@/platform/ui/mount-on-open";
import { Pressable, Text } from "react-native";
import { useTranslation } from "@/platform/i18n";
import {
  breakWeeks,
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
  if (suggestion.reason === "same_as_last") return null;
  const value = formatWeight(suggestion.incrementKg, unit);
  const params = { value, unit, count: breakWeeks(suggestion) };
  const label = t(progressionLabelKey(suggestion.reason), params);
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
                {t(progressionReasonKey(suggestion.reason), params)}
              </BottomSheet.Description>
            </BottomSheet.Content>
          </BottomSheet.Portal>
        </BottomSheet>
      ) : null}
    </>
  );
}
