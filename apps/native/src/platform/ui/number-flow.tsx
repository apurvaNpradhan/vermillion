/**
 * Source: Reacticx `NumberFlow` (src/components/molecules/number-flow). MIT licence,
 * https://github.com/rit3zh/reacticx.
 * Changed: sizing comes from a `className` (e.g. `text-numeric-lg font-semibold`) instead of a
 * fontSize prop: a hidden "0" in that class measures the cell, so the roll works at any text
 * style. Springs and per-glyph scale replaced by one motion-slow (320ms ease-in-out) vertical
 * roll; Reduce Motion sets digits directly. Tabular figures, locale separators via props, no
 * hardcoded colours. Tokenising lives in `number-flow-format.ts`.
 */
import { cn } from "heroui-native";
import { memo, useEffect, useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  tokenizeNumber,
  tokensToText,
  type NumberFlowFormat,
  type NumberFlowToken,
} from "./number-flow-format";

const ROLL = { duration: 320, easing: Easing.inOut(Easing.ease) };
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type NumberFlowProps = NumberFlowFormat & {
  value: number;
  /** Text classes for size, weight and colour, e.g. "text-numeric-lg font-semibold text-foreground". */
  className?: string;
  /** Spoken instead of the formatted number, e.g. "82.4 kilograms". */
  accessibilityLabel?: string;
};

/** A number whose digits roll to their new values over motion-slow. Tabular figures throughout. */
export function NumberFlow({
  value,
  decimals,
  decimalSeparator,
  groupSeparator,
  className,
  accessibilityLabel,
}: NumberFlowProps) {
  const tokens = tokenizeNumber(value, { decimals, decimalSeparator, groupSeparator });
  const textClass = cn("tabular-nums", className) ?? "";
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel ?? tokensToText(tokens)}
      className="flex-row items-start"
    >
      {tokens.map((token) =>
        token.kind === "digit" ? (
          <DigitColumn key={token.key} digit={token.digit} className={textClass} />
        ) : (
          <Text
            key={token.key}
            accessibilityElementsHidden
            importantForAccessibility="no"
            className={textClass}
          >
            {token.char}
          </Text>
        ),
      )}
    </View>
  );
}

const DigitColumn = memo(function DigitColumn({
  digit,
  className,
}: {
  digit: Extract<NumberFlowToken, { kind: "digit" }>["digit"];
  className: string;
}) {
  const reduced = useReducedMotion();
  const [height, setHeight] = useState(0);
  const position = useSharedValue(digit);
  const cell = useSharedValue(0);

  useEffect(() => {
    cell.value = height;
  }, [height, cell]);

  useEffect(() => {
    position.value = reduced ? digit : withTiming(digit, ROLL);
  }, [digit, reduced, position]);

  const strip = useAnimatedStyle(() => ({
    transform: [{ translateY: -position.value * cell.value }],
  }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="overflow-hidden"
    >
      {/* Takes the width and one line of height from the same text style as the strip. */}
      <Text
        className={cn(className, "opacity-0")}
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
      >
        0
      </Text>
      <Animated.View className="absolute left-0 top-0" style={strip}>
        {DIGITS.map((n) => (
          <Text key={n} className={className}>
            {n}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
});
