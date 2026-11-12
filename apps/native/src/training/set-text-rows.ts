import {
  formatWeight,
  SET_FIELDS,
  type EffortScale,
  type ExerciseType,
  type PlannedSet,
  type SetField,
  type SetKind,
  type WeightUnit,
} from "@workspace/shared";

import { formatEffortRange } from "./effort";
import { formatClock } from "./rest";

/** One column of a read-only set table. */
export type SetColumn = SetField | "effort";

export type SetTextRow = {
  key: string;
  /** The set's marker: its number, or the letter of its kind. */
  marker: string;
  kind: SetKind;
  cells: string[];
};

const DASH = "–";
const meters = (value: number) => String(Number(value.toFixed(1)));

function range(min: number | undefined, max: number | undefined): string {
  if (min === undefined || max === undefined) return DASH;
  return min === max ? String(min) : `${min}–${max}`;
}

/**
 * The columns a planned-set table shows for an exercise type, in reading order. Effort has a
 * column only when a set sets one.
 */
export function plannedColumns(type: ExerciseType, sets: readonly PlannedSet[]): SetColumn[] {
  const effort = sets.some((set) => set.effort_min !== undefined);
  return SET_FIELDS[type].flatMap((field): SetColumn[] =>
    field === "reps" && effort ? [field, "effort"] : [field],
  );
}

/** One planned set as the text of each column. A warm-up has no effort. */
export function plannedCells(
  set: PlannedSet,
  columns: readonly SetColumn[],
  unit: WeightUnit,
  scale: EffortScale,
): string[] {
  return columns.map((column) => {
    switch (column) {
      case "weight":
        return set.weight_kg === undefined ? DASH : formatWeight(set.weight_kg, unit);
      case "reps":
        return range(set.reps_min, set.reps_max);
      case "effort":
        return set.kind === "warmup" || set.effort_min === undefined || set.effort_max === undefined
          ? DASH
          : formatEffortRange(set.effort_min, set.effort_max, scale);
      case "duration":
        return set.duration_s === undefined ? DASH : formatClock(set.duration_s);
      case "distance":
        return set.distance_m === undefined ? DASH : meters(set.distance_m);
      case "floors":
        return set.floors === undefined ? DASH : String(set.floors);
      case "steps":
        return set.steps === undefined ? DASH : String(set.steps);
    }
  });
}

/** The rows of a planned-set table; `markers` are the set chips (1…n, W, D…). */
export function plannedRows(
  sets: readonly PlannedSet[],
  markers: readonly string[],
  columns: readonly SetColumn[],
  unit: WeightUnit,
  scale: EffortScale,
): SetTextRow[] {
  return sets.map((set, index) => ({
    key: String(index),
    marker: markers[index] ?? String(index + 1),
    kind: set.kind,
    cells: plannedCells(set, columns, unit, scale),
  }));
}
