import { z } from "zod";

import {
  SET_FIELDS,
  type Equipment,
  type ExerciseType,
  type SetField,
} from "../../exercise/vocabulary";
import type { PlannedSet } from "../plans/planned-sets";
import { runWeek } from "../plans/cycle";
import { defaultStepKg } from "../progress/progression-steps";
import type { LoadGrid } from "../progress/load-grid";
import { weightAtMost } from "../vocabulary/format";
import {
  EFFORT_STEPS,
  TRAINING_LIMITS,
  type EffortStep,
  type WeightUnit,
} from "../vocabulary/vocabulary";

/**
 * The phase of a training week. Each Program week has one; a phase adjusts a Workout's targets
 * when it is read, never the Workout itself (spec: gyms-phases-train-round, section 4).
 */
export const PHASES = ["build", "push", "test", "deload"] as const;
export type Phase = (typeof PHASES)[number];
export const phaseSchema = z.enum(PHASES);

/** What a phase does to a Workout's targets. */
export const phaseModifiersSchema = z.strictObject({
  /** Multiplies the number of working sets, rounded up, at least one. */
  sets: z.number().min(0.25).max(1.5),
  /** Added to every effort target (RPE; 1 = one RPE harder = one RIR fewer). */
  rpe: z.number().min(-3).max(3),
  /** Multiplies planned loads and the engine's suggested load; never raises one. */
  load: z.number().min(0.5).max(1),
});
export type PhaseModifiers = z.infer<typeof phaseModifiersSchema>;

/** The presets. Build and Push leave loads to the engine; Test and Deload are not baselines. */
export const PHASE_PRESETS = {
  build: { sets: 1, rpe: 0, load: 1 },
  push: { sets: 1, rpe: 1, load: 1 },
  test: { sets: 0.5, rpe: 0, load: 1 },
  deload: { sets: 0.5, rpe: -2, load: 0.9 },
} as const satisfies Record<Phase, PhaseModifiers>;

/** How the one top set of a Test week is done: a heavy single, or as many reps as possible. */
export const TEST_TOPS = ["single", "amrap"] as const;
export type TestTop = (typeof TEST_TOPS)[number];

export const PHASE_PATTERN_MAX = 12;
/** The highest Run week an override or an inserted Deload may name. */
export const PHASE_WEEK_MAX = 520;
export const PHASE_OVERRIDES_MAX = 104;

/**
 * A Program's phases: a repeating pattern ("build, build, build, deload"), optional overrides of
 * single weeks, and optional edits of a phase's modifiers (only the fields given replace the
 * preset). Weeks are the Program's weeks: a Run's calendar weeks, less the Deload weeks inserted
 * into that Run. No plan means no phases.
 */
export const phasePlanSchema = z.strictObject({
  pattern: z.array(phaseSchema).min(1).max(PHASE_PATTERN_MAX),
  overrides: z
    .array(
      z.strictObject({
        week: z.number().int().min(1).max(PHASE_WEEK_MAX),
        phase: phaseSchema,
      }),
    )
    .max(PHASE_OVERRIDES_MAX)
    .default([]),
  modifiers: z
    .strictObject({
      build: phaseModifiersSchema.partial().optional(),
      push: phaseModifiersSchema.partial().optional(),
      test: phaseModifiersSchema.partial().optional(),
      deload: phaseModifiersSchema.partial().optional(),
    })
    .default({}),
  test_top: z.enum(TEST_TOPS).default("single"),
});
export type PhasePlan = z.infer<typeof phasePlanSchema>;
/** What a form or a store writes: the defaults may be left out. */
export type PhasePlanInput = z.input<typeof phasePlanSchema>;

/** The Run weeks that are Deload weeks inserted by "Insert deload now", ascending, no repeats. */
export const insertedDeloadsSchema = z
  .array(z.number().int().min(1).max(PHASE_WEEK_MAX))
  .max(TRAINING_LIMITS.insertedDeloadsMax)
  .refine(
    (weeks) => weeks.every((week, index) => index === 0 || week > (weeks[index - 1] ?? 0)),
    "Weeks must ascend",
  );

/** The modifiers of `phase` in `plan`: the preset with the plan's own edits on top. */
export function modifiersFor(plan: PhasePlan | null, phase: Phase): PhaseModifiers {
  return { ...PHASE_PRESETS[phase], ...plan?.modifiers[phase] };
}

export type PhaseWeek = {
  phase: Phase;
  /** The Run's week, counted in calendar weeks. */
  week: number;
  /** The Program week the phase was read from, after the inserted Deload weeks. */
  programWeek: number;
  /** An inserted Deload week rather than one the plan holds. */
  inserted: boolean;
};

/** The phase of Run week `week`, or null when the plan holds no pattern. */
export function phaseOfWeek(
  plan: PhasePlan | null,
  week: number,
  insertedDeloads: readonly number[] = [],
): PhaseWeek | null {
  if (!plan || plan.pattern.length === 0) return null;
  const clamped = Math.max(1, Math.floor(week));
  const before = insertedDeloads.filter((inserted) => inserted < clamped).length;
  if (insertedDeloads.includes(clamped)) {
    return { phase: "deload", week: clamped, programWeek: clamped - before, inserted: true };
  }
  const programWeek = clamped - before;
  const override = plan.overrides.find((item) => item.week === programWeek);
  const phase = override?.phase ?? plan.pattern[(programWeek - 1) % plan.pattern.length];
  return phase ? { phase, week: clamped, programWeek, inserted: false } : null;
}

export type PhaseNow = PhaseWeek & { modifiers: PhaseModifiers; testTop: TestTop };

/**
 * The phase running at `now` in a Run: the Run's calendar week (seven-day blocks from its first
 * Session, as {@link runWeek}) looked up in the Program's plan and the Run's inserted Deloads.
 * Null without a plan, or without a Run: phases belong to a Run.
 */
export function phaseFor(
  plan: PhasePlan | null,
  run: { started_at: string | null; inserted_deloads: readonly number[] } | null,
  now: Date,
  timezone: string,
): PhaseNow | null {
  if (!plan || !run) return null;
  const found = phaseOfWeek(plan, runWeek(run.started_at, now, timezone), run.inserted_deloads);
  return found && { ...found, modifiers: modifiersFor(plan, found.phase), testTop: plan.test_top };
}

/**
 * "Insert deload now": the current Run week becomes a Deload and every later week shifts by one.
 * Returns the new list of inserted weeks; inserting into a week that is already inserted changes
 * nothing.
 */
export function insertDeload(inserted: readonly number[], week: number): number[] {
  const at = Math.max(1, Math.floor(week));
  return inserted.includes(at) ? [...inserted] : [...inserted, at].sort((a, b) => a - b);
}

/** Sessions of these phases are never a baseline for progression, stalls or Ghost loads. */
export const isBaselinePhase = (phase: Phase | null | undefined): boolean =>
  phase !== "test" && phase !== "deload";

/** The Workout's main lift: the chosen entry while it is in the Workout, else the first. */
export function mainEntryOf(
  entryIds: readonly string[],
  chosenId: string | null | undefined,
): string | null {
  if (chosenId != null && entryIds.includes(chosenId)) return chosenId;
  return entryIds[0] ?? null;
}

const EPS = 1e-4;

/** `value` moved by `by` RPE and held to the effort scale (6 to 10 in halves). */
function shiftEffort(value: number, by: number): EffortStep {
  const shifted = value + by;
  return (
    EFFORT_STEPS.find((step) => step >= shifted - EPS) ??
    EFFORT_STEPS[EFFORT_STEPS.length - 1] ??
    10
  );
}

/**
 * `kg` times `factor`, rounded down to a load the gym can make and never above `kg`. With a grid
 * it is the greatest load at or below the product; without one, a multiple of the equipment's
 * smallest step.
 */
export function lowerLoad(
  kg: number,
  factor: number,
  input: { equipment: Equipment; unit: WeightUnit; grid?: LoadGrid | null },
): number {
  if (kg <= 0 || factor >= 1) return kg;
  const target = kg * factor;
  const grid = input.grid && input.grid.source !== "cap" ? input.grid : null;
  let lowered: number;
  if (grid) {
    const nearest = grid.nearest(target);
    lowered = nearest <= target + EPS ? nearest : (grid.below(target + EPS) ?? nearest);
  } else {
    const step = defaultStepKg(input.equipment, input.unit, kg);
    lowered = Math.floor((target + EPS) / step) * step;
  }
  // A load at the bottom of the grid has nowhere lower to go: it stays.
  if (lowered <= 0) return kg;
  return weightAtMost(Math.max(0, Math.min(lowered, kg)), input.unit, kg);
}

export type ApplyPhaseOptions = {
  isMainLift: boolean;
  type: ExerciseType;
  equipment: Equipment;
  unit?: WeightUnit;
  grid?: LoadGrid | null;
  /** The phase's modifiers; the preset when absent. */
  modifiers?: PhaseModifiers;
  /** How a Test week's main lift is done. */
  testTop?: TestTop;
};

/** `count` sets scaled by `factor`: rounded up, at least one, never more than a Workout holds. */
function scaledCount(count: number, factor: number): number {
  if (count === 0) return 0;
  const scaled = Math.ceil(count * factor - EPS);
  return Math.min(TRAINING_LIMITS.setsPerExercise, Math.max(1, scaled));
}

/** The one top set of a Test week's main lift, made from the Workout's first working set. */
function testTopSet(
  working: readonly PlannedSet[],
  testTop: TestTop,
  recordsReps: boolean,
): PlannedSet | null {
  const first = working[0];
  if (!first) return null;
  // The heaviest planned load stays the target of the top set.
  const weights = working.flatMap((set) => (set.weight_kg === undefined ? [] : [set.weight_kg]));
  const top: PlannedSet = { ...first, kind: "top" };
  delete top.effort_min;
  delete top.effort_max;
  if (weights.length > 0) top.weight_kg = Math.max(...weights);
  if (!recordsReps) return top;
  if (testTop === "single") return { ...top, reps_min: 1, reps_max: 1 };
  // As many reps as possible: a failure set, aiming to beat the planned reps.
  return { ...top, kind: "failure" };
}

/**
 * A Workout exercise's Planned sets as `phase` reads them. Warm-ups are never changed. Build is
 * as planned and Push shifts effort targets. Deload scales the working sets, shifts effort
 * and lowers planned loads. Test halves an accessory, and turns the main lift into one top set.
 * Effort shifts act on targets that exist; a load is only ever lowered, to the gym's grid.
 */
export function applyPhase(
  planned: readonly PlannedSet[],
  phase: Phase,
  options: ApplyPhaseOptions,
): PlannedSet[] {
  const modifiers = options.modifiers ?? PHASE_PRESETS[phase];
  const unit = options.unit ?? "kg";
  const working = planned.filter((set) => set.kind !== "warmup");
  let kept: PlannedSet[];
  if (phase === "test" && options.isMainLift) {
    const fields: readonly SetField[] = SET_FIELDS[options.type];
    const top = testTopSet(working, options.testTop ?? "single", fields.includes("reps"));
    kept = top ? [top] : [];
  } else {
    const target = scaledCount(working.length, modifiers.sets);
    kept = working.slice(0, target);
    const last = working[working.length - 1];
    // A factor above one repeats the last set rather than inventing a target.
    while (last && kept.length < target) kept.push({ ...last, kind: last.kind });
  }
  const adjusted = kept.map((set): PlannedSet => {
    const next = { ...set };
    if (modifiers.rpe !== 0 && next.effort_min !== undefined && next.effort_max !== undefined) {
      next.effort_min = shiftEffort(next.effort_min, modifiers.rpe);
      next.effort_max = shiftEffort(next.effort_max, modifiers.rpe);
    }
    if (modifiers.load < 1 && next.weight_kg !== undefined) {
      next.weight_kg = lowerLoad(next.weight_kg, modifiers.load, {
        equipment: options.equipment,
        unit,
        grid: options.grid,
      });
    }
    return next;
  });
  // Warm-ups keep their place at the front, as the Workout order has them.
  return [...planned.filter((set) => set.kind === "warmup"), ...adjusted];
}

/** What a phase changes, for a one-line banner; only the parts that differ from the Workout. */
export type PhaseEffects = {
  /** The sets factor when it is not 1. */
  sets: number | null;
  /** The effort shift (RPE) when not 0. */
  rpe: number | null;
  /** The load as a whole percent when below 100. */
  loadPct: number | null;
  /** How the main lift's one top set is done, in a Test week. */
  top: TestTop | null;
};

export function phaseEffects(
  phase: Phase,
  modifiers: PhaseModifiers,
  testTop: TestTop = "single",
): PhaseEffects {
  return {
    sets: modifiers.sets === 1 ? null : modifiers.sets,
    rpe: modifiers.rpe === 0 ? null : modifiers.rpe,
    loadPct: modifiers.load < 1 ? Math.round(modifiers.load * 100) : null,
    top: phase === "test" ? testTop : null,
  };
}
