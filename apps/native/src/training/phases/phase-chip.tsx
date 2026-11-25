import type { PhaseNow } from "@workspace/shared";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { usePhaseText } from "@/platform/phase-text";

/**
 * The Run's current week and phase as one flat chip ("Week 5 · Deload", or "Week 5 of 12 ·
 * Deload" with a planned length). It takes the place of the plain week text on the Run hero.
 */
export function PhaseChip({ phase, totalWeeks }: { phase: PhaseNow; totalWeeks: number | null }) {
  const { t } = useTranslation();
  const text = usePhaseText();
  const label =
    totalWeeks === null
      ? t("phase__week_chip", { week: phase.week, phase: text.name(phase.phase) })
      : t("phase__week_chip_of", {
          week: phase.week,
          total: totalWeeks,
          phase: text.name(phase.phase),
        });
  return (
    <View className="self-start rounded-full bg-default px-2.5 py-0.5">
      <Text
        numberOfLines={1}
        accessibilityLabel={label}
        className="font-medium text-caption tabular-nums text-foreground"
      >
        {label}
      </Text>
    </View>
  );
}
