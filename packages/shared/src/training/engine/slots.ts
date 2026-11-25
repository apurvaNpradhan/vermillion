import type { LoggedSet } from "../logging/logged-set";
import type { PlannedSet } from "../plans/planned-sets";
import type { SetKind } from "../vocabulary/vocabulary";
import { progresses, type ProgressionReason } from "../progress/progression";

/** At this effort or harder a set was a grind; at the easier one it was easy. */
const GRIND_RPE = 9.5;
const EASY_RPE = 7;
const effortTarget = (set: LoggedSet, current: PlannedSet) =>
  set.target === undefined ? current : set.target;

/** A set clearly harder than its own effort target, or harder than 9.5 when it has none. */
export function wasGrind(set: LoggedSet, current: PlannedSet): boolean {
  const max = effortTarget(set, current)?.effort_max;
  return set.rpe != null && set.rpe >= (max === undefined ? GRIND_RPE : max + 1);
}

/** A set clearly easier than its own effort target, or easier than 7 when it has none. */
export function easySet(set: LoggedSet, current: PlannedSet): boolean {
  const min = effortTarget(set, current)?.effort_min;
  return set.rpe != null && set.rpe <= (min === undefined ? EASY_RPE : min - 2);
}

export type Slot = { index: number; target: PlannedSet; ordinal: number };

/** The planned sets that progress, with their position among sets of their own kind. */
export function slotsOf(planned: readonly PlannedSet[]): Slot[] {
  const seen = new Map<SetKind, number>();
  return planned.flatMap((target, index): Slot[] => {
    const ordinal = seen.get(target.kind) ?? 0;
    seen.set(target.kind, ordinal + 1);
    return progresses(target.kind) ? [{ index, target, ordinal }] : [];
  });
}

/** The actual set at each missed range minimum. New slots are not misses. */
export function rangeMisses(
  slots: readonly Slot[],
  setFor: (index: number) => LoggedSet | undefined,
) {
  return slots.flatMap(({ target, index }) => {
    const set = setFor(index);
    return target.reps_min !== undefined &&
      set?.reps != null &&
      set.reps < target.reps_min &&
      (set.rpe == null || wasGrind(set, target))
      ? [{ index, set, minimum: target.reps_min, reps: set.reps }]
      : [];
  });
}

export type Outcome =
  | "capped"
  | "add_weight"
  | "add_rep"
  | "cap_reps"
  | "cap_hint"
  | "reset"
  | "hold_missed"
  | "hold_together"
  | "hold_effort"
  | "same";
export const OUTCOME_ORDER = [
  "capped",
  "reset",
  "add_weight",
  "add_rep",
  "cap_reps",
  "hold_effort",
  "cap_hint",
  "hold_missed",
  "hold_together",
  "same",
] as const;
export const REASON_OF = {
  capped: "capped",
  cap_reps: "cap_reps",
  cap_hint: "cap_hint",
  add_weight: "add_weight",
  add_rep: "add_rep",
  hold_effort: "hold_effort",
  reset: "reset",
  hold_missed: "hold_missed",
  hold_together: "hold_together",
  same: "same_as_last",
} as const satisfies Record<Outcome, ProgressionReason>;
