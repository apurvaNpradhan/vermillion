import { EFFORT_STEPS, type EffortScale } from "@workspace/shared";
import { Pressable, Text, View, type AccessibilityActionEvent } from "react-native";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";

import {
  effortLabel,
  formatEffortRange,
  isEffortSelected,
  nudgeEffort,
  selectEffort,
  type EffortRange,
} from "../effort";

/**
 * Nine steps, 6 to 10 in halves, labelled in the preferred scale (RPE as stored, RIR counted
 * down from it). Tap a step for a single value, tap another for the range between them, tap a
 * range for a single value, tap the single step again to clear. Plain presses, no gestures, so it
 * works inside modal sheets. The selection uses the surface step and the identity ring, never colour alone: the
 * labels stay legible. Screen readers get increment and decrement.
 */
export function EffortSelector({
  value,
  scale,
  onChange,
}: {
  value: EffortRange | null;
  scale: EffortScale;
  onChange: (value: EffortRange | null) => void;
}) {
  const { t } = useTranslation();

  const choose = (range: EffortRange | null) => {
    haptic.tick();
    onChange(range);
  };

  const a11yValue = value
    ? t("training__effort_value", {
        scale: t(scale === "rpe" ? "training__effort_rpe" : "training__effort_rir"),
        value: formatEffortRange(value.min, value.max, scale),
      })
    : t("training__effort_none");

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t("training__effort_label")}
      accessibilityValue={{ text: a11yValue }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event: AccessibilityActionEvent) => {
        if (event.nativeEvent.actionName === "increment") choose(nudgeEffort(value, 1));
        if (event.nativeEvent.actionName === "decrement") choose(nudgeEffort(value, -1));
      }}
      className="h-11 flex-row rounded-xl bg-default p-0.5"
    >
      {EFFORT_STEPS.map((step, index) => {
        const selected = isEffortSelected(value, index);
        const before = isEffortSelected(value, index - 1);
        const after = isEffortSelected(value, index + 1);
        return (
          <Pressable
            key={step}
            // The control reads as one adjustable element; the segments are touch targets only.
            accessible={false}
            onPress={() => choose(selectEffort(value, step))}
            className={`flex-1 items-center justify-center ${
              selected ? "border-y border-identity bg-surface" : ""
            } ${selected && !before ? "rounded-l-[10px] border-l" : ""} ${
              selected && !after ? "rounded-r-[10px] border-r" : ""
            }`}
          >
            <Text
              className={`text-caption ${selected ? "font-semibold text-foreground" : "text-muted"}`}
              style={{ fontVariant: ["tabular-nums"] }}
            >
              {effortLabel(step, scale)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
