/** How one Slot of the Cycle is drawn. */
export type StripState = "done" | "skipped" | "next" | "todo" | "rest";

/** The state of a Slot in the current Cycle. */
export function stripState(
  slot: { id: string; workoutId: string | null },
  progress: {
    trained: ReadonlySet<string>;
    skipped: ReadonlySet<string>;
    next: { id: string } | null;
  },
): StripState {
  if (slot.workoutId === null) return "rest";
  if (progress.skipped.has(slot.id)) return "skipped";
  if (progress.trained.has(slot.id)) return "done";
  return progress.next?.id === slot.id ? "next" : "todo";
}

export const SLOT_STATE_KEYS = {
  done: "run__trained",
  skipped: "run__skipped",
  next: "run__up_next",
  todo: "run__untrained",
  rest: "run__rest_day_state",
} as const;
