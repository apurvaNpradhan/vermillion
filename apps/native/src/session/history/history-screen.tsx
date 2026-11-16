import { SessionPhotos } from "@/session/screen/session-photos";
import { AnimatedLegendList } from "@legendapp/list/reanimated";
import { sessionTotals } from "@workspace/shared";
import type { FinishedSession } from "@workspace/sync";
import { useRouter } from "expo-router";
import { ClockCounterClockwise } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { EmptyState } from "@/platform/ui/empty-state";
import { Page } from "@/platform/ui/page";
import { usePreferences } from "@/preferences";
import { groupSessionWeeks } from "./history";
import { formatElapsed } from "@/session/timer/clock";
import { formatVolume } from "@/session/finish/summary";
import { useSessionHistory, useSessionMonth } from "./use-session-history";
import { localDate, monthOf, type Month } from "./history-calendar";
import { HistoryCalendar } from "./history-calendar-view";

type HistoryItem =
  | { kind: "week"; id: string; sessions: FinishedSession[] }
  | { kind: "session"; id: string; session: FinishedSession };
export function HistoryScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const history = useSessionHistory();
  const { preferences } = usePreferences();
  const timezone = preferences.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const latest = useMemo(() => monthOf(new Date().toISOString(), timezone), [timezone]);
  const [shown, setShown] = useState<Month | null>(null);
  const month = shown ?? latest;
  const [selected, setSelected] = useState<string | null>(null);
  const monthSessions = useSessionMonth(month, timezone);
  const counts = new Map<string, number>();
  for (const session of monthSessions.sessions) {
    const date = localDate(session.started_at, timezone);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  // A selected day lists that day's Sessions from the month's own read, so an older month needs
  // no paging; with none selected the list pages through everything, grouped by week.
  const daySessions =
    selected === null
      ? null
      : monthSessions.sessions.filter(
          (session) => localDate(session.started_at, timezone) === selected,
        );
  const items: HistoryItem[] = daySessions
    ? daySessions.map((session): HistoryItem => ({ kind: "session", id: session.id, session }))
    : groupSessionWeeks(history.sessions, timezone, preferences.ui.weekStart).flatMap(
        (group): HistoryItem[] => [
          { kind: "week", id: group.week, sessions: group.sessions },
          ...group.sessions.map((session): HistoryItem => ({
            kind: "session",
            id: session.id,
            session,
          })),
        ],
      );
  return (
    <Page
      title={t("session__history")}
      actions={
        <Button variant="ghost" onPress={() => router.push("/history/log-past")}>
          <Button.Label>{t("session__log_past")}</Button.Label>
        </Button>
      }
    >
      {({ header, contentContainerStyle, ...scroll }) => (
        <AnimatedLegendList
          recycleItems={false}
          {...scroll}
          data={history.loading || history.failed ? [] : items}
          keyExtractor={(item) => item.id}
          onEndReached={selected === null ? history.loadMore : undefined}
          onEndReachedThreshold={0.5}
          estimatedItemSize={100}
          contentContainerStyle={{ ...contentContainerStyle, paddingHorizontal: 16 }}
          ListHeaderComponent={
            <View className="gap-2">
              {header}
              <HistoryCalendar
                month={month}
                latest={latest}
                counts={counts}
                total={monthSessions.sessions.length}
                selected={selected}
                weekStart={preferences.ui.weekStart}
                onMonthChange={(next) => {
                  setShown(next);
                  setSelected(null);
                }}
                onSelect={setSelected}
              />
            </View>
          }
          ListEmptyComponent={
            history.failed ? (
              <Button onPress={history.retry}>
                <Button.Label>{t("training__retry")}</Button.Label>
              </Button>
            ) : history.loading ? (
              <Text className="text-body text-muted">{t("common__loading")}</Text>
            ) : (
              <EmptyState
                icon={ClockCounterClockwise}
                title={t("session__history_empty")}
                action={{
                  label: t("session__log_past"),
                  onPress: () => router.push("/history/log-past"),
                }}
              />
            )
          }
          renderItem={({ item }) => {
            if (item.kind === "week") {
              const totals = sessionTotals(
                item.sessions.flatMap((session) => session.sets),
                preferences.ui.bodyweightKg,
              );
              return (
                <View className="gap-1 pb-2 pt-6">
                  <Text
                    accessibilityRole="header"
                    className="font-semibold text-title-md text-foreground"
                  >
                    {t("session__week", {
                      date: new Intl.DateTimeFormat(i18n.language, {
                        timeZone: "UTC",
                        dateStyle: "medium",
                      }).format(new Date(`${item.id}T12:00:00Z`)),
                    })}
                  </Text>
                  <Text className="text-caption text-muted">
                    {t("session__week_totals", {
                      sessions: t("stats__sessions", { count: item.sessions.length }),
                      sets: t("stats__sets", { count: totals.sets }),
                      volume: formatVolume(totals.volume, preferences.ui.weightUnit, i18n.language),
                      unit: t(
                        preferences.ui.weightUnit === "kg"
                          ? "training__unit_kg"
                          : "training__unit_lb",
                      ),
                    })}
                  </Text>
                </View>
              );
            }
            const session = item.session;
            return (
              <View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({ pathname: "/history/[id]", params: { id: session.id } })
                  }
                  className="gap-1 py-4 active:bg-default"
                >
                  <Text className="text-title-md text-foreground">{session.title}</Text>
                  <SessionPhotos sessionId={session.id} readOnly />
                  <Text className="text-body text-muted">
                    {t("session__history_row", {
                      date: new Intl.DateTimeFormat(i18n.language, {
                        timeZone: timezone,
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(session.started_at)),
                      duration: formatElapsed(
                        session.durationS ??
                          Math.max(
                            0,
                            (Date.parse(session.finished_at ?? session.started_at) -
                              Date.parse(session.started_at)) /
                              1000,
                          ),
                      ),
                    })}
                  </Text>
                  <Text className="text-caption text-muted">
                    {session.exerciseTitles?.join(" · ")}
                  </Text>
                </Pressable>
              </View>
            );
          }}
        />
      )}
    </Page>
  );
}
