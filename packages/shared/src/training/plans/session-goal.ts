import { TRAINING_LIMITS } from "../vocabulary/vocabulary";

/** A rotation this long or shorter is read as one week: its workout slots are the weekly goal. */
export const GOAL_ROTATION_MAX = 7;

type GoalSlot = { workoutId: string | null };

/** The slots of a rotation that hold a workout; the others are rest days. */
export function trainingSlotCount(slots: readonly GoalSlot[]): number {
  return slots.filter((slot) => slot.workoutId !== null).length;
}

/**
 * The number of Sessions to aim for in a week, or null when there is no goal. In order: the active
 * Program's own `sessionsPerWeek`; the user's "Sessions per week" preference; the Program's
 * workout slots for a rotation of {@link GOAL_ROTATION_MAX} slots or fewer.
 */
export function sessionGoal(
  program: { sessionsPerWeek: number | null; slots: readonly GoalSlot[] } | null,
  preference: number | null,
): number | null {
  const explicit = program?.sessionsPerWeek ?? preference;
  if (explicit !== null) return explicit;
  if (program) {
    const count = trainingSlotCount(program.slots);
    if (program.slots.length <= GOAL_ROTATION_MAX && count > 0) return count;
  }
  return null;
}

/** What the Program editor's stepper shows while the Program has no value of its own. */
export function displayedSessionsPerWeek(
  explicit: number | null,
  slots: readonly GoalSlot[],
): number {
  const { sessionsPerWeekMin: min, sessionsPerWeekMax: max } = TRAINING_LIMITS;
  return Math.min(max, Math.max(min, explicit ?? trainingSlotCount(slots)));
}
