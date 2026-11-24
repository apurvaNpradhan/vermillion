import { fieldHasValue, SET_FIELDS, type ExerciseType, type SetField } from "@workspace/shared";

/**
 * Whether an exercise's Previous lookup no longer holds its set up: it has loaded, or it failed.
 * A failed lookup shows no Previous and no Ghost values, but a set whose own cells are filled
 * can still be ticked (the retry banner is the only cost), so the tick must not wait on it.
 */
export function historySettled(input: { loaded: boolean; failed: boolean }): boolean {
  return input.loaded || input.failed;
}

/** Explicit entries can be completed while the lookup runs, without applying provisional ghosts. */
export function hasRequiredSetValues(
  type: ExerciseType,
  valueOf: (field: SetField) => number | null,
): boolean {
  return SET_FIELDS[type].every((field) => fieldHasValue(field, valueOf(field)));
}
