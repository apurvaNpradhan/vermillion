import type { SessionDetail, SessionExerciseDetail, SessionSetDetail } from "@workspace/sync";

/** A field value: a scalar, or a small nested JSON value (a set's target, an exercise's muscles). */
type Field = string | number | boolean | null | undefined | Fields;
type Fields = Field[] | { [key: string]: Field };

function sameField(a: Field, b: Field): boolean {
  if (Object.is(a, b)) return true;
  return a instanceof Object && b instanceof Object && sameFields(a, b);
}

/** Compares every field except the child collection, whose objects are shared separately. */
function sameFields(a: Fields, b: Fields, skip?: string): boolean {
  const left = Object.entries<Field>(a);
  const right = Object.entries<Field>(b);
  return (
    left.length === right.length &&
    left.every(([key, value], index) => {
      const other = right[index];
      return (
        other !== undefined && other[0] === key && (key === skip || sameField(value, other[1]))
      );
    })
  );
}

/** `after` with every element equal to one in `before` (by id) replaced by that element. */
function shareList<T extends { id: string }>(
  before: T[],
  after: T[],
  share: (old: T | undefined, next: T) => T,
): T[] {
  const byId = new Map(before.map((item) => [item.id, item]));
  let changed = before.length !== after.length;
  const list = after.map((item, index) => {
    const kept = share(byId.get(item.id), item);
    if (kept !== before[index]) changed = true;
    return kept;
  });
  return changed ? list : before;
}

const shareSet = (old: SessionSetDetail | undefined, next: SessionSetDetail) =>
  old && sameFields(old, next) ? old : next;

function shareExercise(
  old: SessionExerciseDetail | undefined,
  next: SessionExerciseDetail,
): SessionExerciseDetail {
  if (!old) return next;
  const sets = shareList(old.sets, next.sets, shareSet);
  if (sets === old.sets && sameFields(old, next, "sets")) return old;
  return { ...next, sets };
}

/**
 * The new Session with every exercise and set that did not change kept as the previous object.
 * A watch emission builds the whole Session afresh, so without this every memoized exercise and
 * set row redraws when one set is ticked or typed into.
 */
export function shareSession(before: SessionDetail | null, after: SessionDetail): SessionDetail {
  if (!before || before.id !== after.id) return after;
  const exercises = shareList(before.exercises, after.exercises, shareExercise);
  if (exercises === before.exercises && sameFields(before, after, "exercises")) return before;
  return { ...after, exercises };
}
