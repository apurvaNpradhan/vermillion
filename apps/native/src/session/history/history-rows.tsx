import type { FinishedSession } from "@workspace/sync";
import { CaretRight } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { SessionPhotos } from "@/session/screen/session-photos";
import { formatElapsed } from "@/session/timer/clock";

import { emptyTotals, type Totals } from "./history-calendar";
import type { HistoryFormat } from "./history-format";

export function WeekHeading({
  day,
  sessions,
  totalsFor,
  format,
}: {
  day: number;
  sessions: readonly FinishedSession[];
  totalsFor: (id: string) => Totals;
  format: HistoryFormat;
}) {
  const { t } = useTranslation();
  let sets = 0;
  let volume = 0;
  for (const session of sessions) {
    const totals = totalsFor(session.id);
    sets += totals.sets;
    volume += totals.volume;
  }
  return (
    <View className="gap-1 pb-2 pt-5">
      <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
        {t("session__week", { date: format.medium(day) })}
      </Text>
      <Text className="font-normal text-caption tabular-nums text-muted">
        {t("session__week_totals", {
          sessions: t("session__workout_count", {
            count: sessions.length,
            value: format.integer(sessions.length),
          }),
          sets: t("stats__sets", { count: sets }),
          volume: format.decimal(format.volumeValue(volume)),
          unit: t(format.volumeUnit),
        })}
      </Text>
    </View>
  );
}

export function HistoryRow({
  session,
  stats,
  compact,
  format,
  timezone,
  onPress,
  onLongPress,
}: {
  session: FinishedSession;
  stats: { day: number; totals: Totals } | undefined;
  compact: boolean;
  format: HistoryFormat;
  timezone: string;
  onPress: () => void;
  /** Opens the row's action menu. */
  onLongPress?: () => void;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const totals = stats?.totals ?? emptyTotals;
  const date = new Intl.DateTimeFormat(format.locale, {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityHint={onLongPress ? t("session__history_row_hint") : undefined}
      className="my-1 min-h-11 flex-row items-center gap-3 rounded-xl bg-surface p-3 active:bg-default"
    >
      {compact && stats && (
        <View className="min-w-11">
          <Text className="text-overline font-semibold uppercase text-muted">
            {format.weekday(stats.day)}
          </Text>
          <Text className="text-numeric-lg font-semibold tabular-nums text-foreground">
            {format.day(stats.day)}
          </Text>
        </View>
      )}
      <View className="min-w-0 flex-1 gap-1">
        <Text className="font-normal text-title-md text-foreground">{session.title}</Text>
        {!compact && <SessionPhotos sessionId={session.id} readOnly localOnly />}
        <Text className="font-normal text-caption tabular-nums text-muted">
          {compact
            ? t("session__compact_history_row", {
                sets: t("stats__sets", { count: totals.sets }),
                volume: t("home__volume_value", {
                  value: format.decimal(format.volumeValue(totals.volume)),
                  unit: t(format.volumeUnit),
                }),
                duration: t("session__duration_min", {
                  value: format.integer(Math.round(totals.seconds / 60)),
                }),
              })
            : t("session__history_row", {
                date: date.format(new Date(session.started_at)),
                duration: formatElapsed(totals.seconds),
              })}
        </Text>
        {!compact && session.exerciseTitles?.length ? (
          <Text className="font-normal text-caption text-muted">
            {session.exerciseTitles.join(" · ")}
          </Text>
        ) : null}
      </View>
      <CaretRight size={20} weight="regular" color={subtle} />
    </Pressable>
  );
}
