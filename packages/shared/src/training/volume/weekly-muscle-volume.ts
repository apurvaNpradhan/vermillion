import type { MuscleGroup } from "../../exercise/vocabulary";
import { isCounted, type LoggedSet, type SessionHistory } from "../logging/logged-set";
import { GOAL_ROTATION_MAX } from "../plans/session-goal";
import type { SetKind } from "../vocabulary/vocabulary";
import { calendarDay, type WeekRange } from "../plans/week";
import {
  detailDistribution,
  distributeSets,
  muscleDistribution,
  type DetailLoad,
  type DistributionExercise,
  type MuscleLoad,
} from "./muscle-distribution";
import {
  TARGET_MUSCLES,
  goalRange,
  muscleStatus,
  type MuscleGoals,
  type MuscleStatus,
  type SetRange,
  type TargetMuscle,
} from "./muscle-targets";

const DAY_MS = 86_400_000;

/** The week `weeks` before (negative: after) `week`. */
export function shiftWeek(week: WeekRange, weeks: number): WeekRange {
  return { start: week.start - weeks * 7 * DAY_MS, end: week.end - weeks * 7 * DAY_MS };
}

/** The Sessions that started in `week` (the same rule as the Home week card). */
export function sessionsInRange<T extends { started_at: string }>(
  sessions: readonly T[],
  week: WeekRange,
  timezone: string,
): T[] {
  return sessions.filter((session) => {
    const day = calendarDay(session.started_at, timezone);
    return day >= week.start && day < week.end;
  });
}

/**
 * Muscle volume: the Counted sets per muscle (1 for the primary muscle, 0.5 for each secondary)
 * over the Sessions that started in `week`. Muscles with no sets are absent; halves are kept.
 */
export function weeklyMuscleVolume(
  sessions: readonly Pick<SessionHistory, "started_at" | "sets">[],
  exercises: readonly DistributionExercise[],
  week: WeekRange,
  timezone: string,
): MuscleLoad[] {
  return muscleDistribution(
    sessionsInRange(sessions, week, timezone).flatMap((session) => session.sets),
    exercises,
  );
}

/** The same Counted sets as `weeklyMuscleVolume`, split into each group's muscle details. */
export function weeklyDetailVolume(
  sessions: readonly Pick<SessionHistory, "started_at" | "sets">[],
  exercises: readonly DistributionExercise[],
  week: WeekRange,
  timezone: string,
): DetailLoad[] {
  return detailDistribution(
    sessionsInRange(sessions, week, timezone).flatMap((session) => session.sets),
    exercises,
  );
}

type PlannedExercise = {
  primaryMuscle: MuscleGroup | null;
  secondaryMuscles: readonly MuscleGroup[];
  sets: readonly { kind: SetKind }[];
};

/** Count the rotation once per week, or scale it to the Program's training frequency. */
export function plannedMuscleVolume(program: {
  sessionsPerWeek: number | null;
  slots: readonly { workout: { exercises: readonly PlannedExercise[] } | null }[];
}): MuscleLoad[] {
  const workouts = program.slots.flatMap((slot) => (slot.workout ? [slot.workout] : []));
  if (workouts.length === 0) return [];
  const cyclesPerWeek =
    program.sessionsPerWeek !== null
      ? program.sessionsPerWeek / workouts.length
      : Math.min(1, GOAL_ROTATION_MAX / program.slots.length);
  return distributeSets(
    workouts.flatMap(({ exercises }) =>
      exercises.flatMap(({ primaryMuscle, secondaryMuscles, sets }) =>
        primaryMuscle === null
          ? []
          : [
              {
                primary_muscle: primaryMuscle,
                secondary_muscles: secondaryMuscles,
                count: sets.filter((set) => set.kind !== "warmup").length,
              },
            ],
      ),
    ),
  ).map(({ muscle, sets }) => ({ muscle, sets: Math.round(sets * cyclesPerWeek * 2) / 2 }));
}

/** One targeted muscle's week: its sets, its range and where it stands. */
export type MuscleRow = {
  muscle: TargetMuscle;
  sets: number;
  range: SetRange | null;
  status: MuscleStatus | null;
};

const STATUS_ORDER = { below: 0, on_target: 1, above: 2 } as const satisfies Record<
  MuscleStatus,
  number
>;

/**
 * Every targeted muscle with its status, those below target first (the furthest below first),
 * then on target, then above (the furthest above first). Ties keep the order of `TARGET_MUSCLES`.
 */
export function muscleRows(
  loads: readonly MuscleLoad[],
  goals: MuscleGoals,
  planned: readonly MuscleLoad[] | null = null,
): MuscleRow[] {
  const sets = new Map(loads.map((load) => [load.muscle, load.sets]));
  const targets = new Map(planned?.map((load) => [load.muscle, load.sets]));
  const rows = TARGET_MUSCLES.map((muscle): MuscleRow => {
    const range = goalRange(goals[muscle], planned === null ? null : (targets.get(muscle) ?? 0));
    const count = sets.get(muscle) ?? 0;
    return { muscle, sets: count, range, status: range ? muscleStatus(count, range) : null };
  });
  // How far through the range a muscle is: below sorts low first, above high first.
  const rank = (row: MuscleRow) => (row.status === null ? 3 : STATUS_ORDER[row.status]);
  const progress = (row: MuscleRow) => {
    if (row.range === null) return -row.sets;
    return row.status === "above"
      ? -(row.sets - row.range.max)
      : row.sets / Math.max(row.range.min, 1);
  };
  return rows.sort((a, b) => rank(a) - rank(b) || progress(a) - progress(b));
}

/** How many targeted muscles are on target. */
export const onTargetCount = (rows: readonly MuscleRow[]) =>
  rows.filter((row) => row.status === "on_target").length;

/** One exercise's share of a muscle's sets in a week. */
export type MuscleContribution = { exerciseId: string; title: string; sets: number };

/** The exercises that fed a muscle in the Sessions of `week`, most sets first. */
export function muscleContributions(
  sessions: readonly Pick<SessionHistory, "started_at" | "sets">[],
  exercises: readonly (DistributionExercise & { title: string })[],
  muscle: MuscleGroup,
  week: WeekRange,
  timezone: string,
): MuscleContribution[] {
  const sets: LoggedSet[] = sessionsInRange(sessions, week, timezone).flatMap(
    (session) => session.sets,
  );
  return exercises
    .flatMap((exercise): MuscleContribution[] => {
      const own = muscleDistribution(
        sets.filter((set) => set.exercise_id === exercise.id && isCounted(set)),
        [exercise],
      ).find((load) => load.muscle === muscle);
      return own ? [{ exerciseId: exercise.id, title: exercise.title, sets: own.sets }] : [];
    })
    .sort((a, b) => b.sets - a.sets || (a.title < b.title ? -1 : 1));
}
