import {
  activeLighterWeek,
  endLighterWeek,
  offerLighterWeek,
  sessionsInRange,
  stalledExerciseIds,
  startLighterWeek,
  weekRange,
} from "@workspace/shared";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { usePreferences } from "@/preferences";
import { usePreviousSets } from "@/session";

import { useHomeTraining } from "./use-home-training";

/**
 * Home's Lighter week: one quiet card when several lifts trained this week have stalled, and,
 * while one is running, a small line with its end date and "End now".
 */
export function LighterWeekCard({ state }: { state: ReturnType<typeof useHomeTraining> }) {
  const { t, i18n } = useTranslation();
  const { preferences, setUi } = usePreferences();
  const now = new Date();
  const { lighterWeeks, deloadCardDismissedAt } = preferences.ui;
  const week = weekRange(now, state.timezone, state.weekStart);
  const thisWeek = sessionsInRange(state.sessions, week, state.timezone);
  const exerciseIds = [
    ...new Set(thisWeek.flatMap((session) => session.sets.map((set) => set.exercise_id))),
  ];
  const histories = usePreviousSets(exerciseIds);
  const active = activeLighterWeek(lighterWeeks, now);
  if (active) {
    const date = new Intl.DateTimeFormat(i18n.language, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: state.timezone,
    }).format(new Date(active.until));
    return (
      <View className="min-h-11 flex-row items-center justify-between gap-3 px-1">
        <Text className="font-normal flex-1 text-caption text-muted">
          {t("lighter__until", { date })}
        </Text>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setUi(endLighterWeek(lighterWeeks, new Date()))}
          className="min-h-11 justify-center"
        >
          <Text className="text-caption font-medium text-identity">{t("lighter__end")}</Text>
        </Pressable>
      </View>
    );
  }
  if (!histories.ready) return null;
  const stalled = stalledExerciseIds(thisWeek, histories.history, { lighterWeeks });
  const offer = offerLighterWeek({
    stalledCount: stalled.length,
    periods: lighterWeeks,
    now,
    dismissedAt: deloadCardDismissedAt,
    weekStartMs: week.start,
  });
  if (!offer) return null;
  return (
    <View className="gap-3 rounded-2xl bg-surface p-4">
      <Text className="font-normal text-body text-foreground">{t("lighter__card_title")}</Text>
      <View className="flex-row gap-3">
        <Button
          className="flex-1"
          onPress={() => setUi(startLighterWeek(lighterWeeks, new Date()))}
        >
          <Button.Label>{t("lighter__start")}</Button.Label>
        </Button>
        <Button
          className="flex-1"
          variant="tertiary"
          onPress={() => setUi({ deloadCardDismissedAt: new Date().toISOString() })}
        >
          <Button.Label>{t("lighter__dismiss")}</Button.Label>
        </Button>
      </View>
    </View>
  );
}
