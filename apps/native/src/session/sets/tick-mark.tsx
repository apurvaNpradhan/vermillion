import { Check } from "phosphor-react-native";
import { memo } from "react";
import { View } from "react-native";
import Animated, { type CSSTransitionProperties } from "react-native-reanimated";

import { TICK_EASING, TICK_MS } from "@/session/shared/motion";

const FILL_TRANSITION: CSSTransitionProperties = {
  transitionProperty: ["opacity", "transform"],
  transitionDuration: TICK_MS,
  transitionTimingFunction: TICK_EASING,
};

const FADE_TRANSITION: CSSTransitionProperties = {
  transitionProperty: ["opacity"],
  transitionDuration: TICK_MS,
};

/**
 * The tick of a set: an empty check until the set is done, then a solid accent square with the
 * check knocked out in the on-accent colour. Ticking scales the square from 0.85 to 1 while it fades in, and unticking reverses
 * it. Both layers are always drawn and change through Reanimated CSS transitions, so the change
 * runs on the UI thread with no shared value or state of its own; a row that mounts ticked does
 * not animate. Under Reduce Motion it switches at once.
 */
export const TickMark = memo(function TickMark({
  ticked,
  animate,
  subtle,
  onAccent,
}: {
  ticked: boolean;
  animate: boolean;
  subtle: string | undefined;
  onAccent: string | undefined;
}) {
  return (
    <View className="h-7 w-7 items-center justify-center">
      <Animated.View
        className="absolute inset-0 items-center justify-center"
        style={{
          opacity: ticked ? 0 : 1,
          ...FADE_TRANSITION,
          transitionDuration: animate ? TICK_MS : 0,
        }}
      >
        <Check size={22} weight="regular" color={subtle} />
      </Animated.View>
      <Animated.View
        className="absolute inset-0 items-center justify-center rounded-lg bg-accent"
        style={{
          opacity: ticked ? 1 : 0,
          transform: [{ scale: ticked ? 1 : 0.85 }],
          ...FILL_TRANSITION,
          transitionDuration: animate ? TICK_MS : 0,
        }}
      >
        <Check size={18} weight="bold" color={onAccent} />
      </Animated.View>
    </View>
  );
});
