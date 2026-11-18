import type { ReactNode } from "react";
import { View } from "react-native";
import Animated, { useAnimatedProps, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { isColorString, useIdentityColor } from "@/platform/theme";
import { useReduceMotion } from "./use-reduce-motion";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const FILL_MS = 320;

/**
 * A goal ring: a `surface-control` track and an accent arc from twelve o'clock that fills to
 * `fraction` (0 to 1) over `motion-slow`, instantly under Reduce Motion. The centre takes any
 * content, usually the number. `label` is what a screen reader hears for the whole ring.
 */
export function ProgressRing({
  fraction,
  size = 64,
  stroke = 5,
  label,
  children,
}: {
  fraction: number;
  size?: number;
  stroke?: number;
  label: string;
  children?: ReactNode;
}) {
  const track = useCSSVariable("--color-default");
  const fill = useIdentityColor();
  const reduced = useReduceMotion();
  const radius = (size - stroke) / 2;
  const circumference = Math.PI * 2 * radius;
  const clamped = Math.min(1, Math.max(0, fraction));
  const animated = useAnimatedProps(() => {
    const offset = circumference * (1 - clamped);
    return { strokeDashoffset: reduced ? offset : withTiming(offset, { duration: FILL_MS }) };
  });
  const centre = size / 2;
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      className="items-center justify-center"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} className="absolute" accessible={false}>
        <Circle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          stroke={isColorString(track) ? track : undefined}
          strokeWidth={stroke}
        />
        <AnimatedCircle
          cx={centre}
          cy={centre}
          r={radius}
          fill="none"
          stroke={fill}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={[circumference, circumference]}
          animatedProps={animated}
          rotation={-90}
          originX={centre}
          originY={centre}
        />
      </Svg>
      {children}
    </View>
  );
}
