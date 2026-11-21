import type { Ghosts, LoggedSet } from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";

/** One exercise's Previous and Ghost lookups, with a key that changes only when they would. */
export type RowLookups = {
  key: string;
  previousOf: (setId: string) => LoggedSet | null;
  ghostsFor: (setId: string) => Ghosts;
};

/**
 * Per-exercise lookups that keep their identity while what they return is unchanged. The whole
 * Session's lookups are rebuilt on every write, so a memoized exercise given them directly would
 * redraw whenever any set anywhere was ticked or typed into.
 */
export function nextRowLookups(
  before: ReadonlyMap<string, RowLookups>,
  exercises: readonly SessionExerciseDetail[],
  previousOf: (setId: string) => LoggedSet | null,
  ghostsFor: (setId: string) => Ghosts,
): Map<string, RowLookups> {
  const next = new Map<string, RowLookups>();
  for (const exercise of exercises) {
    const rows = new Map(
      exercise.sets.map((set) => [
        set.id,
        { previous: previousOf(set.id), ghosts: ghostsFor(set.id) },
      ]),
    );
    const key = JSON.stringify([...rows]);
    const old = before.get(exercise.id);
    next.set(
      exercise.id,
      old?.key === key
        ? old
        : {
            key,
            previousOf: (setId) => rows.get(setId)?.previous ?? null,
            ghostsFor: (setId) => rows.get(setId)?.ghosts ?? {},
          },
    );
  }
  return next;
}

/** `after` with each value equal to the one `before` held for its key kept as that object. */
export function shareMapValues<K, V>(before: Map<K, V>, after: Map<K, V>): Map<K, V> {
  let changed = before.size !== after.size;
  for (const [key, value] of after) {
    const old = before.get(key);
    if (old !== undefined && JSON.stringify(old) === JSON.stringify(value)) after.set(key, old);
    else changed = true;
  }
  return changed ? after : before;
}
