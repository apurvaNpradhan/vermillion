import { Text, View, useWindowDimensions } from "react-native";
import Animated, { Easing, useAnimatedStyle, withTiming } from "react-native-reanimated";

import { tokenizeNumber } from "./number-flow-format";
import { useReduceMotion } from "./use-reduce-motion";

const DIGITS = Array.from({ length: 10 }, (_, index) => index);
/** The text styles a rolling number can take, with the line height each one needs. */
const SIZES = {
  xl: { style: "text-numeric-xl font-semibold tabular-nums text-foreground", lineHeight: 52 },
  md: { style: "text-numeric-md tabular-nums text-foreground", lineHeight: 24 },
  title: { style: "text-title-md font-semibold tabular-nums text-foreground", lineHeight: 24 },
} as const;

/**
 * A number whose digits roll to the new value. Only for summary numbers, never while logging.
 * `decimals` fixes the digits after the point; `suffix` (a unit) follows, set apart by a space.
 * `reserve` is the most digits the value can have: the row keeps the width of that many digits
 * (tabular figures are equal width), so what sits beside it does not shift when the count
 * changes. Under Reduce Motion, or when the system font scale is past 1.3 and the reels would
 * clip, it is plain scaling text.
 */
export function NumberFlow({
  value,
  locale,
  size = "xl",
  decimals,
  suffix,
  reserve,
}: {
  value: number;
  locale: string;
  size?: keyof typeof SIZES;
  decimals?: number;
  suffix?: string;
  reserve?: number;
}) {
  const reduced = useReduceMotion();
  const { fontScale } = useWindowDimensions();
  const { style, lineHeight } = SIZES[size];
  const height = Math.ceil(lineHeight * Math.min(fontScale, 1.3));
  const format = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const text = suffix ? `${format.format(value)} ${suffix}` : format.format(value);
  const missing = reserve === undefined ? 0 : Math.max(reserve - digitCount(value, decimals), 0);
  if (reduced || fontScale > 1.3) {
    return (
      <Text className={style} maxFontSizeMultiplier={1.3}>
        {text}
      </Text>
    );
  }
  const parts = new Intl.NumberFormat(locale).formatToParts(1000.5);
  const groupSeparator = parts.find((part) => part.type === "group")?.value;
  const decimalSeparator = parts.find((part) => part.type === "decimal")?.value;
  return (
    <View accessible accessibilityLabel={text} className="flex-row">
      {tokenizeNumber(value, { groupSeparator, decimalSeparator, decimals }).map((token) =>
        token.kind === "digit" ? (
          <Digit key={token.key} digit={token.digit} height={height} style={style} />
        ) : (
          <Text key={token.key} className={style} maxFontSizeMultiplier={1.3}>
            {token.char}
          </Text>
        ),
      )}
      {suffix ? (
        <Text className={style} maxFontSizeMultiplier={1.3}>
          {` ${suffix}`}
        </Text>
      ) : null}
      {missing > 0 ? (
        <Text
          className={`${style} opacity-0`}
          maxFontSizeMultiplier={1.3}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {"0".repeat(missing)}
        </Text>
      ) : null}
    </View>
  );
}

/** How many digits the value shows, counting the fixed decimals. */
function digitCount(value: number, decimals?: number): number {
  const whole = String(Math.trunc(Math.abs(value))).length;
  return whole + (decimals ?? 0);
}

function Digit({ digit, height, style }: { digit: number; height: number; style: string }) {
  const reel = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: withTiming(-digit * height, {
          duration: 320,
          easing: Easing.inOut(Easing.ease),
        }),
      },
    ],
  }));
  return (
    <View
      className="overflow-hidden"
      style={{ height }}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <Animated.View style={reel}>
        {DIGITS.map((value) => (
          <Text key={value} className={style} maxFontSizeMultiplier={1.3} style={{ height }}>
            {value}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}
