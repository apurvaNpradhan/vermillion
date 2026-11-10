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

/** The selection after a tap: a single step, or none when the only selected step is tapped. */
export function tapEffort(current: EffortRange | null, step: EffortStep): EffortRange | null {
  if (current && current.min === step && current.max === step) return null;
  return { min: step, max: step };
}

/** The selection of a drag from one segment to another, either direction. */
export function dragEffort(fromIndex: number, toIndex: number): EffortRange | null {
  const first = EFFORT_STEPS[Math.min(fromIndex, toIndex)];
  const last = EFFORT_STEPS[Math.max(fromIndex, toIndex)];
  return first === undefined || last === undefined ? null : { min: first, max: last };
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
