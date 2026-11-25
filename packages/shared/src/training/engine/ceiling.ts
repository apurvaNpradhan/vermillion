import type { Equipment } from "../../exercise/vocabulary";

/** The next load may be this much heavier than the last before reps are extended first. */
export const BIG_JUMP_SHARE = 0.1;
/** Room for rounding: a jump of exactly 10% (25 to 27.5) is not big. */
const JUMP_EPSILON = 1e-6;

/** Bars take plates, so a load is as fine as the plates the lifter has: there, a jump is no reason to wait. */
const PLATE_LOADED: readonly Equipment[] = ["barbell", "ez_bar", "trap_bar", "smith_machine"];

/**
 * Whether `next` is a big jump from `base`: more than about 10% heavier (dumbbells, stacks). Never
 * on a plate-loaded bar, whose next load is a pair of plates, however light the bar.
 */
export const isBigJump = (base: number, next: number, equipment?: Equipment) =>
  base > 0 &&
  !(equipment !== undefined && PLATE_LOADED.includes(equipment)) &&
  next > base * (1 + BIG_JUMP_SHARE) + JUMP_EPSILON;

/** At the cap, reps keep growing past the range's top up to this multiple of it, rounded. */
export const cappedRepCeiling = (maxReps: number) => Math.round(maxReps * 1.5);
