import type { DayMarkState } from "@/platform/ui/day-mark";

/** How one Slot of the Cycle is drawn. */
export type StripState = DayMarkState;

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

/**
 * The mark of a calendar day on Home's week strip, in the same set as the Cycle strip: trained is
 * done, the planned day is next, any other day carries no mark.
 */
export function homeDayState(
  day: number,
  week: { trained: ReadonlySet<number>; planned: number | null },
): StripState | null {
  if (week.trained.has(day)) return "done";
  return week.planned === day ? "next" : null;
}

export const SLOT_STATE_KEYS = {
  done: "run__trained",
  skipped: "run__skipped",
  next: "run__up_next",
  todo: "run__untrained",
  rest: "run__rest_day_state",
} as const;

/**
 * The screen-reader label of a Slot: "Day 3, Upper A, Up next". A rest day names itself once
 * ("Day 3, Rest day"), not as both title and state.
 */
export function slotLabel(
  t: (
    key: "run__slot_state" | "run__slot_rest",
    values: { [name: string]: string | number },
  ) => string,
  { day, state, title }: { day: number; state: StripState; title: string },
  stateText: string,
): string {
  if (state === "rest") return t("run__slot_rest", { day });
  return t("run__slot_state", { day, title, state: stateText });
}
