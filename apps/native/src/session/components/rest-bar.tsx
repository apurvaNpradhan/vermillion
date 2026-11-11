import { Minus, Plus } from "phosphor-react-native";
import { useEffect, useRef } from "react";
import { AppState, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColor } from "heroui-native";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";

import { formatElapsed } from "../clock";
import { REST_ADJUST_SECONDS, clampedAdjustment, restView } from "../rest-rules";
import { isRestSurfaceVisible } from "../rest-notification";
import { useNow } from "../use-now";
import { countdownBeepSecond } from "../sound-rules";
import { useSoundCues } from "../use-sound-cues";

/**
 * The bar at the bottom of the logging screen while a Rest runs: the countdown, −15, +15, Skip
 * and a thin progress line. Times come from the stored start and end, so it is right after the
 * app was backgrounded or killed. When it reaches zero it plays the end haptic and chime and goes away.
 * It is mounted while the Session holds a Rest and draws nothing once that Rest is over.
 */
export function RestBar({
  rest,
  onAdjust,
  onSkip,
  withInset,
}: {
  rest: { setId: string; startedAt: string; endsAt: string };
  onAdjust: (deltaSeconds: number) => void;
  onSkip: () => void;
  /** Leave room for the bottom safe area (no keypad below). */
  withInset: boolean;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");
  const now = useNow(true, 250);
  const view = restView(rest, now);
  const { play } = useSoundCues();

  // The end haptic plays once, for a Rest this screen saw running; opening to a finished one is silent.
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (view.running) seen.current = rest.endsAt;
    else if (seen.current === rest.endsAt) {
      seen.current = null;
      haptic.success();
      play("restOver");
    }
  }, [view.running, rest.endsAt, play]);

  // The 3-2-1 beeps, once per second left, while this screen is in front.
  const beeped = useRef<string | null>(null);
  const beepSecond = view.running ? countdownBeepSecond(view.remaining) : null;
  useEffect(() => {
    if (beepSecond === null) return;
    const key = `${rest.endsAt}:${beepSecond}`;
    if (beeped.current === key || AppState.currentState !== "active" || !isRestSurfaceVisible())
      return;
    beeped.current = key;
    play("restCountdown");
  }, [beepSecond, rest.endsAt, play]);

  if (!view.running) return null;
  const progress = view.total === 0 ? 1 : 1 - view.remaining / view.total;
  const adjust = (delta: number) => {
    const change = clampedAdjustment(view.remaining, delta);
    if (change.ends) return onSkip();
    if (change.delta === 0) return;
    haptic.tick();
    onAdjust(change.delta);
  };
  return (
    <View
      className="border-t border-border bg-surface"
      style={{ paddingBottom: withInset ? bottom : 0 }}
    >
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={t("session__rest_label")}
        accessibilityValue={{ min: 0, max: view.total, now: view.total - view.remaining }}
        className="h-0.5 bg-default"
      >
        <View className="h-full bg-identity" style={{ width: `${Math.round(progress * 100)}%` }} />
      </View>
      <View className="flex-row items-center gap-2 px-3 py-2">
        <View className="flex-1">
          <Text className="text-caption text-muted">{t("session__rest_label")}</Text>
          <Text
            accessibilityLiveRegion="none"
            className="font-semibold text-numeric-md text-foreground"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {formatElapsed(view.remaining)}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("session__rest_minus", { seconds: REST_ADJUST_SECONDS })}
          onPress={() => adjust(-REST_ADJUST_SECONDS)}
          className="h-11 min-w-14 flex-row items-center justify-center gap-0.5 rounded-xl bg-default px-2 active:bg-field"
        >
          <Minus size={14} weight="bold" color={foreground} />
          <Text className="text-label text-foreground">{REST_ADJUST_SECONDS}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("session__rest_plus", { seconds: REST_ADJUST_SECONDS })}
          onPress={() => adjust(REST_ADJUST_SECONDS)}
          className="h-11 min-w-14 flex-row items-center justify-center gap-0.5 rounded-xl bg-default px-2 active:bg-field"
        >
          <Plus size={14} weight="bold" color={foreground} />
          <Text className="text-label text-foreground">{REST_ADJUST_SECONDS}</Text>
        </Pressable>
        <Button variant="secondary" onPress={onSkip}>
          <Button.Label>{t("session__rest_skip")}</Button.Label>
        </Button>
      </View>
    </View>
  );
}
