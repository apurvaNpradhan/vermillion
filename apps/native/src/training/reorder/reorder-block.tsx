import { createContext, useContext, useLayoutEffect, useRef, type ReactNode } from "react";
import { View, type ViewProps } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { haptic } from "@/platform/haptics";
import { useReduceMotion } from "@/platform/ui/use-reduce-motion";

/** How long a touch rests on the header before the block starts to lift. */
const LIFT_DELAY = 140;
const LONG_PRESS = 380;
/** The highlight is seen for this long before the Reorder view opens over it. */
const OPEN_DELAY = 140;
const EASE = { duration: 160, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System };

type Block = { pressed: SharedValue<number>; enabled: boolean; onReorder: () => void };
const BlockContext = createContext<Block | null>(null);

/**
 * One exercise (or slot) as a single block: while its header is held, the whole block takes one
 * surface tint and lifts slightly, so it is clear what a long press will move. The long press
 * itself is recognised only on the `ReorderTrigger` inside, so taps in the set grid are untouched.
 * It opens the Reorder view through `onReorder`.
 */
export function ReorderBlock({
  children,
  onReorder,
  enabled = true,
}: {
  children: ReactNode;
  onReorder: () => void;
  enabled?: boolean;
}) {
  const pressed = useSharedValue(0);
  const reduced = useReduceMotion();
  const lift = useAnimatedStyle(() => ({
    transform: [{ scale: reduced ? 1 : 1 - 0.012 * pressed.value }],
  }));
  const tint = useAnimatedStyle(() => ({ opacity: pressed.value }));
  return (
    <BlockContext value={{ pressed, enabled, onReorder }}>
      <Animated.View style={lift}>
        {children}
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="absolute inset-0 bg-foreground/10"
          style={tint}
        />
      </Animated.View>
    </BlockContext>
  );
}

/** The part of a block that starts the long press: the header, never the set grid. */
export function ReorderTrigger(props: ViewProps) {
  const block = useContext(BlockContext);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabled = block?.enabled ?? false;
  const onReorder = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    onReorder.current = enabled ? (block?.onReorder ?? null) : null;
  });
  useLayoutEffect(
    () => () => {
      onReorder.current = null;
      if (timer.current) clearTimeout(timer.current);
    },
    [enabled],
  );
  const open = () => {
    if (!onReorder.current) return;
    haptic.confirm();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onReorder.current?.(), OPEN_DELAY);
  };
  const pressed = block?.pressed;
  const activated = useSharedValue(false);
  const gesture = usePanGesture({
    enabled,
    activateAfterLongPress: LONG_PRESS,
    // A finger that moves before the long press is a scroll: the pan fails and the block lets go.
    onBegin: () => {
      if (pressed) pressed.value = withDelay(LIFT_DELAY, withTiming(1, EASE));
    },
    onActivate: () => {
      activated.value = true;
      if (pressed) pressed.value = withTiming(1, EASE);
      scheduleOnRN(open);
    },
    onFinalize: () => {
      // After a long press, hold the tint through the open delay: the Reorder view then covers it.
      const hold = activated.value ? OPEN_DELAY + 200 : 0;
      activated.value = false;
      if (pressed) pressed.value = withDelay(hold, withTiming(0, EASE));
    },
  });
  const header = <View {...props} collapsable={false} />;
  return enabled ? <GestureDetector gesture={gesture}>{header}</GestureDetector> : header;
}
