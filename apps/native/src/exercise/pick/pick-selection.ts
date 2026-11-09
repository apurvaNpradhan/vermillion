/** What a caller asks the picker for. */
export type PickOptions = {
  /** At most this many exercises. 1 means replace: tapping another swaps the choice. */
  max?: number;
  /** Exercises already in the workout; they cannot be picked. */
  exclude?: readonly string[];
};

/** Whether `id` may be picked at all (not excluded). Archived is decided by the row. */
export function isPickable(id: string, options: PickOptions): boolean {
  return !(options.exclude ?? []).includes(id);
}

/**
 * The selection after tapping `id`, in the order picked. A selected exercise is removed (the ones
 * after it move up); an excluded one is ignored; with `max` 1 it replaces the choice; with a
 * larger `max` a tap past it changes nothing.
 */
export function toggleSelection(
  selected: readonly string[],
  id: string,
  options: PickOptions,
): readonly string[] {
  if (selected.includes(id)) return selected.filter((other) => other !== id);
  if (!isPickable(id, options)) return selected;
  const max = options.max;
  if (max !== undefined && max <= 1) return [id];
  if (max !== undefined && selected.length >= max) return selected;
  return [...selected, id];
}

/** Adds `id` unless it is selected already (for an exercise created from inside the picker). */
export function withSelected(
  selected: readonly string[],
  id: string,
  options: PickOptions,
): readonly string[] {
  return selected.includes(id) ? selected : toggleSelection(selected, id, options);
}

/** Each selected id with its 1-based position, for the order badges. */
export function selectionOrder(selected: readonly string[]): ReadonlyMap<string, number> {
  return new Map(selected.map((id, index) => [id, index + 1]));
}
