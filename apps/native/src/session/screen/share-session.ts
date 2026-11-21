import type { SessionDetail, SessionExerciseDetail, SessionSetDetail } from "@workspace/sync";

/** Rows hold plain JSON values written in a fixed key order, so their text compares them. */
const sameJson = <T>(a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);

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
  old && sameJson(old, next) ? old : next;

function shareExercise(
  old: SessionExerciseDetail | undefined,
  next: SessionExerciseDetail,
): SessionExerciseDetail {
  if (!old) return next;
  const sets = shareList(old.sets, next.sets, shareSet);
  if (sets === old.sets && sameJson({ ...old, sets: [] }, { ...next, sets: [] })) return old;
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
  if (
    exercises === before.exercises &&
    sameJson({ ...before, exercises: [] }, { ...after, exercises: [] })
  )
    return before;
  return { ...after, exercises };
}
