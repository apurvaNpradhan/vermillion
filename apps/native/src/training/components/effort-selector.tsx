import { EFFORT_STEPS, type EffortScale } from "@workspace/shared";
import { useEffect, useRef, useState } from "react";
import { Text, View, type AccessibilityActionEvent } from "react-native";
import {
  GestureDetector,
  useCompetingGestures,
  usePanGesture,
  useTapGesture,
} from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { indexAtPosition } from "@/platform/ui/segmented-index";

import {
  dragEffort,
  effortLabel,
  formatEffortRange,
  isEffortSelected,
  nudgeEffort,
  tapEffort,
  type EffortRange,
} from "../effort";

const COUNT = EFFORT_STEPS.length;

/**
 * Nine steps, 6 to 10 in halves, labelled in the preferred scale (RPE as stored, RIR counted
 * down from it). Tap one for a single value, tap it again to clear, or drag across several for a
 * range. The selection uses the surface step and the identity ring, never colour alone: the
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
  const [width, setWidth] = useState(0);

  const choose = (range: EffortRange | null) => {
    haptic.tick();
    onChange(range);
  };
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });

  // A drag selects from the segment it began on to the one under the finger; a tap selects one.
  const start = useRef(-1);
  const last = useRef(-1);
  const begin = (index: number) => {
    start.current = index;
    last.current = index;
  };
  const move = (index: number) => {
    if (start.current < 0 || index === last.current) return;
    last.current = index;
    choose(dragEffort(start.current, index));
  };
  const tap = (index: number) => {
    const step = EFFORT_STEPS[index];
    if (step !== undefined) choose(tapEffort(valueRef.current, step));
  };

  const pan = usePanGesture({
    activeOffsetX: [-6, 6],
    failOffsetY: [-14, 14],
    onActivate: (event) => {
      scheduleOnRN(begin, indexAtPosition(event.x - event.translationX, width, COUNT));
    },
    onUpdate: (event) => {
      scheduleOnRN(move, indexAtPosition(event.x, width, COUNT));
    },
    onFinalize: () => {
      scheduleOnRN(begin, -1);
    },
  });
  const press = useTapGesture({
    onActivate: (event) => {
      scheduleOnRN(tap, indexAtPosition(event.x, width, COUNT));
    },
  });
  const gesture = useCompetingGestures(pan, press);

  const a11yValue = value
    ? t("training__effort_value", {
        scale: t(scale === "rpe" ? "training__effort_rpe" : "training__effort_rir"),
        value: formatEffortRange(value.min, value.max, scale),
      })
    : t("training__effort_none");

  return (
    <GestureDetector gesture={gesture}>
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
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        className="h-11 flex-row rounded-xl bg-default p-0.5"
      >
        {EFFORT_STEPS.map((step, index) => {
          const selected = isEffortSelected(value, index);
          const before = isEffortSelected(value, index - 1);
          const after = isEffortSelected(value, index + 1);
          return (
            <View
              key={step}
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
            </View>
          );
        })}
      </View>
    </GestureDetector>
  );
}
