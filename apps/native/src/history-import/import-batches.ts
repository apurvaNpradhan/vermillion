import type { PlannedImportSession } from "@workspace/shared";

/**
 * Splits planned Sessions into write batches of at most `maxSessions` Sessions and about `maxSets`
 * sets (a Session is never split, so a batch holds whole Sessions only).
 */
export function batchSessions(
  sessions: readonly PlannedImportSession[],
  maxSessions: number,
  maxSets: number,
): PlannedImportSession[][] {
  const batches: PlannedImportSession[][] = [];
  let current: PlannedImportSession[] = [];
  let sets = 0;
  for (const session of sessions) {
    const size = session.exercises.reduce((sum, entry) => sum + entry.sets.length, 0);
    if (current.length > 0 && (current.length >= maxSessions || sets + size > maxSets)) {
      batches.push(current);
      current = [];
      sets = 0;
    }
    current.push(session);
    sets += size;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** The sets in planned Sessions. */
export const countSets = (sessions: readonly PlannedImportSession[]): number =>
  sessions.reduce(
    (total, session) =>
      total + session.exercises.reduce((sum, entry) => sum + entry.sets.length, 0),
    0,
  );
