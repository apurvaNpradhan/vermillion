import { Text, View } from "react-native";
import { topSet, useTopSetText } from "@/exercise";
import { useWeight, WeightTrendCard } from "@/body";
import { useTranslation } from "@/platform/i18n";
import { useToday } from "@/platform/use-today";
import { Button } from "@/platform/ui/button";
import { FadeIn } from "@/platform/ui/fade-in";
import { openSessionOf, useActiveSessions, usePreviousSets, useStartSession } from "@/session";
import { usePreferences } from "@/preferences";
import {
  calendarDay,
  historyForWorkout,
  sessionGoal,
  resolveExerciseUnit,
  workoutNumber,
} from "@workspace/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { homeWeek, lastWorkoutSession, sessionMinutes, weekSummary } from "./home-stats";
import { useActiveProgram } from "@/training/programs/use-active-program";
import { useHomeTraining } from "./use-home-training";
import { useWorkout } from "@/training/workouts/use-workout";
import { estimateMinutes } from "@/training/workouts/estimate";
import { useWorkoutRecency } from "@/training/train/use-workout-recency";
import { slotTitle } from "@/training/rotation/rotation-row";
import { HomeWeekStrip } from "./home-week-strip";
import { TrainingNudges } from "./training-nudges";
import { NextWorkoutCard, type NextWorkoutExercise } from "./next-workout-card";
import { ThisWeekRow } from "./this-week-row";
import { ANCHORED } from "@/platform/navigation/anchored";

/**
 * Home: the week strip, the next workout as the hero, this week's totals, and contextual cards
 * (Lighter week, a stalled lift, the last session's records) and the weight trend only when they
 * apply. The yearly report lives on Reports, reached from History.
 */
export function TrainingHome() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { start, startSlot, sheet } = useStartSession({ resumeSameWorkout: true });
  const [weeksAgo, setWeeksAgo] = useState(0);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [direction, setDirection] = useState<-1 | 0 | 1>(0);
  const state = useHomeTraining(undefined, weeksAgo);
  const weight = useWeight();
  const active = useActiveSessions();
  const programState = useActiveProgram();
  const recency = useWorkoutRecency();
  const { now } = useToday(state.timezone);
  const next = programState.program?.slots.find(
    (slot) => slot.id === programState.progress.next?.id,
  );
  const recent = recency.value?.[0];
  const workoutId = next?.workoutId ?? recent?.id ?? null;
  const workout = useWorkout(workoutId ?? "");
  const { preferences } = usePreferences();
  const unit = preferences.ui.weightUnit;
  const topSetText = useTopSetText(unit);
  const exerciseIds =
    workout.status === "ready" ? workout.workout.exercises.map((e) => e.exerciseId) : [];
  const previous = usePreviousSets(exerciseIds);
  // One ready state for the whole screen: every part appears together.
  const loading =
    state.loading ||
    weight.loading ||
    active.loading ||
    !programState.ready ||
    recency.loading ||
    // A failed history watch is not fatal: the card shows without the previous sets.
    previous.loading ||
    (workoutId !== null && workout.status === "loading");
  const failed = state.failed || weight.failed;
  const retry = () => {
    state.retry();
    weight.retry();
  };

  if (failed) {
    return (
      <Button variant="secondary" onPress={retry}>
        <Button.Label>{t("training__retry")}</Button.Label>
      </Button>
    );
  }
  // Everything here is on the device, so it lands in milliseconds: nothing is drawn until then.
  if (loading) return null;

  const resume = active.sessions[0];
  const openOfCard = openSessionOf(active.sessions, workoutId);

  // ---- Next workout ----
  const slots = programState.program?.slots ?? [];
  const exercises = workout.status === "ready" ? workout.workout.exercises : [];
  const hasWorkout = workoutId !== null && workout.status === "ready";
  const title = next ? slotTitle(next, t) : (recent?.title ?? null);
  const meta =
    exercises.length === 0
      ? t("training__workout_empty_meta")
      : t("training__workout_meta", {
          count: exercises.length,
          minutes: estimateMinutes(exercises),
        });
  const eyebrow = next
    ? t("run__progress", {
        week: programState.week,
        workout: workoutNumber(slots, next.id),
      })
    : t("home__next_workout");
  const heroExercises: NextWorkoutExercise[] =
    workout.status === "ready"
      ? workout.workout.exercises.flatMap((entry) => {
          if (!entry.exercise) return [];
          // The same source as the workout preview: "Same workout" looks only at this workout.
          const sets =
            historyForWorkout(
              previous.history.get(entry.exerciseId) ?? [],
              preferences.ui.previousSource === "same_workout" ? workoutId : null,
            )[0]?.sets ?? [];
          const top = topSet(sets, entry.exerciseId, entry.exercise.exerciseType);
          return [
            {
              id: entry.id,
              title: entry.exercise.title,
              lastTopSet: top
                ? topSetText(
                    top,
                    entry.exercise.exerciseType,
                    resolveExerciseUnit(unit, entry.unit),
                  )
                : null,
            },
          ];
        })
      : [];
  const lastSession = lastWorkoutSession(state.sessions, workoutId);
  const lastDuration =
    lastSession === null
      ? null
      : t("home__last_duration", {
          duration: t("session__duration_min", { value: sessionMinutes(lastSession) }),
        });
  const summary = weekSummary(state.sessions, now, state.timezone, state.weekStart);
  const goal = sessionGoal(programState.program, state.sessionsPerWeek);
  const hasWeight = weight.days.some((day) => day.logged);

  // ---- Week strip ----
  const week = homeWeek(state.sessions, now, state.timezone, state.weekStart, hasWorkout, weeksAgo);
  const selected = selectedDay ?? week.today;
  const viewingPast = selected !== week.today;
  const selectedSessions = state.sessions.filter(
    (session) => calendarDay(session.started_at, state.timezone) === selected,
  );
  const moveWeek = (step: -1 | 1) => {
    const next = Math.max(0, weeksAgo - step);
    if (next === weeksAgo) return;
    setDirection(step);
    setWeeksAgo(next);
    setSelectedDay(next === 0 ? null : selected + step * 7 * 86_400_000);
  };

  return (
    <FadeIn className="gap-6">
      <HomeWeekStrip
        week={week}
        selected={selected}
        direction={direction}
        canNext={weeksAgo > 0}
        onSelect={(day) => {
          setDirection(0);
          setSelectedDay(day);
        }}
        onMove={moveWeek}
        onJump={() => {
          setDirection(weeksAgo > 0 ? 1 : 0);
          setWeeksAgo(0);
          setSelectedDay(null);
        }}
      />
      {resume !== undefined && !hasWorkout ? null : (
        <NextWorkoutCard
          eyebrow={eyebrow}
          title={hasWorkout ? title : null}
          meta={meta}
          exercises={heroExercises}
          lastDuration={lastDuration}
          workoutOpen={resume !== undefined}
          resuming={openOfCard !== undefined}
          resumesRun={resume === undefined && programState.paused && Boolean(next?.workoutId)}
          onStart={() =>
            openOfCard
              ? router.push({ pathname: "/session/[id]", params: { id: openOfCard.id } })
              : next?.workoutId && programState.run
                ? void startSlot(next.workoutId, {
                    runId: programState.run.id,
                    slotId: next.id,
                    cycle: programState.progress.cycle,
                  })
                : void start(workoutId)
          }
          onStartEmpty={() => void start(null)}
        />
      )}
      {viewingPast ? (
        <View className="gap-3 rounded-2xl bg-surface p-4">
          <Text className="font-semibold text-title-md text-foreground">
            {new Intl.DateTimeFormat(i18n.language, { dateStyle: "full", timeZone: "UTC" }).format(
              selected,
            )}
          </Text>
          {selectedSessions.length === 0 ? (
            <Text className="font-normal text-body text-muted">
              {t("session__history_empty_day")}
            </Text>
          ) : (
            selectedSessions.map((session) => (
              <Button
                key={session.id}
                variant="secondary"
                onPress={() =>
                  router.push({ pathname: "/history/[id]", params: { id: session.id } }, ANCHORED)
                }
              >
                <Button.Label>{session.title}</Button.Label>
              </Button>
            ))
          )}
        </View>
      ) : null}
      <ThisWeekRow current={summary.current} previous={summary.previous} goal={goal} unit={unit} />
      <TrainingNudges state={state} program={programState} />
      {hasWeight ? <WeightTrendCard weight={weight} /> : null}
      {sheet}
    </FadeIn>
  );
}
