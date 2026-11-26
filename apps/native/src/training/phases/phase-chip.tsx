import type { PhaseNow } from "@workspace/shared";
import { CaretDown } from "phosphor-react-native";
import { Pressable, Text } from "react-native";

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
      hitSlop={8}
      onPress={onPress}
      className="min-h-8 flex-row items-center gap-1 self-start rounded-full bg-default px-2.5 py-0.5 active:opacity-70"
    >
      <Text numberOfLines={1} className="font-medium text-caption tabular-nums text-foreground">
        {label}
      </Text>
      <CaretDown size={12} color={subtle} />
    </Pressable>
  );
}
