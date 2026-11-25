import {
  activeLighterWeek,
  endLighterWeek,
  offerLighterWeek,
  sessionsInRange,
  stalledExerciseIds,
  startLighterWeek,
  weekRange,
} from "@workspace/shared";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useExercise, useTopSetText } from "@/exercise";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { usePreferences } from "@/preferences";
import { sessionRecords, usePreviousSets, useRecordHistory } from "@/session";
import { ANCHORED } from "@/platform/navigation/anchored";
import { useInsertDeload } from "@/training/phases/use-insert-deload";
import type { useActiveProgram } from "@/training/programs/use-active-program";

import { useHomeTraining } from "./use-home-training";

/** A last session older than this has no records card: it is news no more. */
const RECORDS_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * Home's contextual cards, each only when it applies: a running Lighter week from before phases
 * (a line with its end date and "End now"), otherwise the offer when several lifts trained this
 * week have stalled (a Deload week inserted into the active Run, or a plain Lighter week when
 * there is no Run), or a note about the one or two that have; and the records of the last Session.
 */
export function TrainingNudges({
  state,
  program,
}: {
  state: ReturnType<typeof useHomeTraining>;
  /** Home's active Program, so the nudges do not watch it a second time. */
  program: ReturnType<typeof useActiveProgram>;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { preferences, setUi } = usePreferences();
  const run = program.run;
  const insert = useInsertDeload(run);
  const now = new Date();
  const { lighterWeeks, deloadCardDismissedAt } = preferences.ui;
  const week = weekRange(now, state.timezone, state.weekStart);
  const thisWeek = sessionsInRange(state.sessions, week, state.timezone);
  const exerciseIds = [
    ...new Set(thisWeek.flatMap((session) => session.sets.map((set) => set.exercise_id))),
  ];
  const histories = usePreviousSets(exerciseIds);
  const active = activeLighterWeek(lighterWeeks, now);
  const latest = state.recent[0];
  const showRecords =
    latest !== undefined && now.getTime() - Date.parse(latest.started_at) <= RECORDS_DAYS * DAY_MS;
  const records = showRecords ? <RecordsCard session={latest} /> : null;
  if (active) {
    const date = new Intl.DateTimeFormat(i18n.language, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: state.timezone,
    }).format(new Date(active.until));
    return (
      <>
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
            <Text className="text-caption font-medium text-foreground">{t("lighter__end")}</Text>
          </Pressable>
        </View>
        {records}
      </>
    );
  }
  if (!histories.ready) return records;
  const stalled = stalledExerciseIds(thisWeek, histories.history, { lighterWeeks });
  // A week that is already a Deload needs no offer of one.
  const offer =
    program.phase?.phase !== "deload" &&
    offerLighterWeek({
      stalledCount: stalled.length,
      periods: lighterWeeks,
      now,
      dismissedAt: deloadCardDismissedAt,
      weekStartMs: week.start,
    });
  const stalledId = stalled[0];
  return (
    <>
      {offer ? (
        <View className="gap-3 rounded-2xl bg-surface p-4">
          <Text className="font-normal text-body text-foreground">
            {t(run ? "phase__offer_title" : "lighter__card_title")}
          </Text>
          <View className="flex-row gap-3">
            <Button
              className="flex-1"
              onPress={() =>
                run ? insert.ask() : setUi(startLighterWeek(lighterWeeks, new Date()))
              }
            >
              <Button.Label>{t(run ? "phase__insert_week" : "lighter__start")}</Button.Label>
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
      ) : stalledId !== undefined ? (
        <StalledCard
          exerciseId={stalledId}
          onOpen={() =>
            router.push({ pathname: "/exercise-view/[id]", params: { id: stalledId } }, ANCHORED)
          }
        />
      ) : null}
      {insert.dialog}
      {records}
    </>
  );
}

/** One stalled lift: its name and a way into its numbers. */
function StalledCard({ exerciseId, onOpen }: { exerciseId: string; onOpen: () => void }) {
  const { t } = useTranslation();
  const state = useExercise(exerciseId);
  if (state.status !== "ready") return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t("home__stalled_hint")}
      onPress={onOpen}
      className="gap-1 rounded-2xl bg-surface p-4 active:opacity-70"
    >
      <Text className="font-semibold text-body text-foreground">
        {t("home__stalled_title", { title: state.exercise.title })}
      </Text>
      <Text className="font-normal text-caption text-muted">{t("home__stalled_body")}</Text>
    </Pressable>
  );
}

/** The records of the last Session, when it set any: its name, how many, and a way into it. */
function RecordsCard({
  session,
}: {
  session: ReturnType<typeof useHomeTraining>["recent"][number];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { preferences } = usePreferences();
  const history = useRecordHistory(session.sets.map((set) => set.exercise_id));
  const topSetText = useTopSetText(preferences.ui.weightUnit);
  if (history.loading || history.failed) return null;
  const { total, flags } = sessionRecords({
    history: history.sessions,
    session,
    bodyweightKg: preferences.ui.bodyweightKg,
  });
  if (total === 0) return null;
  // The set that carries the most records is the one worth naming.
  const flagged = session.sets
    .filter((set) => (flags.get(set.id)?.length ?? 0) > 0)
    .sort((a, b) => (flags.get(b.id)?.length ?? 0) - (flags.get(a.id)?.length ?? 0))[0];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: "/history/[id]", params: { id: session.id } }, ANCHORED)
      }
      className="gap-1 rounded-2xl bg-surface p-4 active:opacity-70"
    >
      <Text className="font-semibold text-body text-accent-text">
        {t("home__records_title", { count: total })}
      </Text>
      <Text numberOfLines={1} className="font-normal text-caption text-muted">
        {flagged
          ? t("home__records_body", {
              title: session.title,
              set: topSetText(flagged, flagged.exercise_type),
            })
          : session.title}
      </Text>
    </Pressable>
  );
}
