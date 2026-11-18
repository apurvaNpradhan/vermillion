import { useWeight, WeightTrendCard } from "@/body";
import { useTranslation } from "@/platform/i18n";
import { useToday } from "@/platform/use-today";
import { Button } from "@/platform/ui/button";
import { FadeIn } from "@/platform/ui/fade-in";
import { useActiveSessions, useStartSession } from "@/session";
import { KG_PER_LB, sessionGoal } from "@workspace/shared";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { comparableWeekSessions, homeWeek, weekSummary } from "./home-stats";
import { useActiveProgram } from "@/training/programs/use-active-program";
import { useHomeTraining } from "./use-home-training";
import { useWorkout } from "@/training/workouts/use-workout";
import { estimateMinutes } from "@/training/workouts/estimate";
import { useWorkoutRecency } from "@/training/train/use-workout-recency";
import { slotTitle } from "@/training/rotation/rotation-row";
import { muscleRadarAxes } from "@/training/muscles/muscle-axes";
import { muscleWindow } from "@/training/muscles/muscle-window";
import { useMuscleLoads } from "@/training/muscles/use-muscle-volume";
import { HomeWeekStrip } from "./home-week-strip";
import { LighterWeekCard } from "./lighter-week-card";
import { NextWorkoutCard } from "./next-workout-card";
import { WeekCard } from "./week-card";

/**
 * Home, in four blocks: the week strip, the next workout, this week and the body. The Lighter week
 * card joins them only when a deload is suggested.
 */
export function TrainingHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { start, sheet } = useStartSession();
  const state = useHomeTraining();
  const weight = useWeight();
  const active = useActiveSessions();
  const programState = useActiveProgram();
  const recency = useWorkoutRecency();
  const { now } = useToday(state.timezone);
  // This week's muscle volume reads the Sessions Home already watches, not a second watch of them.
  const muscleWeek = useMemo(
    () => muscleWindow(now, state.timezone, state.weekStart, 0, 1),
    [now, state.timezone, state.weekStart],
  );
  const muscles = useMuscleLoads({
    sessions: state.finished,
    week: muscleWeek,
    program: programState.program,
  });
  const radarAxes = useMemo(
    () => muscleRadarAxes(muscles.loads, muscles.rows),
    [muscles.loads, muscles.rows],
  );
  const next = programState.program?.slots.find(
    (slot) => slot.id === programState.progress.next?.id,
  );
  const recent = recency.value?.[0];
  const workoutId = next?.workoutId ?? recent?.id ?? null;
  const workout = useWorkout(workoutId ?? "");
  // One ready state for the whole screen: every part appears together.
  const loading =
    state.loading ||
    weight.loading ||
    active.loading ||
    muscles.loading ||
    !programState.ready ||
    recency.loading ||
    (workoutId !== null && workout.status === "loading");
  const failed = state.failed || weight.failed || muscles.failed;
  const retry = () => {
    state.retry();
    weight.retry();
    muscles.retry();
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

  // ---- Next workout ----
  const slots = programState.program?.slots ?? [];
  const nextIndex = next ? slots.findIndex((slot) => slot.id === next.id) : -1;
  const exercises = workout.status === "ready" ? workout.workout.exercises : [];
  const hasWorkout = resume !== undefined || (workoutId !== null && workout.status === "ready");
  const title = resume?.title ?? (next ? slotTitle(next, t) : (recent?.title ?? null));
  const meta = resume
    ? t("home__in_progress")
    : exercises.length === 0
      ? t("training__workout_empty_meta")
      : t("training__workout_meta", {
          count: exercises.length,
          minutes: estimateMinutes(exercises),
        });
  const eyebrow = resume
    ? null
    : next
      ? t("home__next_day", { day: nextIndex + 1, total: slots.length })
      : t("home__next_workout");

  // ---- Week strip and this week ----
  const week = homeWeek(state.sessions, now, state.timezone, state.weekStart, hasWorkout);
  const { current, previous } = comparableWeekSessions(
    state.sessions,
    now,
    state.timezone,
    state.weekStart,
  );
  const summary = weekSummary(current, previous, state.bodyweightKg);
  const volume = {
    value: Math.round(state.weightUnit === "lb" ? summary.volume / KG_PER_LB : summary.volume),
    unit: t(state.weightUnit === "lb" ? "training__unit_lb" : "training__unit_kg"),
  };
  const onTarget = muscles.rows.filter((row) => row.status !== null);
  const radarLabel = onTarget.length
    ? t("muscles__tile_label", { done: muscles.onTarget, total: onTarget.length })
    : t("muscles__open");

  return (
    <FadeIn className="gap-6">
      <HomeWeekStrip
        week={week}
        onOpenSession={(id) =>
          router.push({ pathname: "/history/[id]", params: { id } }, { withAnchor: true })
        }
      />
      <NextWorkoutCard
        eyebrow={eyebrow}
        title={hasWorkout ? title : null}
        meta={meta}
        resuming={resume !== undefined}
        onStart={() =>
          resume
            ? router.push({ pathname: "/session/[id]", params: { id: resume.id } })
            : void start(workoutId)
        }
        onStartEmpty={() => void start(null)}
      />
      <LighterWeekCard state={state} />
      <WeekCard
        summary={summary}
        goal={sessionGoal(programState.program, state.sessionsPerWeek)}
        volume={volume}
        axes={radarAxes}
        radarLabel={radarLabel}
      />
      <WeightTrendCard weight={weight} />
      {sheet}
    </FadeIn>
  );
}
