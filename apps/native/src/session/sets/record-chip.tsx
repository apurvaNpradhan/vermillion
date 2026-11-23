import { memo, useEffect } from "react";
import { Text } from "react-native";
import Animated, {
  FadeOut,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { useTranslation } from "@/platform/i18n";
import { POP_SPRING } from "@/session/shared/motion";

const EXITING = FadeOut.duration(120).reduceMotion(ReduceMotion.System);

/**
 * "PR": the mark a ticked set gets when it beat a record. It pops in once (scale 0.6 to 1 on a
 * spring, with a fade) and is static afterwards, in ember: a personal record is "earned". It
 * mounts only for a set that was just recorded, so nothing here runs for ordinary rows.
 */
export const RecordChip = memo(function RecordChip() {
  const { t } = useTranslation();
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.set(withSpring(1, POP_SPRING));
  }, [pop]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.get() * 1.6),
    transform: [{ scale: 0.6 + 0.4 * pop.get() }],
  }));
  return (
    <Animated.View
      exiting={EXITING}
      pointerEvents="none"
      accessible
      accessibilityLabel={t("session__record_chip_label")}
      accessibilityLiveRegion="polite"
      className="absolute left-1 top-0 h-3.5 justify-center rounded-full bg-default px-1"
      style={style}
    >
      <Text className="font-semibold text-overline text-identity">{t("session__record_chip")}</Text>
    </Animated.View>
  );
});
