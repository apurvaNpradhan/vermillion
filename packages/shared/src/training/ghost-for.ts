import type { SuggestedSet } from "./progression";
import type { SetField } from "../exercise/vocabulary";
import type { SetValues } from "./logged-set";
import type { PlannedSet } from "./planned-sets";
import { SET_VALUE_KEYS } from "./session-inputs";

/** The cells that can show a Ghost value: the fields of `SET_FIELDS` and effort. */
export type GhostField = SetField | "rpe";

/**
 * The Ghost value of an empty cell (ADR 0038).
 * - Reps: Previous reps when they lie inside the planned range, else the range's lower bound;
 *   with no range, Previous reps.
 * - Effort: the planned effort (the lower end of its range).
 * - Weight, duration, distance, floors and steps: Previous, else the planned target.
 */
export function ghostFor(
  field: GhostField,
  previous: SetValues | null,
  target: PlannedSet | null,
  suggestion?: SuggestedSet | null,
): number | null {
  if (target?.kind === "working" && suggestion) {
    if (field === "weight" && suggestion.weightKg !== null) return suggestion.weightKg;
    if (field === "reps" && suggestion.reps !== null) return suggestion.reps;
  }
  if (field === "rpe") return target?.effort_min ?? null;
  if (field === "reps") {
    const reps = previous?.reps ?? null;
    const min = target?.reps_min;
    if (min === undefined) return reps;
    const max = target?.reps_max ?? min;
    return reps !== null && reps >= min && reps <= max ? reps : min;
  }
  const key = SET_VALUE_KEYS[field];
  return previous?.[key] ?? target?.[key] ?? null;
}
