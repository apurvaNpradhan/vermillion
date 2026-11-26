import {
  offerLighterWeek,
  sessionsInRange,
  stalledExerciseIds,
  weekRange,
} from "@workspace/shared";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import {
  stallMemory,
  useExercise,
  useExerciseUnit,
  useStallVersion,
  useTopSetText,
} from "@/exercise";
import { useExerciseRules } from "@/exercise";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { usePreferences } from "@/preferences";
import { sessionRecords, usePreviousSets, useRecordHistory } from "@/session";
import { ANCHORED } from "@/platform/navigation/anchored";
import { useDeloadWeek } from "@/training/phases/use-deload-week";
import type { useActiveProgram } from "@/training/programs/use-active-program";

import { useHomeTraining } from "./use-home-training";

/** A last session older than this has no records card: it is news no more. */
const RECORDS_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * Home's contextual cards, each only when it applies: a running deload without a program (a line
 * with its end date and "Undo deload", or "End now" once a workout was logged in it), otherwise
 * the offer when several lifts trained this week have stalled ("Deload this week", for the active
 * program or on its own), or a note about the one or two that have; and the records of the last
 * workout.
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
  const stallVersion = useStallVersion();
  const run = program.run;
  const now = new Date();
  const { lighterWeeks, deloadCardDismissedAt } = preferences.ui;
  const deload = useDeloadWeek({
    run,
    sessions: program.sessionPhases,
    sessionStarts: state.finished?.map((session) => session.started_at),
  });
  const week = weekRange(now, state.timezone, state.weekStart);
  const { start: weekStartMs, end: weekEndMs } = week;
  const thisWeek = useMemo(
    () => sessionsInRange(state.sessions, { start: weekStartMs, end: weekEndMs }, state.timezone),
    [state.sessions, weekStartMs, weekEndMs, state.timezone],
  );
  const exerciseIds = useMemo(
    () => [...new Set(thisWeek.flatMap((session) => session.sets.map((set) => set.exercise_id)))],
    [thisWeek],
  );
  const histories = usePreviousSets(exerciseIds);
  const rules = useExerciseRules();
  const { lighter } = deload;
  const { previousSource, weightUnit, weightIncrementKg, weightIncrementUnit } = preferences.ui;
  const today = now.toISOString().slice(0, 10);
  const { history, ready, bodyweightOn } = histories;
  const rulesByExercise = rules.value;
  const rulesLoading = rules.loading;
  // The verdict scans each exercise's history; Home renders often, so it is worked out again only
  // when what it reads changes (a new watch result, a dismissal, a new day).
  const stalled = useMemo(() => {
    if (!ready || rulesLoading) return [];
    return stalledExerciseIds(
      thisWeek,
      history,
      {
        previousSource,
        unit: weightUnit,
        weightIncrementKg,
        weightIncrementUnit,
        lighterWeeks,
        bodyweightKg: bodyweightOn(new Date().toISOString()),
        stallMemory,
      },
      // A maintained lift is never stalled.
      rulesByExercise ?? new Map(),
    );
    // `today` and `stallVersion` stand for what the verdict reads from the clock and the device.
  }, [
    thisWeek,
    history,
    ready,
    bodyweightOn,
    rulesByExercise,
    rulesLoading,
    previousSource,
    weightUnit,
    weightIncrementKg,
    weightIncrementUnit,
    lighterWeeks,
    today,
    stallVersion,
  ]);
  const latest = state.recent[0];
  const showRecords =
    latest !== undefined && now.getTime() - Date.parse(latest.started_at) <= RECORDS_DAYS * DAY_MS;
  const records = showRecords ? <RecordsCard session={latest} /> : null;
  if (lighter) {
    const date = new Intl.DateTimeFormat(i18n.language, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: state.timezone,
    }).format(new Date(lighter.until));
    return (
      <>
        <View className="min-h-11 flex-row items-center justify-between gap-3 px-1">
          <Text className="font-normal flex-1 text-caption text-muted">
            {t("lighter__until", { date })}
          </Text>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={deload.endLighter}
            className="min-h-11 justify-center"
          >
            <Text className="text-caption font-medium text-foreground">
              {t(deload.canUndoLighter ? "deload__undo" : "lighter__end")}
            </Text>
          </Pressable>
        </View>
        {deload.dialog}
        {records}
      </>
    );
  }
  if (!histories.ready || rules.loading) return records;
  // A week that is already a Deload needs no offer of one.
  const offer =
    !program.paused &&
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
          <View className="gap-1">
            <Text className="font-semibold text-body text-foreground">
              {t("deload__offer_title")}
            </Text>
            <Text className="font-normal text-caption text-muted">
              {t(run ? "deload__offer_body_run" : "deload__offer_body")}
            </Text>
          </View>
          <View className="flex-row gap-3">
            <Button className="flex-1" variant="secondary" onPress={deload.ask}>
              <Button.Label>{t("deload__action")}</Button.Label>
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
      {deload.dialog}
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
  const { total, flags } = sessionRecords({
    history: history.sessions,
    session,
    bodyweightKg: preferences.ui.bodyweightKg,
  });
  // The set that carries the most records is the one worth naming.
  const flagged = session.sets
    .filter((set) => (flags.get(set.id)?.length ?? 0) > 0)
    .sort((a, b) => (flags.get(b.id)?.length ?? 0) - (flags.get(a.id)?.length ?? 0))[0];
  const exerciseUnit = useExerciseUnit(flagged?.exercise_id ?? "");
  if (history.loading || history.failed || total === 0) return null;
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
              set: topSetText(flagged, flagged.exercise_type, exerciseUnit.value ?? undefined),
            })
          : session.title}
      </Text>
    </Pressable>
  );
}
