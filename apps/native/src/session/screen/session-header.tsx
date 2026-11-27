import { CaretDown, DotsThreeVertical } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColor } from "heroui-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { OfflinePill } from "@/sync";

import { MARKER_ENTERING, MARKER_EXITING } from "@/session/shared/motion";
import { formatElapsed } from "@/session/timer/clock";
import { useSessionStore } from "@/session/store/session-store-context";
import { useActiveSeconds } from "@/session/shared/use-active-seconds";

/**
 * The time trained: only this small piece re-renders every second, and it stops while the workout
 * is paused, with a "Paused" marker. It opens the workout clock when pressable.
 */
function Clock({
  startedAt,
  pausedAt,
  animate,
  pausedMs,
  frozen,
  onPress,
}: {
  startedAt: string;
  pausedAt: string | null;
  animate: boolean;
  pausedMs: number;
  frozen: boolean;
  /** Opens the workout clock sheet; the clock is plain text without it. */
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const preview = useSessionStore((state) => state.pending.find((write) => write.clock)?.clock);
  const clock = preview ?? { startedAt, pausedAt, pausedMs };
  const seconds = useActiveSeconds(clock, !frozen);
  const time = formatElapsed(seconds);
  const paused = clock.pausedAt !== null;
  const label = t(paused ? "session__clock_elapsed_paused" : "session__clock_elapsed", { time });
  const text = (
    <>
      <Text className="font-medium text-label text-muted tabular-nums">{time}</Text>
      {paused ? (
        <Animated.Text
          entering={animate ? MARKER_ENTERING : undefined}
          exiting={animate ? MARKER_EXITING : undefined}
          className="font-medium text-caption text-subtle"
        >
          {t("session__paused_label")}
        </Animated.Text>
      ) : null}
    </>
  );
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} className="flex-row items-center gap-1.5">
        {text}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t("session__clock_open")}
      onPress={onPress}
      className="min-h-11 min-w-11 flex-row items-center gap-1.5 rounded-lg active:bg-default"
    >
      {text}
    </Pressable>
  );
}

/**
 * The top of the logging screen, two lines. Line 1: a chevron that minimises the Session, its
 * title, the menu and Finish. Line 2, plain muted text: the clock (derived from `started_at`, so it
 * is right after the app was killed), the sets done and, last, the gym; the gym truncates first and
 * is absent with one gym.
 */
export function SessionHeader({
  finished,
  onMenu,
  gymName,
  title,
  startedAt,
  pausedAt,
  animate,
  pausedMs,
  sets,
  readOnly,
  onMinimise,
  onFinish,
  onOpenClock,
  banner,
}: {
  finished: boolean;
  onMenu: () => void;
  /** The Session's gym; null while there is no choice of gym. */
  gymName: string | null;
  title: string;
  startedAt: string;
  pausedAt: string | null;
  animate: boolean;
  pausedMs: number;
  /** Counted sets done. */
  sets: number;
  /** Another device owns the Session: no Finish. */
  readOnly: boolean;
  onMinimise: () => void;
  onFinish: () => void;
  /** Tapping the clock opens the workout clock sheet. */
  onOpenClock?: () => void;
  /** What this week's phase did to the Workout, "Deload: sets halved, −10% load"; none if as planned. */
  banner?: string | null;
}) {
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");
  const setsText = t("session__header_sets", { count: sets });
  return (
    <View className="bg-background px-3 pb-2" style={{ paddingTop: top + 8 }}>
      <View className="flex-row items-center gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("session__minimise")}
          onPress={onMinimise}
          className="h-11 w-11 items-center justify-center rounded-full active:bg-default"
        >
          <CaretDown size={24} color={foreground} />
        </Pressable>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="font-semibold min-w-0 flex-1 text-title-md text-foreground"
        >
          {title}
        </Text>
        <Button variant="ghost" onPress={onMenu} accessibilityLabel={t("session__menu")}>
          <DotsThreeVertical size={24} color={foreground} />
        </Button>
        {readOnly ? null : (
          <Button variant="primary" className="rounded-full" onPress={onFinish}>
            <Button.Label>{t(finished ? "session__done" : "session__finish")}</Button.Label>
          </Button>
        )}
      </View>
      <View className="min-h-7 flex-row items-center gap-2 pl-[52px]">
        {finished ? null : (
          <>
            <Clock
              startedAt={startedAt}
              pausedAt={pausedAt}
              animate={animate}
              pausedMs={pausedMs}
              frozen={readOnly}
              {...(readOnly || !onOpenClock ? {} : { onPress: onOpenClock })}
            />
            <Text
              accessible={false}
              importantForAccessibility="no"
              className="text-label text-muted"
            >
              ·
            </Text>
          </>
        )}
        <View
          accessible
          accessibilityLabel={
            gymName === null
              ? setsText
              : t("session__header_sets_gym", { sets: setsText, gym: gymName })
          }
          className="min-w-0 flex-1 flex-row items-center"
        >
          <Text
            numberOfLines={1}
            className="font-medium max-w-full shrink-0 text-label text-muted tabular-nums"
          >
            {setsText}
          </Text>
          {gymName === null ? null : (
            <Text numberOfLines={1} className="font-medium min-w-0 shrink text-label text-muted">
              {t("session__header_gym_suffix", { gym: gymName })}
            </Text>
          )}
        </View>
        <OfflinePill />
      </View>
      {banner ? (
        <Text numberOfLines={1} className="font-normal pl-[52px] text-caption text-muted">
          {banner}
        </Text>
      ) : null}
    </View>
  );
}
