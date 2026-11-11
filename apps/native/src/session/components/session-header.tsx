import { CaretDown, DotsThreeVertical } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useThemeColor } from "heroui-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { OfflinePill } from "@/sync";

import { elapsedSeconds, formatElapsed } from "../clock";
import { useNow } from "../use-now";

/** The running clock: only this small piece re-renders every second. */
function Clock({ startedAt, frozen }: { startedAt: string; frozen: boolean }) {
  const now = useNow(!frozen);
  return (
    <Text className="text-label text-muted" style={{ fontVariant: ["tabular-nums"] }}>
      {formatElapsed(elapsedSeconds(startedAt, now))}
    </Text>
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
  volume,
  sets,
  readOnly,
  onMinimise,
  onFinish,
}: {
  finished: boolean;
  onMenu: () => void;
  title: string;
  startedAt: string;
  /** Volume with its unit, "4,250 kg". */
  volume: string;
  sets: number;
  /** Another device owns the Session: no Finish. */
  readOnly: boolean;
  onMinimise: () => void;
  onFinish: () => void;
}) {
  const { t } = useTranslation();
  const { top } = useSafeAreaInsets();
  const foreground = useThemeColor("foreground");
  return (
    <View
      className="flex-row items-center gap-2 border-b border-border bg-background px-3 pb-2"
      style={{ paddingTop: top + 8 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("session__minimise")}
        onPress={onMinimise}
        className="h-11 w-11 items-center justify-center rounded-full active:bg-default"
      >
        <CaretDown size={22} weight="bold" color={foreground} />
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
          {finished ? null : <Clock startedAt={startedAt} frozen={readOnly} />}
          <Text className="text-label text-muted">·</Text>
          <Text
            numberOfLines={1}
            className="min-w-0 flex-shrink text-label text-muted"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {t("session__header_stats", { volume, count: sets })}
          </Text>
          <OfflinePill />
        </View>
      </View>
      <Button variant="ghost" onPress={onMenu} accessibilityLabel={t("session__menu")}>
        <DotsThreeVertical size={22} color={foreground} />
      </Button>
      {readOnly ? null : (
        <Button variant="primary" className="rounded-full" onPress={onFinish}>
          <Button.Label>{t(finished ? "session__done" : "session__finish")}</Button.Label>
        </Button>
      )}
    </View>
  );
}
