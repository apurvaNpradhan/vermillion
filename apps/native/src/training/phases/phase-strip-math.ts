import {
  PHASE_INTENSITY,
  PHASE_OVERRIDES_MAX,
  phaseOfWeek,
  phaseFor,
  runWeek,
  type Phase,
  type PhasePlan,
} from "@workspace/shared";

/** The most weeks the strip draws at once for a long-running Program. */
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
  /** An inserted Deload week: set by "Deload this week", not editable here. */
  inserted: boolean;
  /** A past Run week with a logged workout. Its displayed phase comes from history. */
  trained: boolean;
  overrideLimit: boolean;
  state: "past" | "current" | "future";
  /** The block's height as a share of the tallest block (a Test week), 0.25 to 1. */
  height: number;
};

/**
 * The weeks of a Program as blocks, each as tall as its phase is hard: Deload lowest, Test
 * tallest. With a planned length that many weeks; open-ended,
 * at least twelve and a few past the current week. `current` is absent when the Program has no
 * Run, so no block is current.
 */
export function stripBlocks(input: {
  plan: PhasePlan;
  current?: {
    run: NonNullable<Parameters<typeof phaseFor>[1]>;
    now: Date;
    timeZone: string;
    trainedAt?: readonly string[];
    history?: readonly { started_at: string; phase: Phase }[];
  };
  plannedWeeks: number | null;
}): StripBlock[] {
  const { plan, current, plannedWeeks } = input;
  const runningPhase = current
    ? phaseFor(plan, current.run, current.now, current.timeZone, current.trainedAt)
    : null;
  const currentWeek = runningPhase?.week ?? null;
  const insertedDeloads = current?.run.inserted_deloads ?? [];
  const base =
    plannedWeeks === null
      ? Math.max(
          STRIP_WEEKS_MIN,
          plan.pattern.length * 2,
          (currentWeek ?? 0) + LOOKAHEAD,
          ...plan.overrides.map(({ week }) => Math.min(week, STRIP_WEEKS_MAX)),
        )
      : plannedWeeks;
  const lastWeek = Math.max(base, currentWeek ?? 0);
  const firstWeek = Math.max(1, lastWeek - STRIP_WEEKS_MAX + 1);
  const trainedPhases = new Map<number, Phase>();
  if (current && currentWeek !== null) {
    // Starts are newest first. If a plan changed midweek, show the phase last trained that week.
    for (const session of current.history ?? []) {
      const week = runWeek(
        current.run.started_at,
        new Date(session.started_at),
        current.timeZone,
        current.run.pauses,
      );
      if (week < firstWeek) break;
      if (week < currentWeek && !trainedPhases.has(week)) trainedPhases.set(week, session.phase);
    }
  }
  const tallest = Math.max(...Object.values(PHASE_INTENSITY));
  return Array.from({ length: lastWeek - firstWeek + 1 }, (_, index) => {
    const week = firstWeek + index;
    const found =
      runningPhase?.week === week ? runningPhase : phaseOfWeek(plan, week, insertedDeloads);
    // The plan has a pattern, so a week always has a phase.
    const trained = trainedPhases.get(week);
    const phase = trained ?? found?.phase ?? "build";
    const programWeek = found?.programWeek ?? week;
    return {
      week,
      programWeek,
      phase,
      inserted: found?.inserted ?? false,
      trained: trained !== undefined,
      overrideLimit:
        plan.overrides.length >= PHASE_OVERRIDES_MAX &&
        !plan.overrides.some((item) => item.week === programWeek),
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
