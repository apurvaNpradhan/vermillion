import { PHASE_INTENSITY, phaseOfWeek, type Phase, type PhasePlan } from "@workspace/shared";

/** The most weeks the strip draws: a year, and the Deload weeks a Run may have inserted. */
const STRIP_WEEKS_MAX = 104;
/** An open-ended Program shows at least this many weeks. */
const STRIP_WEEKS_MIN = 12;
/** How many weeks past the current one an open-ended strip keeps drawing. */
const LOOKAHEAD = 4;

export type StripBlock = {
  /** The Run's week, counted in calendar weeks. */
  week: number;
  /** The Program week it holds: what a tap edits. Inserted Deload weeks hold none of their own. */
  programWeek: number;
  phase: Phase;
  /** An inserted Deload week: set by "Insert deload now", not editable here. */
  inserted: boolean;
  state: "past" | "current" | "future";
  /** The block's height as a share of the tallest block (a Test week), 0.25 to 1. */
  height: number;
};

/**
 * The weeks of a Program as blocks, each as tall as its phase is hard: Deload lowest, Test
 * tallest. With a planned length that many weeks (and one more per inserted Deload); open-ended,
 * at least twelve and a few past the current week. `currentWeek` is null when the Program has no
 * Run, so no block is current.
 */
export function stripBlocks(input: {
  plan: PhasePlan;
  insertedDeloads: readonly number[];
  currentWeek: number | null;
  plannedWeeks: number | null;
}): StripBlock[] {
  const { plan, insertedDeloads, currentWeek, plannedWeeks } = input;
  const base =
    plannedWeeks === null
      ? Math.max(STRIP_WEEKS_MIN, plan.pattern.length * 2, (currentWeek ?? 0) + LOOKAHEAD)
      : plannedWeeks + insertedDeloads.length;
  const count = Math.min(STRIP_WEEKS_MAX, Math.max(base, currentWeek ?? 0));
  const tallest = Math.max(...Object.values(PHASE_INTENSITY));
  return Array.from({ length: count }, (_, index) => {
    const week = index + 1;
    const found = phaseOfWeek(plan, week, insertedDeloads);
    // The plan has a pattern, so a week always has a phase.
    const phase = found?.phase ?? "build";
    return {
      week,
      programWeek: found?.programWeek ?? week,
      phase,
      inserted: found?.inserted ?? false,
      state:
        currentWeek === null || week > currentWeek
          ? "future"
          : week === currentWeek
            ? "current"
            : "past",
      height: PHASE_INTENSITY[phase] / tallest,
    };
  });
}
