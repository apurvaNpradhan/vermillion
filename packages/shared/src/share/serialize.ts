import type { Equipment, ExerciseType, MuscleGroup } from "../exercise/vocabulary";
import type { PlannedSet } from "../training/plans/planned-sets";
import {
  SHARE_FORMATS,
  type ProgramSnapshot,
  type ShareExercise,
  type ShareWorkout,
  type WorkoutSnapshot,
} from "./snapshot";

/** An exercise as the local library holds it; `custom` is true when the user made it. */
export type ShareExerciseSource = {
  id: string;
  custom: boolean;
  title: string;
  equipment: Equipment;
  exerciseType: ExerciseType;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: readonly MuscleGroup[];
};

export type ShareWorkoutSource = {
  id: string;
  title: string | null;
  exercises: readonly {
    exercise: ShareExerciseSource;
    restSeconds: number | null;
    supersetGroup: string | null;
    sets: readonly PlannedSet[];
  }[];
};

export type ShareProgramSource = {
  title: string;
  description: string | null;
  plannedWeeks: number | null;
  sessionsPerWeek: number | null;
  /** Every Workout the Rotation uses. */
  workouts: readonly ShareWorkoutSource[];
  /** The Rotation as Workout ids; null is a Rest day. */
  rotation: readonly (string | null)[];
};

export type SerializeOptions = {
  /** Keep the planned weights. Off, sets carry reps and effort only. */
  weights: boolean;
};

function exerciseOf(source: ShareExerciseSource): ShareExercise {
  return {
    catalog_id: source.custom ? null : source.id,
    name: source.title,
    equipment: source.equipment,
    exercise_type: source.exerciseType,
    primary_muscle: source.primaryMuscle,
    secondary_muscles: [...source.secondaryMuscles],
  };
}

function setOf(set: PlannedSet, options: SerializeOptions): PlannedSet {
  if (options.weights) return { ...set };
  const { weight_kg: _weight, ...rest } = set;
  return rest;
}

/** Notes (a Workout's, an exercise's) are private and never part of a snapshot. */
function workoutOf(source: ShareWorkoutSource, options: SerializeOptions): ShareWorkout {
  // Group ids become small numbers in order of appearance, so no id of the sharer leaks.
  const groups = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const entry of source.exercises) {
    if (entry.supersetGroup)
      counts.set(entry.supersetGroup, (counts.get(entry.supersetGroup) ?? 0) + 1);
  }
  return {
    title: source.title,
    exercises: source.exercises.map((entry) => {
      let superset: number | null = null;
      // A group of one (its partners were removed) is no Superset.
      if (entry.supersetGroup && (counts.get(entry.supersetGroup) ?? 0) > 1) {
        const known = groups.get(entry.supersetGroup);
        superset = known ?? groups.size;
        if (known === undefined) groups.set(entry.supersetGroup, superset);
      }
      return {
        exercise: exerciseOf(entry.exercise),
        rest_seconds: entry.restSeconds,
        superset,
        sets: entry.sets.map((set) => setOf(set, options)),
      };
    }),
  };
}

/** A Workout as a `sigil.workout/v1` snapshot. */
export function serializeWorkout(
  source: ShareWorkoutSource,
  options: SerializeOptions,
): WorkoutSnapshot {
  return { format: SHARE_FORMATS.workout, workout: workoutOf(source, options) };
}

/** A Program, its Rotation and the Workouts the Rotation uses, as a `sigil.program/v1` snapshot. */
export function serializeProgram(
  source: ShareProgramSource,
  options: SerializeOptions,
): ProgramSnapshot {
  const indexOf = new Map(source.workouts.map((workout, at) => [workout.id, at]));
  return {
    format: SHARE_FORMATS.program,
    program: {
      title: source.title,
      description: source.description,
      planned_weeks: source.plannedWeeks,
      sessions_per_week: source.sessionsPerWeek,
      workouts: source.workouts.map((workout) => workoutOf(workout, options)),
      rotation: source.rotation.map((id) => (id === null ? null : (indexOf.get(id) ?? null))),
    },
  };
}
