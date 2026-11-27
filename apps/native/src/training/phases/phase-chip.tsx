import type { PhaseNow } from "@workspace/shared";
import { CaretDown } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { usePhaseText } from "@/platform/phase-text";
import { useSubtleColor } from "@/platform/theme";

/**
 * The Program's current week as one flat chip: "Week 5 · Deload", "Week 5 of 12 · Deload", or just
 * "Week 5 of 12" when the Program has no phases. Tapping it opens what the week allows.
 */
export function PhaseChip({
  phase,
  week,
  totalWeeks,
  onPress,
  accessibilityHint,
}: {
  /** The phase running now; null for a Program with no phases. */
  phase: PhaseNow | null;
  week: number;
  totalWeeks: number | null;
  onPress: () => void;
  accessibilityHint: string;
}) {
  const { t } = useTranslation();
  const text = usePhaseText();
  const subtle = useSubtleColor();
  const label = phase
    ? totalWeeks === null
      ? t("phase__week_chip", { week, phase: text.name(phase.phase) })
      : t("phase__week_chip_of", { week, total: totalWeeks, phase: text.name(phase.phase) })
    : totalWeeks === null
      ? t("run__week", { week })
      : t("run__week_of", { week, total: totalWeeks });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      className="min-h-11 min-w-11 justify-center self-start active:opacity-70"
    >
      <View className="min-h-8 flex-row items-center gap-1 rounded-full bg-default px-2.5 py-0.5">
        <Text
          numberOfLines={1}
          className="shrink font-medium text-caption tabular-nums text-foreground"
        >
          {label}
        </Text>
        <CaretDown size={12} color={subtle} />
      </View>
    </Pressable>
  );
}
