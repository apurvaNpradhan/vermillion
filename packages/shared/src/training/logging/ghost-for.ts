import type { SuggestedSet } from "../progress/progression";
import type { SetField } from "../../exercise/vocabulary";
import type { SetValues } from "./logged-set";
import type { PlannedSet } from "../plans/planned-sets";
import { SET_VALUE_KEYS } from "./session-inputs";

/** The cells that can show a Ghost value: the fields of `SET_FIELDS` and effort. */
export type GhostField = SetField | "rpe";

/**
 * The Ghost value of an empty cell (ADR 0038).
 * - Reps: Previous reps when they lie inside the planned range, else the range's lower bound;
 *   with no range, Previous reps.
 * - Effort: the planned effort (the lower end of its range).
 * - Weight, duration, distance, floors and steps: Previous, else the planned target. In a repeated
 *   exercise (Perform again) the planned target, which is what was logged last time, comes first.
 */
export function ghostFor(
  field: GhostField,
  previous: SetValues | null,
  target: PlannedSet | null,
  suggestion?: SuggestedSet | null,
  repeated = false,
): number | null {
  if (suggestion && target?.kind !== "warmup") {
    if (field === "weight" && suggestion.weightKg !== null) return suggestion.weightKg;
    if (field === "reps" && suggestion.reps !== null) return suggestion.reps;
    if (field === "duration" && suggestion.durationS != null) return suggestion.durationS;
    if (field === "distance" && suggestion.distanceM != null) return suggestion.distanceM;
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
  return repeated
    ? (target?.[key] ?? previous?.[key] ?? null)
    : (previous?.[key] ?? target?.[key] ?? null);
}
