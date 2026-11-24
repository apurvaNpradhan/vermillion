/**
 * Timing and content of the welcome screen's live-log vignette. Pure, so the schedule is tested;
 * the functions are worklets because the animated styles call them on the UI thread.
 */

/** The weight steps up by this much from one row to the next (kg). */
export const WEIGHT_STEP = 2.5;
export const START_WEIGHT = 60;
export const ROW_COUNT = 4;
export const REPS = 5;

/** One loop: rows tick in turn, the finished log rests, then it clears. */
export const CYCLE_MS = 7200;
const FIRST_TICK_MS = 1000;
const TICK_GAP_MS = 900;
/** A tick (tint, check, next weight) settles over this long. */
export const RAMP_MS = 260;
/** The finished log holds until here, then everything eases back to empty. */
const CLEAR_START_MS = 6000;
const CLEAR_MS = 500;

/** Where reduced motion rests: every row ticked. */
export const FINAL_MS = CLEAR_START_MS - 1;

/** Weight of row `index` once the row above has ticked: 60, 62.5, 65, 67.5. */
export function weightOf(index: number): number {
  return START_WEIGHT + WEIGHT_STEP * index;
}

/** "60", "62.5": no trailing zero. */
export function formatWeight(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
}

function clamp01(value: number): number {
  "worklet";
  return Math.min(1, Math.max(0, value));
}

/** 0 while row `index` is open, 1 once ticked; eases to 0 again as the loop clears. */
export function tickProgress(index: number, ms: number): number {
  "worklet";
  const start = FIRST_TICK_MS + index * TICK_GAP_MS;
  const rise = clamp01((ms - start) / RAMP_MS);
  const clear = clamp01((ms - CLEAR_START_MS) / CLEAR_MS);
  return rise * (1 - clear);
}

/**
 * 0 while row `index` still shows the weight carried over from the row above, 1 once that row has
 * ticked and this one has stepped up. Row 0 has nothing above it and always reads 1.
 */
export function stepProgress(index: number, ms: number): number {
  "worklet";
  return index === 0 ? 1 : tickProgress(index - 1, ms);
}
