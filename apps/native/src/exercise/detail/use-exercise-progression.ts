import { useCallback } from "react";
import { activeRun, cycleState, phaseFor, runPausedAt, type RuleConfig } from "@workspace/shared";
import {
  watchExerciseAutoWarmups,
  watchExerciseHistory,
  watchExerciseProgressionMode,
  watchExerciseRule,
  watchExerciseRules,
  watchExercisePlan,
  watchRunState,
  type FinishedSession,
  type WorkoutDetail,
} from "@workspace/sync";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { useDeviceTimeZone } from "@/platform/i18n/device-time-zone";
import { useProgram } from "@/platform/training/use-program";
import { useWeight } from "@/body";
import { useGymLoads } from "@/gym";
import { usePreferences } from "@/preferences";
import { stallMemory, useStallVersion } from "../stall/stall-store";
import { nextExerciseSuggestion, nextWorkoutCandidates } from "./next-exercise-suggestion";

export function useExerciseProgressionMode(exerciseId: string) {
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchExerciseProgressionMode>[0],
      onValue: (perSet: boolean) => void,
      onError: () => void,
    ) => watchExerciseProgressionMode(database, exerciseId, { onMode: onValue, onError }),
    [exerciseId],
  );
  return useLocalWatch(subscribe);
}

/** The exercise's progression rule; null is Double. */
export function useExerciseRule(exerciseId: string) {
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchExerciseRule>[0],
      onValue: (rule: RuleConfig | null) => void,
      onError: () => void,
    ) => watchExerciseRule(database, exerciseId, { onRule: onValue, onError }),
    [exerciseId],
  );
  return useLocalWatch(subscribe);
}

/** The rule of every exercise that has one, for the stall verdicts of Home. */
export function useExerciseRules() {
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchExerciseRules>[0],
      onValue: (rules: ReadonlyMap<string, RuleConfig>) => void,
      onError: () => void,
    ) => watchExerciseRules(database, { onRules: onValue, onError }),
    [],
  );
  return useLocalWatch(subscribe);
}

export function useExerciseAutoWarmups(exerciseId: string) {
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchExerciseAutoWarmups>[0],
      onValue: (on: boolean) => void,
      onError: () => void,
    ) => watchExerciseAutoWarmups(database, exerciseId, { onValue, onError }),
    [exerciseId],
  );
  return useLocalWatch(subscribe);
}

export function useExerciseProgression(exerciseId: string, gymId?: string | null) {
  const { preferences, isLoading } = usePreferences();
  const { withBodyweight, bodyweightOn } = useWeight();
  const gym = useGymLoads(gymId);
  const timeZone = useDeviceTimeZone();
  useStallVersion();

  const runs = useLocalWatch(watchRunState);
  const run = activeRun(runs.value?.runs ?? []);
  const program = useProgram(run?.program_id ?? "");
  const slots = program.status === "ready" ? program.program.slots : [];
  const { trained } = cycleState(slots, runs.value?.sessions ?? [], runs.value?.skips);
  const subscribeHistory = useCallback(
    (
      database: Parameters<typeof watchExerciseHistory>[0],
      onValue: (value: FinishedSession[]) => void,
      onError: () => void,
    ) => watchExerciseHistory(database, exerciseId, { onHistory: onValue, onError }),
    [exerciseId],
  );
  const history = useLocalWatch(subscribeHistory);
  const candidates = nextWorkoutCandidates(slots, trained, history.value ?? []).join("|");
  const subscribePlan = useCallback(
    (
      database: Parameters<typeof watchExercisePlan>[0],
      onValue: (value: WorkoutDetail | null) => void,
      onError: () => void,
    ) =>
      watchExercisePlan(database, exerciseId, candidates === "" ? [] : candidates.split("|"), {
        onPlan: onValue,
        onError,
      }),
    [exerciseId, candidates],
  );
  const { value: workout } = useLocalWatch(subscribePlan);
  if (
    !workout ||
    !history.value ||
    runs.loading ||
    (run && program.status === "loading") ||
    isLoading
  )
    return null;

  const now = new Date();
  const week =
    run &&
    !runPausedAt(run.pauses, now) &&
    program.status === "ready" &&
    workout.programId === run.program_id
      ? phaseFor(program.program.phasePlan, run, now, timeZone, runs.value?.phaseStarts)
      : null;
  return nextExerciseSuggestion(
    workout,
    exerciseId,
    withBodyweight(history.value),
    gym,
    {
      unit: preferences.ui.weightUnit,
      weightIncrementKg: preferences.ui.weightIncrementKg,
      weightIncrementUnit: preferences.ui.weightIncrementUnit,
      previousSource: preferences.ui.previousSource,
      lighterWeeks: preferences.ui.lighterWeeks,
      bodyweightKg: bodyweightOn(now.toISOString()),
      stallMemory,
    },
    week,
    now,
  );
}
