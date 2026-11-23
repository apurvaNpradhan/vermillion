import { CaretDown, DotsThreeVertical } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColor } from "heroui-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { OfflinePill } from "@/sync";

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
  pausedMs,
  frozen,
  onPress,
}: {
  startedAt: string;
  pausedAt: string | null;
  pausedMs: number;
  frozen: boolean;
  /** Opens the workout clock sheet; the clock is plain text without it. */
  onPress?: () => void;
}) {
  const { t } = useTranslation();
  const preview = useSessionStore((state) => state.pending.find((write) => write.clock)?.clock);
  const clock = preview ?? { startedAt, pausedAt, pausedMs };
  const seconds = useActiveSeconds(clock, !frozen);
  const text = (
    <View className="flex-row items-center gap-1.5">
      <Text className="font-medium text-label text-muted" style={{ fontVariant: ["tabular-nums"] }}>
        {formatElapsed(seconds)}
      </Text>
      {clock.pausedAt === null ? null : (
        <Text className="font-medium text-caption text-subtle">{t("session__paused_label")}</Text>
      )}
    </View>
  );
  if (!onPress) return text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("session__clock_open")}
      onPress={onPress}
      hitSlop={8}
    >
      {text}
    </Pressable>
  );
}

/**
 * The top of the logging screen: a chevron that minimises the Session, its title, the clock
 * (derived from `started_at`, so it is right after the app was killed), the live volume and
 * counted sets, and Finish. The muscle-distribution icon joins in a later slice.
 */
export function SessionHeader({
  finished,
  onMenu,
  title,
  startedAt,
  pausedAt,
  pausedMs,
  volume,
  sets,
  readOnly,
  onMinimise,
  onFinish,
  onOpenClock,
}: {
  finished: boolean;
  onMenu: () => void;
  title: string;
  startedAt: string;
  pausedAt: string | null;
  pausedMs: number;
  /** Volume with its unit, "4,250 kg". */
  volume: string;
  sets: number;
  /** Another device owns the Session: no Finish. */
  readOnly: boolean;
  onMinimise: () => void;
  onFinish: () => void;
  /** Tapping the clock opens the workout clock sheet. */
  onOpenClock?: () => void;
}) {
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");
  return (
    <View
      className="flex-row items-center gap-2 bg-background px-3 pb-2"
      style={{ paddingTop: top + 8 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("session__minimise")}
        onPress={onMinimise}
        className="h-11 w-11 items-center justify-center rounded-full active:bg-default"
      >
        <CaretDown size={24} color={foreground} />
      </Pressable>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          className="font-semibold text-title-md text-foreground"
        >
          {title}
        </Text>
        <View className="flex-row items-center gap-2">
          {finished ? null : (
            <Clock
              startedAt={startedAt}
              pausedAt={pausedAt}
              pausedMs={pausedMs}
              frozen={readOnly}
              {...(readOnly || !onOpenClock ? {} : { onPress: onOpenClock })}
            />
          )}
          <Text className="font-medium text-label text-muted">·</Text>
          <Text
            numberOfLines={1}
            className="font-medium min-w-0 flex-shrink text-label text-muted"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {t("session__header_stats", { volume, count: sets })}
          </Text>
          <OfflinePill />
        </View>
      </View>
      <Button variant="ghost" onPress={onMenu} accessibilityLabel={t("session__menu")}>
        <DotsThreeVertical size={24} color={foreground} />
      </Button>
      {readOnly ? null : (
        <Button variant="primary" className="rounded-full" onPress={onFinish}>
          <Button.Label>{t(finished ? "session__done" : "session__finish")}</Button.Label>
        </Button>
      )}
    </View>
  );
}
