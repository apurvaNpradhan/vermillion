import { Minus, Plus } from "phosphor-react-native";
import { useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";

import { haptic } from "@/platform/haptics";
import { useSubtleColor } from "@/platform/theme";

/** Wait before a held button starts repeating, then the gap between repeats. */
const HOLD_DELAY_MS = 450;
const REPEAT_MS = 110;

/**
 * A number with a minus and a plus button. A press steps once (`onPress`, so a screen reader's
 * activation works too); holding past a short delay repeats. The parent owns
 * the value and the rules (`onStep` gets the direction; `canStep` greys a button out at an end).
 */
export function Stepper({
  label,
  valueText,
  onStep,
  canDecrement = true,
  canIncrement = true,
  decrementLabel,
  incrementLabel,
  disabled = false,
}: {
  /** What the number is, for screen readers ("Working sets"). */
  label: string;
  valueText: string;
  onStep: (direction: 1 | -1) => void;
  canDecrement?: boolean;
  canIncrement?: boolean;
  decrementLabel: string;
  incrementLabel: string;
  disabled?: boolean;
}) {
  const subtle = useSubtleColor();
  const hold = useRef<{
    delay: ReturnType<typeof setTimeout> | null;
    every: ReturnType<typeof setInterval> | null;
  }>({
    delay: null,
    every: null,
  });
  const stepRef = useRef(onStep);
  useEffect(() => {
    stepRef.current = onStep;
  });

  const stop = () => {
    if (hold.current.delay) clearTimeout(hold.current.delay);
    if (hold.current.every) clearInterval(hold.current.every);
    hold.current = { delay: null, every: null };
  };
  useEffect(() => stop, []);
  // A button that greys out mid-hold may never report its release; stop repeating.
  useEffect(stop, [canDecrement, canIncrement, disabled]);

  /** Set once a hold has repeated, so the release's `onPress` does not add another step. */
  const repeated = useRef(false);

  const beginHold = (direction: 1 | -1) => {
    stop();
    repeated.current = false;
    hold.current.delay = setTimeout(() => {
      repeated.current = true;
      haptic.tick();
      stepRef.current(direction);
      hold.current.every = setInterval(() => stepRef.current(direction), REPEAT_MS);
    }, HOLD_DELAY_MS);
  };

  const press = (direction: 1 | -1) => {
    if (repeated.current) {
      repeated.current = false;
      return;
    }
    haptic.tick();
    stepRef.current(direction);
  };

  const button = (direction: 1 | -1, enabled: boolean, name: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ disabled: disabled || !enabled }}
      disabled={disabled || !enabled}
      onPress={() => press(direction)}
      onPressIn={() => beginHold(direction)}
      onPressOut={stop}
      hitSlop={4}
      className={`h-11 w-11 items-center justify-center rounded-xl bg-default active:bg-surface ${
        disabled || !enabled ? "opacity-40" : ""
      }`}
    >
      {direction === 1 ? <Plus size={20} color={subtle} /> : <Minus size={20} color={subtle} />}
    </Pressable>
  );

  return (
    <View
      accessible={false}
      accessibilityLabel={label}
      className="flex-row items-center justify-between gap-1"
    >
      {button(-1, canDecrement, decrementLabel)}
      <Text
        accessibilityLabel={`${label}: ${valueText}`}
        accessibilityLiveRegion="polite"
        numberOfLines={1}
        className="min-w-12 flex-1 text-center font-medium text-body text-foreground"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {valueText}
      </Text>
      {button(1, canIncrement, incrementLabel)}
    </View>
  );
}
