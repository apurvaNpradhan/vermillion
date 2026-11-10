/** A Slot as far as the Rotation's summary cares: a Workout (id) or Rest (`null`). */
export type RotationSlot = { id: string; workoutId: string | null };

export type RotationSummary = {
  /** Slots that hold a Workout: the training days of one pass through the Rotation. */
  trainingDays: number;
  restDays: number;
  /** Every Slot: the length of the Rotation in days. */
  rotationDays: number;
  /** The rotation length is worth saying: it differs from the training days only when it rests. */
  showRotation: boolean;
};

/** `4 days · 6-day rotation`: days per pass are derived from the Slots, never stored. */
export function rotationSummary(slots: readonly RotationSlot[]): RotationSummary {
  const trainingDays = slots.filter((slot) => slot.workoutId !== null).length;
  const restDays = slots.length - trainingDays;
  return { trainingDays, restDays, rotationDays: slots.length, showRotation: restDays > 0 };
}

/** How many Slots each Workout fills, for the "×2" badge (only Workouts in more than one). */
export function repeatCounts(slots: readonly RotationSlot[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const slot of slots) {
    if (slot.workoutId !== null) counts.set(slot.workoutId, (counts.get(slot.workoutId) ?? 0) + 1);
  }
  return new Map(counts.entries().filter(([, count]) => count > 1));
}
