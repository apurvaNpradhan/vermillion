import { CaretLeft, CaretRight } from "phosphor-react-native";
import { useLayoutEffect, type ReactNode } from "react";
import { Text, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { Button } from "@/platform/ui/button";
import { NumberFlow } from "@/platform/ui/number-flow";

import type { HistoryFormat } from "./history-format";

export function PeriodCard({
  title,
  count,
  format,
  start,
  direction,
  canPrevious,
  canNext,
  onMove,
  children,
}: {
  title: string;
  count: number;
  format: HistoryFormat;
  start: number;
  direction: -1 | 0 | 1;
  canPrevious: boolean;
  canNext: boolean;
  onMove: (step: -1 | 1) => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const reduced = useReducedMotion();
  const offset = useSharedValue(0);
  const opacity = useSharedValue(1);
  useLayoutEffect(() => {
    if (direction === 0) return;
    if (reduced) {
      opacity.set(0);
      opacity.set(withTiming(1, { duration: 120, reduceMotion: ReduceMotion.Never }));
    } else {
      offset.set(direction * 48);
      offset.set(withTiming(0, { duration: 170, easing: Easing.out(Easing.cubic) }));
    }
  }, [start, direction, reduced, offset, opacity]);
  const slide = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateX: offset.get() }],
  }));
  const pan = usePanGesture({
    enabled: canPrevious || canNext,
    activeOffsetX: [-20, 20],
    failOffsetY: [-12, 12],
    onDeactivate: (event) => {
      if (event.canceled) return;
      if (event.translationX <= -40 && canNext) scheduleOnRN(onMove, 1);
      if (event.translationX >= 40 && canPrevious) scheduleOnRN(onMove, -1);
    },
  });
  return (
    <GestureDetector gesture={pan}>
      <View className="gap-4 overflow-hidden rounded-2xl bg-surface p-3">
        <View className="flex-row items-center justify-between gap-1">
          <View className="min-w-0 flex-1">
            <Animated.View style={slide}>
              <Text
                accessibilityRole="header"
                className="text-overline font-semibold uppercase text-muted"
              >
                {title}
              </Text>
            </Animated.View>
            <View
              accessible
              accessibilityLabel={t("session__workout_count", {
                count,
                value: format.integer(count),
              })}
              className="flex-row flex-wrap items-baseline gap-1"
            >
              <NumberFlow value={count} locale={format.locale} />
              <Text className="text-body text-muted">{t("session__workout_unit", { count })}</Text>
            </View>
          </View>
          <View className="flex-row">
            <Button
              isIconOnly
              variant="ghost"
              accessibilityLabel={t("session__period_previous")}
              isDisabled={!canPrevious}
              onPress={() => onMove(-1)}
            >
              <CaretLeft size={20} weight="regular" color={subtle} />
            </Button>
            <Button
              isIconOnly
              variant="ghost"
              accessibilityLabel={t("session__period_next")}
              isDisabled={!canNext}
              onPress={() => onMove(1)}
            >
              <CaretRight size={20} weight="regular" color={subtle} />
            </Button>
          </View>
        </View>
        <Animated.View style={slide}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}
