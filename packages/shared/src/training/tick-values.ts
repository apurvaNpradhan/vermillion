import type { SetField } from "../exercise/vocabulary";
import type { GhostField } from "./ghost-for";
import type { SetValues } from "./logged-set";
import {
  actualValuesSchema,
  fieldHasValue,
  SET_VALUE_KEYS,
  type ActualValues,
} from "./session-inputs";

/** The Ghost value of each cell, by field; `null` or absent means there is none. */
export type Ghosts = Partial<Record<GhostField, number | null>>;

export type TickValues =
  | { ok: true; values: Partial<ActualValues> }
  | { ok: false; missing: SetField[] };

/**
 * Ticking adopts the Ghost values into empty cells, so one tap logs "same as last time". Returns
 * only the cells to write (a cell that already holds a value is kept as it is), or the required
 * fields that have neither a value nor a Ghost: such a set cannot be ticked. A cell the user
 * cleared to 0 reps counts as empty.
 */
export function tickValues(
  set: SetValues,
  ghosts: Ghosts,
  fields: readonly SetField[],
): TickValues {
  const values: Partial<ActualValues> = {};
  const missing: SetField[] = [];
  for (const field of fields) {
    if (fieldHasValue(field, set[SET_VALUE_KEYS[field]])) continue;
    const ghost = ghosts[field];
    if (ghost !== null && ghost !== undefined && fieldHasValue(field, ghost)) {
      values[SET_VALUE_KEYS[field]] = ghost;
    } else {
      missing.push(field);
    }
  }
  if (missing.length > 0) return { ok: false, missing };
  // Effort is never required; its Ghost is adopted only on reps types and only into an empty cell.
  const effort = actualValuesSchema.shape.rpe.safeParse(ghosts.rpe ?? null);
  if (
    fields.includes("reps") &&
    (set.rpe ?? null) === null &&
    effort.success &&
    effort.data !== null
  ) {
    values.rpe = effort.data;
  }
  return { ok: true, values };
}
