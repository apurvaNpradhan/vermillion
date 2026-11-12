import {
  SET_FIELDS,
  actualValuesSchema,
  SET_VALUE_KEYS,
  formatWeight,
  ghostFor,
  previousFor,
  type ExerciseType,
  type GhostField,
  type Ghosts,
  type SuggestedSet,
  type LoggedSet,
  type PlannedSet,
  type SessionHistory,
  type SetField,
  type SetKind,
  type SetValues,
  type WeightUnit,
} from "@workspace/shared";
import type { SessionDetail, SessionSetDetail, SetPatch } from "@workspace/sync";

import { formatElapsed } from "./clock";

/** The place of a set among the sets of its kind in one exercise (0-based): warm-up 1, working 2. */
export function ordinalOf(sets: readonly { kind: SetKind }[], index: number): number {
  const kind = sets[index]?.kind;
  return sets.slice(0, index).filter((set) => set.kind === kind).length;
}

/** The set a row's Previous cell shows: the matching set of the latest finished Session, or null. */
export function previousOfRow(
  history: readonly SessionHistory[] | undefined,
  sets: readonly { kind: SetKind }[],
  index: number,
): LoggedSet | null {
  const set = sets[index];
  if (!set || !history) return null;
  return previousFor(history, set.kind, ordinalOf(sets, index));
}

/**
 * The Ghost value of each cell of a set: Previous, else the planned target (reps by the range
 * rule). Effort has a Ghost only while the exercise logs effort.
 */
export function ghostsOf(
  type: ExerciseType,
  previous: SetValues | null,
  target: PlannedSet | null,
  logEffort: boolean,
  suggestion?: SuggestedSet | null,
): Ghosts {
  const fields: readonly GhostField[] = logEffort ? [...SET_FIELDS[type], "rpe"] : SET_FIELDS[type];
  const ghosts: Ghosts = {};
  for (const field of fields) ghosts[field] = ghostFor(field, previous, target, suggestion);
  return ghosts;
}

const SEPARATOR = " · ";
const meters = (value: number) => String(Number(value.toFixed(1)));

/** One cell value as text, in the user's unit; empty for null. */
export function formatCell(
  field: SetField,
  value: number | null | undefined,
  unit: WeightUnit,
): string {
  if (value === null || value === undefined) return "";
  switch (field) {
    case "weight":
      return formatWeight(value, unit);
    case "duration":
      return formatElapsed(value);
    case "distance":
      return meters(value);
    case "reps":
    case "floors":
    case "steps":
      return String(Math.round(value));
  }
}

/**
 * The Previous cell: "60 × 8" for weight and reps, otherwise the recorded fields joined by " · ".
 * Units are left out; the column header carries the weight unit.
 */
export function previousLabel(
  previous: SetValues,
  type: ExerciseType,
  unit: WeightUnit,
): string | null {
  const fields: readonly SetField[] = SET_FIELDS[type];
  const parts = fields.flatMap((field) => {
    const text = formatCell(field, previous[SET_VALUE_KEYS[field]], unit);
    return text === "" ? [] : [{ field, text }];
  });
  if (parts.length === 0) return null;
  const weight = parts.find((part) => part.field === "weight");
  const reps = parts.find((part) => part.field === "reps");
  if (weight && reps && parts.length === 2) return `${weight.text} × ${reps.text}`;
  return parts.map((part) => part.text).join(SEPARATOR);
}

/** The set patch that writes `value` into the cell of `field`. */
export function patchFor(field: SetField, value: number | null): SetPatch {
  switch (field) {
    case "weight":
      return { weight_kg: value };
    case "reps":
      return { reps: value };
    case "duration":
      return { duration_s: value };
    case "distance":
      return { distance_m: value };
    case "floors":
      return { floors: value };
    case "steps":
      return { steps: value };
  }
}

/** Tapping Previous copies its fields (and effort, when the exercise logs it) into the row. */
export function previousPatch(
  previous: SetValues,
  type: ExerciseType,
  logEffort: boolean,
): SetPatch {
  const patch: SetPatch = {};
  for (const field of SET_FIELDS[type]) {
    const value = previous[SET_VALUE_KEYS[field]];
    if (value !== null && value !== undefined) Object.assign(patch, patchFor(field, value));
  }
  if (logEffort && SET_FIELDS[type].some((field) => field === "reps")) {
    const rpe = actualValuesSchema.shape.rpe.safeParse(previous.rpe ?? null);
    if (rpe.success && rpe.data !== null) patch.rpe = rpe.data;
  }
  return patch;
}

/** What a Session set stores in the cell of `field`. */
export function valueOfSet(
  set: Pick<SessionSetDetail, "weightKg" | "reps" | "durationS" | "distanceM" | "floors" | "steps">,
  field: SetField,
): number | null {
  switch (field) {
    case "weight":
      return set.weightKg;
    case "reps":
      return set.reps;
    case "duration":
      return set.durationS;
    case "distance":
      return set.distanceM;
    case "floors":
      return set.floors;
    case "steps":
      return set.steps;
  }
}

/** The sets of a Session as Logged sets, for the totals in the header. */
export function loggedSetsOf(detail: SessionDetail): LoggedSet[] {
  return detail.exercises.flatMap((exercise) =>
    exercise.sets.map((set): LoggedSet => ({
      id: set.id,
      exercise_id: exercise.exerciseId,
      exercise_type: exercise.type,
      kind: set.kind,
      completed_at: set.completedAt,
      weight_kg: set.weightKg,
      reps: set.reps,
      duration_s: set.durationS,
      distance_m: set.distanceM,
      floors: set.floors,
      steps: set.steps,
      rpe: set.rpe,
    })),
  );
}
