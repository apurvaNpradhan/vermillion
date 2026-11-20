import {
  MUSCLE_DETAILS,
  detailsOf,
  type MuscleDetail,
  type MuscleGroup,
} from "../../exercise/vocabulary";
import { isCounted, type LoggedSet } from "../logging/logged-set";

export type MuscleLoad = { muscle: MuscleGroup; sets: number };

/** What the distribution needs of an exercise: the muscles it works. */
export type DistributionExercise = {
  id: string;
  primary_muscle: MuscleGroup;
  secondary_muscles: readonly MuscleGroup[];
  /** Muscle details (ADR 0050); absent or empty for a row without them. */
  primary_detail?: readonly MuscleDetail[];
  secondary_detail?: readonly MuscleDetail[];
};

/**
 * Sets per muscle over the Counted sets: 1 for the exercise's primary muscle and 0.5 for each
 * secondary. Ranked, most sets first (ties by name). A set whose exercise is not in `exercises`
 * adds nothing.
 */
export function muscleDistribution(
  sets: readonly LoggedSet[],
  exercises: readonly DistributionExercise[],
): MuscleLoad[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  return distributeSets(
    sets.flatMap((set) => {
      const exercise = byId.get(set.exercise_id);
      return exercise && isCounted(set) ? [{ ...exercise, count: 1 }] : [];
    }),
  );
}

export function distributeSets(
  exercises: readonly (Omit<DistributionExercise, "id"> & { count: number })[],
): MuscleLoad[] {
  const totals = new Map<MuscleGroup, number>();
  const add = (muscle: MuscleGroup, amount: number) =>
    totals.set(muscle, (totals.get(muscle) ?? 0) + amount);
  for (const exercise of exercises) {
    if (exercise.count <= 0) continue;
    add(exercise.primary_muscle, exercise.count);
    for (const muscle of new Set(exercise.secondary_muscles)) {
      if (muscle !== exercise.primary_muscle) add(muscle, exercise.count * 0.5);
    }
  }
  return [...totals]
    .map(([muscle, count]) => ({ muscle, sets: count }))
    .sort((a, b) => b.sets - a.sets || (a.muscle < b.muscle ? -1 : 1));
}

/** One part of a group's volume: a detail, or `unspecified` for sets that name none. */
export type DetailPart = { detail: MuscleDetail | "unspecified"; sets: number };
export type DetailLoad = { muscle: MuscleGroup; parts: DetailPart[] };

/**
 * The split of each group's sets across its details (ADR 0050): a set's 1 is divided equally over
 * the primary details, its 0.5 per secondary group over that group's secondary details, and
 * whatever has no detail is `unspecified`. The parts of a group add up to that group's total in
 * `muscleDistribution`. Parts follow the group's display order, `unspecified` last, and zero
 * parts are left out. Groups are ranked like `muscleDistribution`.
 */
export function detailDistribution(
  sets: readonly LoggedSet[],
  exercises: readonly DistributionExercise[],
): DetailLoad[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  return distributeDetails(
    sets.flatMap((set) => {
      const exercise = byId.get(set.exercise_id);
      return exercise && isCounted(set) ? [{ ...exercise, count: 1 }] : [];
    }),
  );
}

export function distributeDetails(
  exercises: readonly (Omit<DistributionExercise, "id"> & { count: number })[],
): DetailLoad[] {
  const parts = new Map<MuscleGroup, Map<DetailPart["detail"], number>>();
  const add = (muscle: MuscleGroup, details: readonly MuscleDetail[], amount: number) => {
    const group = parts.get(muscle) ?? new Map<DetailPart["detail"], number>();
    parts.set(muscle, group);
    // Details of another group (a row that broke the rule) are not parts of this one.
    const own = [...new Set(details)].filter((detail) => MUSCLE_DETAILS[detail] === muscle);
    const targets: readonly DetailPart["detail"][] = own.length > 0 ? own : ["unspecified"];
    for (const target of targets) {
      group.set(target, (group.get(target) ?? 0) + amount / targets.length);
    }
  };
  for (const exercise of exercises) {
    if (exercise.count <= 0) continue;
    add(exercise.primary_muscle, exercise.primary_detail ?? [], exercise.count);
    for (const muscle of new Set(exercise.secondary_muscles)) {
      if (muscle !== exercise.primary_muscle) {
        add(muscle, exercise.secondary_detail ?? [], exercise.count * 0.5);
      }
    }
  }
  return distributeSets(exercises).map(({ muscle }) => {
    const split = parts.get(muscle) ?? new Map<DetailPart["detail"], number>();
    const order: DetailPart["detail"][] = [...detailsOf(muscle), "unspecified"];
    return {
      muscle,
      parts: order.flatMap((detail) => {
        const sets = split.get(detail) ?? 0;
        return sets > 0 ? [{ detail, sets }] : [];
      }),
    };
  });
}
