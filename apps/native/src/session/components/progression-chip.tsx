import { formatWeight, type Progression, type WeightUnit } from "@workspace/shared";
import { BottomSheet } from "heroui-native";
import { useState } from "react";
import { Pressable, Text } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { progressionReasonKey } from "@/platform/ui/progression-reason";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";

export function ProgressionChip({
  suggestion,
  unit,
}: {
  suggestion: Progression;
  unit: WeightUnit;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (suggestion.reason === "same_as_last") return null;
  const value = formatWeight(suggestion.incrementKg, unit);
  const label =
    suggestion.reason === "add_weight"
      ? t("progress__add_weight_chip", { value, unit })
      : t(suggestion.reason === "hold" ? "progress__hold_chip" : "progress__add_rep_chip");
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={() => setOpen(true)}
        className="min-h-11 justify-center px-2"
      >
        <Text className="text-caption font-semibold text-identity">{label}</Text>
      </Pressable>
      <BottomSheet isOpen={open} onOpenChange={setOpen}>
        <BottomSheet.Portal>
          <BottomSheet.Overlay />
          <BottomSheet.Content
            animationConfigs={SHEET_SPRING}
            backgroundClassName="bg-overlay"
            contentContainerClassName="px-5 pb-10 gap-3"
          >
            <BottomSheet.Title>{t("progress__next")}</BottomSheet.Title>
            <BottomSheet.Description>
              {t(progressionReasonKey(suggestion.reason), { value, unit })}
            </BottomSheet.Description>
          </BottomSheet.Content>
        </BottomSheet.Portal>
      </BottomSheet>
    </>
  );
}
