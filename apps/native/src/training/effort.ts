import { EFFORT_STEPS, type EffortScale, type EffortStep } from "@workspace/shared";

/** A selection on the nine-step control: indexes into {@link EFFORT_STEPS}, low to high effort. */
export type EffortRange = { min: EffortStep; max: EffortStep };

const text = (value: number) => String(value);

/** A step's label in the chosen scale: RPE as stored, RIR as 10 − RPE. */
export function effortLabel(step: EffortStep, scale: EffortScale): string {
  return text(scale === "rpe" ? step : 10 - step);
}

/** "8", "8–9" (RPE) or "1–2" (RIR, where the harder end is the smaller number). */
export function formatEffortRange(min: number, max: number, scale: EffortScale): string {
  const [low, high] = scale === "rpe" ? [min, max] : [10 - max, 10 - min];
  return low === high ? text(low) : `${text(low)}–${text(high)}`;
}

/**
 * The selection after tapping `step`: nothing selected gives a single value; a single value and a
 * different step gives the range between them; a range gives a single value at the step; tapping
 * the only selected step clears it.
 */
export function selectEffort(current: EffortRange | null, step: EffortStep): EffortRange | null {
  if (current === null) return { min: step, max: step };
  if (current.min !== current.max) return { min: step, max: step };
  if (current.min === step) return null;
  return step < current.min ? { min: step, max: current.min } : { min: current.min, max: step };
}

/** Whether the step at `index` is inside the selection. */
export function isEffortSelected(range: EffortRange | null, index: number): boolean {
  const step = EFFORT_STEPS[index];
  return range !== null && step !== undefined && step >= range.min && step <= range.max;
}

/** The selection moved one step (screen readers); a range collapses to its end in that direction. */
export function nudgeEffort(current: EffortRange | null, direction: 1 | -1): EffortRange {
  const edge = current ? (direction === 1 ? current.max : current.min) : undefined;
  const at =
    edge === undefined ? (direction === 1 ? -1 : EFFORT_STEPS.length) : EFFORT_STEPS.indexOf(edge);
  const next = EFFORT_STEPS[Math.min(EFFORT_STEPS.length - 1, Math.max(0, at + direction))] ?? 8;
  return { min: next, max: next };
}
