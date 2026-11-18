import { Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from "react-native-reanimated";

import { tokenizeNumber } from "./number-flow-format";

const DIGITS = Array.from({ length: 10 }, (_, index) => index);
const NUMBER_STYLE = "text-numeric-xl font-semibold tabular-nums text-foreground";
const LINE_HEIGHT = 52;

export function NumberFlow({ value, locale }: { value: number; locale: string }) {
  const reduced = useReducedMotion();
  const { fontScale } = useWindowDimensions();
  const height = Math.ceil(LINE_HEIGHT * Math.min(fontScale, 1.3));
  const format = new Intl.NumberFormat(locale);
  if (reduced) {
    return (
      <Text className={NUMBER_STYLE} maxFontSizeMultiplier={1.3}>
        {format.format(value)}
      </Text>
    );
  }
  const groupSeparator = format.formatToParts(1000).find((part) => part.type === "group")?.value;
  return (
    <View accessible accessibilityLabel={format.format(value)} className="flex-row">
      {tokenizeNumber(value, { groupSeparator }).map((token) =>
        token.kind === "digit" ? (
          <Digit key={token.key} digit={token.digit} height={height} />
        ) : (
          <Text key={token.key} className={NUMBER_STYLE} maxFontSizeMultiplier={1.3}>
            {token.char}
          </Text>
        ),
      )}
    </View>
  );
}

function Digit({ digit, height }: { digit: number; height: number }) {
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
          <Text key={value} className={NUMBER_STYLE} maxFontSizeMultiplier={1.3} style={{ height }}>
            {value}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}
