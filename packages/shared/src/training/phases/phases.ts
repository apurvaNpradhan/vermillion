import { z } from "zod";

import {
  SET_FIELDS,
  type Equipment,
  type ExerciseType,
  type SetField,
} from "../../exercise/vocabulary";
import type { PlannedSet } from "../plans/planned-sets";
import { runWeek } from "../plans/cycle";
import { lightenLoad } from "../progress/progression-steps";
import { gridFloor, type LoadGrid } from "../progress/load-grid";
import { formatWeight, loadIdentity, parseWeight, weightAtMost } from "../vocabulary/format";
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

/**
 * Whether a lift of `type` is loaded (has a weight that gets heavier), so a Test week can ask for
 * a heavy single and a Deload can lighten it. An assisted lift records its assistance as the
 * weight, so more weight is easier: it has none.
 */
export const hasLoad = (type: ExerciseType): boolean => {
  const fields: readonly SetField[] = SET_FIELDS[type];
  return fields.includes("weight") && type !== "bodyweight_assisted_reps";
};

/** How the one top set of a Test week is done: a heavy single, or as many reps as possible. */
export const TEST_TOPS = ["single", "amrap"] as const;
export type TestTop = (typeof TEST_TOPS)[number];

export const PHASE_PATTERN_MAX = 12;
/** The highest Run week an override or an inserted Deload may name. */
export const PHASE_WEEK_MAX = 520;
export const PHASE_OVERRIDES_MAX = 104;

/** The edits of one phase's modifiers: only the fields given replace the preset. */
const phaseEditsSchema = z
  .object({
    sets: phaseModifiersSchema.shape.sets,
    rpe: phaseModifiersSchema.shape.rpe,
    load: phaseModifiersSchema.shape.load,
  })
  .partial()
  .optional();

/**
 * A Program's phases: a repeating pattern ("build, build, build, deload"), optional overrides of
 * single weeks, and optional edits of a phase's modifiers (only the fields given replace the
 * preset). Weeks are the Program's weeks: a Run's calendar weeks, less the Deload weeks inserted
 * into that Run. No plan means no phases.
 *
 * Keys this build does not know are stripped, not refused, so an older app can still read and
 * edit a Program whose plan a newer app wrote.
 */
export const phasePlanSchema = z.object({
  pattern: z.array(phaseSchema).min(1).max(PHASE_PATTERN_MAX),
  overrides: z
    .array(
      z.object({
        week: z.number().int().min(1).max(PHASE_WEEK_MAX),
        phase: phaseSchema,
      }),
    )
    .max(PHASE_OVERRIDES_MAX)
    .default([]),
  modifiers: z
    .object({
      build: phaseEditsSchema,
      push: phaseEditsSchema,
      test: phaseEditsSchema,
      deload: phaseEditsSchema,
    })
    .default({}),
  test_top: z.enum(TEST_TOPS).default("single"),
});
export type PhasePlan = z.infer<typeof phasePlanSchema>;
/** What a form or a store writes: the defaults may be left out. */
export type PhasePlanInput = z.input<typeof phasePlanSchema>;

/**
 * What a Session keeps of its phase: the modifiers and the Test top set's style as they were when
 * it started, so editing the Program's plan later does not change a Session already begun.
 */
export const phaseSnapshotSchema = z.object({
  sets: phaseModifiersSchema.shape.sets,
  rpe: phaseModifiersSchema.shape.rpe,
  load: phaseModifiersSchema.shape.load,
  test_top: z.enum(TEST_TOPS),
});
export type PhaseSnapshot = z.infer<typeof phaseSnapshotSchema>;

/** What a phase asks of a Workout: its modifiers and how a Test week's top set is done. */
export type PhaseSettings = { modifiers: PhaseModifiers; testTop: TestTop };

/** The snapshot of a phase read from a plan. */
export const snapshotOf = (now: PhaseSettings): PhaseSnapshot => ({
  ...now.modifiers,
  test_top: now.testTop,
});

/**
 * The modifiers and Test top style a Session started in `phase` ran with: its snapshot, else the
 * phase's preset (a Session with no snapshot).
 */
export function snapshotModifiers(
  phase: Phase,
  snapshot: PhaseSnapshot | null | undefined,
): PhaseSettings {
  if (!snapshot) return { modifiers: PHASE_PRESETS[phase], testTop: "single" };
  const { test_top: testTop, ...modifiers } = snapshot;
  return { modifiers, testTop };
}

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

export type PhaseNow = PhaseWeek & PhaseSettings;

/**
 * What a Run with inserted Deload weeks but no plan of its own follows: Build every week, so
 * "Insert deload week" works on a Program that has no phases.
 */
const BUILD_ONLY: PhasePlan = {
  pattern: ["build"],
  overrides: [],
  modifiers: {},
  test_top: "single",
};

/**
 * The phase running at `now` in a Run: the Run's calendar week (seven-day blocks from its first
 * Session, as {@link runWeek}) looked up in the Program's plan and the Run's inserted Deloads.
 * Null without a plan (unless the Run has inserted Deload weeks: the rest is then Build), or
 * without a Run: phases belong to a Run.
 */
export function phaseFor(
  plan: PhasePlan | null,
  run: { started_at: string | null; inserted_deloads: readonly number[] } | null,
  now: Date,
  timezone: string,
): PhaseNow | null {
  if (!run) return null;
  const effective = plan ?? (run.inserted_deloads.length > 0 ? BUILD_ONLY : null);
  if (!effective) return null;
  const found = phaseOfWeek(
    effective,
    runWeek(run.started_at, now, timezone),
    run.inserted_deloads,
  );
  return (
    found && {
      ...found,
      modifiers: modifiersFor(effective, found.phase),
      testTop: effective.test_top,
    }
  );
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

/** The Sessions of `history` that are a baseline (not a Test or Deload), in the same order. */
export const baselineSessions = <Session extends { phase?: Phase | null }>(
  history: readonly Session[],
): Session[] => history.filter((session) => isBaselinePhase(session.phase));

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
 * Scale the load down, above the grid's lowest point and within its physical cap. Without a
 * grid, use the equipment's step and keep the load when there is no lower step.
 */
export function lowerLoad(
  kg: number,
  factor: number,
  input: { equipment: Equipment; unit: WeightUnit; grid?: LoadGrid | null },
): number {
  if (kg <= 0 || factor >= 1) return kg;
  return lightenLoad(kg, factor, input.equipment, input.unit, input.grid ?? null, "down");
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
  /**
   * The load the Test week's top set aims at: what the lifter has recently done (the engine's or
   * the last baseline's heaviest working set), not the Workout's possibly stale plan. Without it
   * the heaviest planned load stays.
   */
  testLoadKg?: number | null;
};

/** `count` sets scaled by `factor`: rounded up, at least one, never more than a Workout holds. */
function scaledCount(count: number, factor: number): number {
  if (count === 0) return 0;
  const scaled = Math.ceil(count * factor - EPS);
  return Math.min(TRAINING_LIMITS.setsPerExercise, Math.max(1, scaled));
}

/**
 * The one top set of a Test week's main lift, made from the Workout's first working set. A lift
 * with no weight to load (bodyweight reps, reps only) has no single to test: it is as many reps
 * as possible.
 */
function testTopSet(
  working: readonly PlannedSet[],
  options: {
    testTop: TestTop;
    fields: readonly SetField[];
    loaded: boolean;
    loadKg: number | null;
  },
): PlannedSet | null {
  const first = working[0];
  if (!first) return null;
  const top: PlannedSet = { ...first, kind: "top" };
  delete top.effort_min;
  delete top.effort_max;
  if (options.loaded) {
    // The load to test: the lifter's own recent best when known, else the heaviest planned.
    const planned = working.flatMap((set) => (set.weight_kg === undefined ? [] : [set.weight_kg]));
    if (options.loadKg !== null) top.weight_kg = options.loadKg;
    else if (planned.length > 0) top.weight_kg = Math.max(...planned);
  }
  if (!options.fields.includes("reps")) return top;
  const single = options.testTop === "single" && options.loaded;
  if (single) return { ...top, reps_min: 1, reps_max: 1 };
  // As many reps as possible: a failure set, aiming to beat the planned reps.
  return { ...top, kind: "failure" };
}

/**
 * A Workout exercise's Planned sets as `phase` reads them. Warm-ups are never changed. Build is
 * as planned and Push shifts effort targets. Deload scales the working sets, shifts effort
 * and lowers planned loads. Test halves an accessory, and turns the main lift into one top set.
 * Effort shifts act on targets that exist. Phase loads respect the gym's loadable floor and cap.
 */
export function applyPhase(
  planned: readonly PlannedSet[],
  phase: Phase,
  options: ApplyPhaseOptions,
): PlannedSet[] {
  const modifiers = options.modifiers ?? PHASE_PRESETS[phase];
  const unit = options.unit ?? "kg";
  const working = planned.filter((set) => set.kind !== "warmup");
  const loaded = hasLoad(options.type);
  let kept: PlannedSet[];
  if (phase === "test" && options.isMainLift) {
    const top = testTopSet(working, {
      testTop: options.testTop ?? "single",
      fields: SET_FIELDS[options.type],
      loaded,
      loadKg: options.testLoadKg ?? null,
    });
    const capKg = options.grid?.capKg ?? null;
    if (top?.weight_kg !== undefined && loaded) {
      // Capped, then snapped down onto the gym's grid so the seed is a load the gym can make.
      const capped = capKg === null ? top.weight_kg : Math.min(top.weight_kg, capKg);
      const grid = options.grid && options.grid.source !== "cap" ? options.grid : null;
      const snapped =
        grid && capped > 0 ? Math.min(gridFloor(grid, capped), capKg ?? Infinity) : capped;
      const shownKg = capKg === null ? null : parseWeight(formatWeight(snapped, unit), unit);
      top.weight_kg =
        capKg !== null && shownKg !== null && loadIdentity(shownKg) > loadIdentity(capKg)
          ? Math.max(Math.min(grid?.nearest(0) ?? 0, capKg), weightAtMost(snapped, unit, capKg))
          : snapped;
    }
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
    if (loaded && modifiers.load < 1 && next.weight_kg !== undefined) {
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
  /** Whether the Workout has effort targets to shift; without any the shift is not shown. */
  hasEffort = true,
): PhaseEffects {
  return {
    sets: modifiers.sets === 1 ? null : modifiers.sets,
    rpe: modifiers.rpe === 0 || !hasEffort ? null : modifiers.rpe,
    loadPct: modifiers.load < 1 ? Math.round(modifiers.load * 100) : null,
    top: phase === "test" ? testTop : null,
  };
}

// ---- Editing a plan: pure steps the Program page applies and stores ----

/** Patterns offered as one tap; the Program page also edits a pattern week by week. */
export const PATTERN_PRESETS = [
  ["build", "build", "build", "deload"],
  ["build", "build", "build", "build", "deload"],
  ["build", "build", "push", "deload"],
  ["build", "build", "build", "push", "deload"],
] as const satisfies readonly (readonly Phase[])[];

/** The plan with a new repeating pattern; the overrides and edits stay. No weeks is no plan. */
export function withPattern(plan: PhasePlan | null, pattern: readonly Phase[]): PhasePlan | null {
  const weeks = pattern.slice(0, PHASE_PATTERN_MAX);
  if (weeks.length === 0) return null;
  return { ...(plan ?? BUILD_ONLY), pattern: [...weeks] };
}

/**
 * The plan with Program week `week` set to `phase`, or back to the pattern with null. An override
 * equal to what the pattern gives is not stored.
 */
export function withWeekPhase(plan: PhasePlan, week: number, phase: Phase | null): PhasePlan {
  const kept = plan.overrides.filter((item) => item.week !== week);
  const patterned = plan.pattern[(week - 1) % plan.pattern.length];
  const overrides =
    phase === null || phase === patterned
      ? kept
      : [...kept, { week, phase }].sort((a, b) => a.week - b.week).slice(-PHASE_OVERRIDES_MAX);
  return { ...plan, overrides };
}

/** The plan with `phase`'s modifiers edited; only what differs from the preset is stored. */
export function withModifiers(
  plan: PhasePlan,
  phase: Phase,
  modifiers: PhaseModifiers | null,
): PhasePlan {
  const preset = PHASE_PRESETS[phase];
  const edits: Partial<PhaseModifiers> = {};
  if (modifiers) {
    if (modifiers.sets !== preset.sets) edits.sets = modifiers.sets;
    if (modifiers.rpe !== preset.rpe) edits.rpe = modifiers.rpe;
    if (modifiers.load !== preset.load) edits.load = modifiers.load;
  }
  const { [phase]: _removed, ...others } = plan.modifiers;
  return {
    ...plan,
    modifiers: Object.keys(edits).length === 0 ? others : { ...others, [phase]: edits },
  };
}

/** Every phase's intensity for the Program page's blocks: Deload lowest, Test tallest. */
export const PHASE_INTENSITY = { deload: 1, build: 2, push: 3, test: 4 } as const satisfies Record<
  Phase,
  number
>;
