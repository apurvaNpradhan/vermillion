import type { Adjustment } from "@workspace/shared";
import { Pressable, Text, View } from "react-native";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";

/**
 * One quiet line under an open exercise that says why its unticked targets moved: "Lighter: set 1
 * was 3 reps short." Undo restores the original targets for this Session and stops further
 * adjustments of the exercise.
 */
export function AdjustmentNote({
  adjustment,
  setLabel,
  onUndo,
}: {
  adjustment: Adjustment;
  setLabel: string;
  onUndo?: () => void;
}) {
  const { t } = useTranslation();
  const params = { set: setLabel, count: adjustment.reps };
  const text =
    adjustment.reason === "reps_short"
      ? t("session__adjust_reps_short", params)
      : adjustment.reason === "reps_over"
        ? t("session__adjust_reps_over", params)
        : adjustment.reason === "effort_high"
          ? t("session__adjust_effort_high", params)
          : t("session__adjust_effort_low", params);
  return (
    <View
      className="min-h-11 flex-row items-center justify-between gap-2"
      accessibilityLiveRegion="polite"
    >
      <Text className="flex-1 font-normal text-caption text-muted">{text}</Text>
      {onUndo ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("session__adjust_undo_label")}
          hitSlop={8}
          onPress={() => {
            haptic.tick();
            onUndo();
          }}
          className="min-h-11 justify-center px-2 active:opacity-70"
        >
          <Text className="font-semibold text-caption text-foreground">
            {t("session__adjust_undo")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
