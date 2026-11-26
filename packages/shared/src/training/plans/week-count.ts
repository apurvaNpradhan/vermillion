/**
 * Where a Rotation slot stands among the Workouts, for "Week 3 · Workout 2": the 1-based place of
 * `slotId` counting only slots that hold a Workout, so rest days never take a number. 0 when the
 * slot is not in the Rotation or is a rest day.
 */
export function workoutNumber(
  slots: readonly { id: string; workoutId: string | null }[],
  slotId: string | null | undefined,
): number {
  let count = 0;
  for (const slot of slots) {
    if (slot.workoutId === null) continue;
    count += 1;
    if (slot.id === slotId) return count;
  }
  return 0;
}
