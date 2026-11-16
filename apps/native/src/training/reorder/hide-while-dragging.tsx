import type { ReactNode } from "react";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

const FADE = { duration: 150, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System };

/**
 * Fades its children out and makes them untouchable while a reorder drag runs. It keeps its space,
 * so the list's drop positions do not move under the finger.
 */
export function HideWhileDragging({
  dragging,
  children,
}: {
  dragging: SharedValue<boolean>;
  children: ReactNode;
}) {
  const style = useAnimatedStyle(() => ({ opacity: withTiming(dragging.value ? 0 : 1, FADE) }));
  const animatedProps = useAnimatedProps(() => ({
    pointerEvents: dragging.value ? ("none" as const) : ("auto" as const),
  }));
  return (
    <Animated.View style={style} animatedProps={animatedProps}>
      {children}
    </Animated.View>
  );
}
