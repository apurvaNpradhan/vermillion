/** The next load may be this much heavier than the last before reps are extended first. */
export const BIG_JUMP_SHARE = 0.1;
/** Room for rounding: a jump of exactly 10% (25 to 27.5) is not big. */
const JUMP_EPSILON = 1e-6;

/** Whether `next` is a big jump from `base`: more than about 10% heavier (dumbbells, stacks). */
export const isBigJump = (base: number, next: number) =>
  base > 0 && next > base * (1 + BIG_JUMP_SHARE) + JUMP_EPSILON;

/** At the cap, reps keep growing past the range's top up to this multiple of it, rounded. */
export const cappedRepCeiling = (maxReps: number) => Math.round(maxReps * 1.5);
