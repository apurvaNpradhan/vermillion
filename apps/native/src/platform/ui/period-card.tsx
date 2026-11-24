import { CaretLeft, CaretRight } from "phosphor-react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";

import { useSubtleColor } from "@/platform/theme";

import { Button } from "./button";
import { useSlideSwipe } from "./use-slide-swipe";

/**
 * A card for one period of time, in the shape of History's: an overline title, a headline, previous
 * and next buttons, and its content, which slide in the direction of travel when `period` changes
 * (a fade under Reduce Motion). A horizontal swipe on the card steps too. Strings come from the
 * caller; the headline is any node, usually a number with its unit.
 */
export function PeriodCard({
  title,
  headline,
  period,
  direction,
  canPrevious,
  canNext,
  previousLabel,
  nextLabel,
  onMove,
  children,
}: {
  title: string;
  headline: ReactNode;
  /** Any value that changes with the period shown; a change plays the slide. */
  period: string | number;
  direction: -1 | 0 | 1;
  canPrevious: boolean;
  canNext: boolean;
  previousLabel: string;
  nextLabel: string;
  onMove: (step: -1 | 1) => void;
  children: ReactNode;
}) {
  const subtle = useSubtleColor();
  const { pan, slide } = useSlideSwipe({ period, direction, canPrevious, canNext, onMove });
  return (
    <GestureDetector gesture={pan}>
      <View className="gap-2 overflow-hidden rounded-xl bg-surface p-3">
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
            {headline}
          </View>
          <View className="flex-row">
            <Button
              isIconOnly
              variant="ghost"
              accessibilityLabel={previousLabel}
              isDisabled={!canPrevious}
              onPress={() => onMove(-1)}
            >
              <CaretLeft size={20} weight="regular" color={subtle} />
            </Button>
            <Button
              isIconOnly
              variant="ghost"
              accessibilityLabel={nextLabel}
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
