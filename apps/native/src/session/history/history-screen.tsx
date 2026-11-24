import { AnimatedLegendList } from "@legendapp/list/reanimated";
import { calendarDay } from "@workspace/shared";
import type { HistoryOverviewSession } from "@workspace/sync";
import { useFocusEffect, useIsFocused, useRouter } from "expo-router";
import {
  ArrowClockwise,
  Barbell,
  CalendarPlus,
  ChartBar,
  ClockCounterClockwise,
  Eye,
} from "phosphor-react-native";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import Animated, { ReduceMotion, useAnimatedStyle, withTiming } from "react-native-reanimated";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Button } from "@/platform/ui/button";
import { EmptyState } from "@/platform/ui/empty-state";
import { Page } from "@/platform/ui/page";
import { useStartSession } from "@/session/lifecycle/use-start-session";

import { emptyTotals, periodStart, shiftPeriod, WEEK_MS } from "./history-calendar";
import { historyListItems, itemIndexForDay } from "./history";
import { historyFormat } from "./history-format";
import { HistoryRow, WeekHeading } from "./history-rows";
import { HistoryWeekStrip } from "./history-week-strip";
import { useHistorySettings, useSessionHistory } from "./use-session-history";
import { useReduceMotion } from "@/platform/ui/use-reduce-motion";
import { ANCHORED } from "@/platform/navigation/anchored";

const HISTORY_LIST_PAGE = 120;

function useToday(timezone: string) {
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(
    useCallback(() => {
      const refresh = () =>
        setNow((previous) => {
          const current = new Date();
          return calendarDay(previous, timezone) === calendarDay(current, timezone)
            ? previous
            : current;
        });
      refresh();
      const timer = setInterval(refresh, 60_000);
      return () => clearInterval(timer);
    }, [timezone]),
  );
  return calendarDay(now, timezone);
}

/**
 * History: the Home week strip on top (a pull down opens the month calendar), then every
 * workout in one list grouped by week, each week headed by its totals. A tap on a day jumps the
 * list to it; a long press on a workout offers Perform again and Open details. Month and year
 * summaries live on Reports, opened from the header next to Muscles and Log past.
 */
export function HistoryScreen({ initialDay }: { initialDay: number | null }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const subtle = useSubtleColor();
  const reduced = useReduceMotion();
  const { startAgain, sheet: startSheet } = useStartSession();
  const [menuSession, setMenuSession] = useState<HistoryOverviewSession | null>(null);
  const { timezone, weekStart, weightUnit, goal } = useHistorySettings();
  const today = useToday(timezone);
  const day = initialDay !== null && initialDay <= today ? initialDay : null;
  const [anchor, setAnchor] = useState(day ?? today);
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState(day);
  const list = useRef<ComponentRef<typeof AnimatedLegendList>>(null);
  const focused = useIsFocused();
  const { history, loading, failed, retry } = useSessionHistory(timezone, weekStart, focused);
  const format = useMemo(
    () => historyFormat(i18n.language, weightUnit),
    [i18n.language, weightUnit],
  );
  const items = useMemo(
    () => historyListItems(history.sessions, history.bySession, weekStart),
    [history.sessions, history.bySession, weekStart],
  );
  const [pageSize, setPageSize] = useState(HISTORY_LIST_PAGE);
  const visibleItems = useMemo(() => items.slice(0, pageSize), [items, pageSize]);
  const ready = !loading && !failed;
  const openLog = () => router.push("/history/log-past");

  const jumpTo = useCallback(
    (target: number) => {
      const index = itemIndexForDay(items, history.bySession, target);
      if (index < 0) return;
      setPageSize((size) => Math.max(size, index + 40));
      // The list grows first when the day is past its first page, then scrolls.
      requestAnimationFrame(() => void list.current?.scrollToIndex({ index, animated: true }));
    },
    [items, history.bySession],
  );
  // A link to one day (`?day=`) opens with the list at it, once it has loaded.
  const opened = useRef(false);
  useEffect(() => {
    if (!ready || opened.current || day === null) return;
    opened.current = true;
    jumpTo(day);
  }, [ready, day, jumpTo]);

  const move = (step: -1 | 1) => {
    const next = expanded
      ? shiftPeriod("month", periodStart("month", anchor, weekStart), step)
      : periodStart("week", anchor, weekStart) + step * WEEK_MS;
    setDirection(step);
    setAnchor(Math.min(next, today));
    setSelected(null);
  };
  const jumpToToday = () => {
    setDirection(anchor === today ? 0 : 1);
    setAnchor(today);
    setSelected(null);
    void list.current?.scrollToOffset({ offset: 0, animated: true });
  };
  const select = (next: number | null) => {
    setDirection(0);
    setSelected(next);
    if (next !== null) jumpTo(next);
  };

  const entryOpacity = useAnimatedStyle(() => ({
    opacity: withTiming(ready ? 1 : 0, {
      duration: reduced ? 120 : 150,
      reduceMotion: ReduceMotion.Never,
    }),
  }));

  return (
    <>
      <Page
        title={t("session__history")}
        back={day !== null}
        actions={
          <>
            <Button
              isIconOnly
              variant="ghost"
              accessibilityLabel={t("muscles__open")}
              onPress={() => router.push("/muscles", ANCHORED)}
            >
              <Barbell size={24} weight="regular" color={subtle} />
            </Button>
            <Button
              isIconOnly
              variant="ghost"
              accessibilityLabel={t("report__reports_open")}
              onPress={() => router.push("/history/reports", ANCHORED)}
            >
              <ChartBar size={24} weight="regular" color={subtle} />
            </Button>
            <Button
              isIconOnly
              variant="ghost"
              accessibilityLabel={t("session__log_past")}
              onPress={openLog}
            >
              <CalendarPlus size={24} weight="regular" color={subtle} />
            </Button>
          </>
        }
      >
        {({ header, contentContainerStyle, ref: attachScrollTarget, ...scroll }) => (
          <AnimatedLegendList
            {...scroll}
            ref={(node) => {
              list.current = node;
              attachScrollTarget(node);
            }}
            recycleItems={false}
            maintainVisibleContentPosition={false}
            data={ready ? visibleItems : []}
            onEndReached={
              ready && pageSize < items.length
                ? () => setPageSize((size) => size + HISTORY_LIST_PAGE)
                : undefined
            }
            onEndReachedThreshold={1}
            keyExtractor={(item) => `${item.kind}-${item.id}`}
            estimatedItemSize={95}
            contentContainerStyle={{ ...contentContainerStyle, paddingHorizontal: 16 }}
            ListHeaderComponent={
              <View className="gap-3 pb-2">
                {header}
                <HistoryWeekStrip
                  anchor={anchor}
                  today={today}
                  selected={selected}
                  expanded={expanded}
                  direction={direction}
                  history={history}
                  goal={goal}
                  weekStart={weekStart}
                  format={format}
                  onSelect={select}
                  onMove={move}
                  onJump={jumpToToday}
                  onExpandedChange={setExpanded}
                />
              </View>
            }
            ListEmptyComponent={
              failed ? (
                <Button variant="secondary" onPress={retry}>
                  <Button.Label>{t("training__retry")}</Button.Label>
                </Button>
              ) : ready ? (
                <EmptyState
                  icon={ClockCounterClockwise}
                  label={t("empty__workouts", { count: 0 })}
                  title={t("session__history_empty")}
                  action={{ label: t("session__log_past"), onPress: openLog }}
                />
              ) : (
                <View className="items-center gap-2 py-6" accessibilityLiveRegion="polite">
                  <ActivityIndicator color={subtle} />
                  <Text className="text-caption text-muted">{t("session__history_loading")}</Text>
                </View>
              )
            }
            renderItem={({ item }) => (
              <Animated.View style={entryOpacity}>
                {item.kind === "week" ? (
                  <WeekHeading
                    day={Number(item.id)}
                    sessions={item.sessions}
                    totalsFor={(id) => history.bySession.get(id)?.totals ?? emptyTotals}
                    format={format}
                  />
                ) : (
                  <HistoryRow
                    session={item.session}
                    stats={history.bySession.get(item.id)}
                    format={format}
                    timezone={timezone}
                    onPress={() =>
                      router.push({ pathname: "/history/[id]", params: { id: item.id } })
                    }
                    onLongPress={() => setMenuSession(item.session)}
                  />
                )}
              </Animated.View>
            )}
          />
        )}
      </Page>
      <ActionSheet
        title={menuSession?.title ?? ""}
        isOpen={menuSession !== null}
        onOpenChange={(open) => {
          if (!open) setMenuSession(null);
        }}
        actions={
          menuSession
            ? [
                {
                  key: "again",
                  label: t("session__perform_again"),
                  icon: ArrowClockwise,
                  onPress: () => void startAgain(menuSession.id),
                },
                {
                  key: "open",
                  label: t("session__open_details"),
                  icon: Eye,
                  onPress: () =>
                    router.push({ pathname: "/history/[id]", params: { id: menuSession.id } }),
                },
              ]
            : []
        }
      />
      {startSheet}
    </>
  );
}
