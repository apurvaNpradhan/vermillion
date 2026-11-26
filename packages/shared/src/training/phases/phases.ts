import { z } from "zod";

import {
  SET_FIELDS,
  type Equipment,
  type ExerciseType,
  type SetField,
} from "../../exercise/vocabulary";
import type { PlannedSet } from "../plans/planned-sets";
import { runWeek, type RunPause } from "../plans/cycle";
import { calendarDay } from "../plans/week";
import { defaultStepKg, lightenLoad, loadable } from "../progress/progression-steps";
import type { LoadGrid } from "../progress/load-grid";
import { loadIdentity, weightAtMost } from "../vocabulary/format";
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
 * preset). Overrides name Program weeks. An inserted Deload consumes the next planned Deload
 * within one pattern length: the pattern goes on from the week after it. With none in reach, it
 * only replaces the current week. No plan means no phases.
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
  test_workups: z.boolean().optional(),
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
  test_entry_id: z.uuid().optional(),
  test_workup_ids: z.array(z.uuid()).max(2).optional(),
  load_cuts: z.tuple([z.number().max(100), z.number().max(100)]).optional(),
});
export type PhaseSnapshot = z.infer<typeof phaseSnapshotSchema>;

/** What a phase asks of a Workout: its modifiers and how a Test week's top set is done. */
export type PhaseSettings = { modifiers: PhaseModifiers; testTop: TestTop; testWorkups?: boolean };

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
  const {
    test_top: testTop,
    load_cuts: _loadCuts,
    test_entry_id: _testEntry,
    test_workup_ids: _testWorkups,
    ...modifiers
  } = snapshot;
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
  const overrides = new Map(plan.overrides.map(({ week, phase }) => [week, phase]));
  let offset = 0;
  // The pattern is read at the Program week, so the week an override names and the phase it shows
  // are the same week, whatever was inserted before it.
  const phaseAt = (runWeek: number) =>
    overrides.get(runWeek + offset) ?? plan.pattern[(runWeek + offset - 1) % plan.pattern.length];
  for (const inserted of insertedDeloads) {
    if (inserted > clamped) break;
    if (inserted === clamped)
      return { phase: "deload", week: clamped, programWeek: clamped + offset, inserted: true };
    // Take the place of the next planned Deload, within one pattern length: the pattern goes on
    // from the week after it. With none in reach, the insert only changes its own week.
    const bound = inserted + plan.pattern.length;
    for (let scheduled = inserted; scheduled < bound; scheduled += 1) {
      if (phaseAt(scheduled) !== "deload") continue;
      offset += scheduled - inserted;
      break;
    }
  }
  const programWeek = clamped + offset;
  const phase = phaseAt(clamped);
  return phase ? { phase, week: clamped, programWeek, inserted: false } : null;
}

export type PhaseNow = PhaseWeek & PhaseSettings;

const DAY_MS = 86_400_000;
/** Calendar days without a counted Session after which a Test week is read as Build. */
const TEST_SKIP_DAYS = 14;

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
  run: {
    started_at: string | null;
    inserted_deloads: readonly number[];
    pauses?: readonly RunPause[];
  } | null,
  now: Date,
  timezone: string,
  trainedAt: readonly string[] = [],
): PhaseNow | null {
  if (!run) return null;
  const effective = plan ?? (run.inserted_deloads.length > 0 ? BUILD_ONLY : null);
  if (!effective) return null;
  const week = runWeek(run.started_at, now, timezone, run.pauses);
  const found = phaseOfWeek(effective, week, run.inserted_deloads);
  if (found?.phase === "test") {
    // A Test week after a break of fourteen calendar days (in the lifter's zone, so the time of day
    // never decides) is a Build week: a heavy single is not asked of someone back from time off.
    const nowMs = now.getTime();
    let after = calendarDay(now, timezone);
    for (const before of trainedAt
      .flatMap((value) => {
        const at = Date.parse(value);
        return at < nowMs ? [at] : [];
      })
      .sort((a, b) => b - a)) {
      const day = calendarDay(new Date(before), timezone);
      if (after - day >= TEST_SKIP_DAYS * DAY_MS) {
        found.phase = "build";
        break;
      }
      if (runWeek(run.started_at, new Date(before), timezone, run.pauses) !== week) break;
      after = day;
    }
  }
  return (
    found && {
      ...found,
      modifiers: modifiersFor(effective, found.phase),
      testTop: effective.test_top,
      ...(effective.test_workups ? { testWorkups: true } : {}),
    }
  );
}

/**
 * "Insert deload now": replace the next planned Deload and restart the pattern after this week.
 * Returns the new list of inserted weeks; inserting into a week that is already inserted changes
 * nothing.
 */
export function insertDeload(inserted: readonly number[], week: number): number[] {
  const at = Math.max(1, Math.floor(week));
  return inserted.includes(at) ? [...inserted] : [...inserted, at].sort((a, b) => a - b);
}

/** "Undo deload": the inserted Deload weeks without `week`. */
export function removeInsertedDeload(inserted: readonly number[], week: number): number[] {
  return inserted.filter((item) => item !== week);
}

/** What the Undo rule reads of a counted Session of the Run: when it started and its phase. */
export type RunSessionPhase = { started_at: string; phase: Phase | null | undefined };

type UndoRun = {
  started_at: string | null;
  inserted_deloads: readonly number[];
  pauses?: readonly RunPause[];
};

/**
 * Whether a counted Session of the Run was started as a Deload in Run week `week`. A Session keeps
 * the phase it started in, so a Build Session logged before the Deload was inserted does not count:
 * only work done as the Deload makes the insert stick. The one rule behind the Undo on every
 * device and the server's check. Sessions of later weeks are skipped, and the walk stops at the
 * first of an earlier week, so only this week's Sessions are converted to Run weeks.
 */
export function deloadLogged(
  run: Omit<UndoRun, "inserted_deloads">,
  week: number,
  timezone: string,
  sessions: readonly RunSessionPhase[],
): boolean {
  const starts = sessions
    .flatMap(({ started_at, phase }) => (phase === "deload" ? [Date.parse(started_at)] : []))
    .sort((a, b) => b - a);
  for (const at of starts) {
    const found = runWeek(run.started_at, new Date(at), timezone, run.pauses);
    if (found === week) return true;
    if (found < week) return false;
  }
  return false;
}

/**
 * The Run week "Undo deload" may take back, or null. It is the current Run week, it is an inserted
 * Deload, and no counted Session of the Run was started as that Deload ({@link deloadLogged}).
 */
export function undoableDeloadWeek(input: {
  run: UndoRun;
  now: Date;
  timezone: string;
  /** The counted Sessions of the Run with their phases; only the Deload ones are read. */
  sessions: readonly RunSessionPhase[];
}): number | null {
  const { run, now, timezone } = input;
  const week = runWeek(run.started_at, now, timezone, run.pauses);
  if (!run.inserted_deloads.includes(week)) return null;
  return deloadLogged(run, week, timezone, input.sessions) ? null : week;
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
  input: {
    equipment: Equipment;
    unit: WeightUnit;
    grid?: LoadGrid | null;
    type?: ExerciseType;
  },
): number {
  if (kg <= 0 || factor >= 1) return kg;
  return lightenLoad(
    kg,
    factor,
    input.equipment,
    input.unit,
    input.grid ?? null,
    "deload",
    input.type,
  );
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
  testWorkups?: boolean;
  /**
   * The history-derived Test load, before snapping. Without an estimate or logged load, the
   * heaviest planned load stays.
   */
  testLoadKg?: number | null;
};

/** `count` sets scaled by `factor`: rounded up, at least one, never more than a Workout holds. */
export function phaseSetCount(count: number, factor: number): number {
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
  if (single) return { ...top, reps_min: 1, reps_max: 1, effort_min: 8, effort_max: 9 };
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
  const warmups = planned.filter((set) => set.kind === "warmup");
  const testSingle =
    phase === "test" && options.isMainLift && loaded && (options.testTop ?? "single") === "single";
  const snapTest = (kg: number, roundDefault: boolean): number => {
    const cap = options.grid?.capKg ?? Infinity;
    const grid = options.grid?.source === "cap" ? null : options.grid;
    const capped = Math.min(kg, cap);
    const step = defaultStepKg(options.equipment, unit, capped, options.type);
    const snapped =
      grid && capped > 0
        ? grid.nearest(capped)
        : roundDefault && capped > 0
          ? Math.round(capped / step + EPS) * step
          : capped;
    const typed = loadable(snapped, unit);
    if (typed <= cap) return typed;
    return grid && loadIdentity(typed) === loadIdentity(cap)
      ? cap
      : weightAtMost(snapped, unit, cap);
  };
  let kept: PlannedSet[];
  if (phase === "test" && options.isMainLift) {
    const top = testTopSet(working, {
      testTop: options.testTop ?? "single",
      fields: SET_FIELDS[options.type],
      loaded,
      loadKg: options.testLoadKg ?? null,
    });
    if (top?.weight_kg !== undefined && loaded)
      top.weight_kg = snapTest(top.weight_kg, testSingle && options.testLoadKg != null);
    kept = top ? [top] : [];
  } else {
    const target = phaseSetCount(working.length, modifiers.sets);
    kept = working.slice(0, target);
    const last = working[working.length - 1];
    // A factor above one repeats the last set rather than inventing a target.
    while (last && kept.length < target) kept.push({ ...last, kind: last.kind });
  }
  const adjusted = kept.map((set): PlannedSet => {
    const next = { ...set };
    if (
      !testSingle &&
      modifiers.rpe !== 0 &&
      next.effort_min !== undefined &&
      next.effort_max !== undefined
    ) {
      next.effort_min = shiftEffort(next.effort_min, modifiers.rpe);
      next.effort_max = shiftEffort(next.effort_max, modifiers.rpe);
    }
    if (loaded && modifiers.load < 1 && next.weight_kg !== undefined) {
      next.weight_kg = lowerLoad(next.weight_kg, modifiers.load, {
        equipment: options.equipment,
        unit,
        grid: options.grid,
        type: options.type,
      });
    }
    return next;
  });
  const singleLoad = testSingle ? adjusted[0]?.weight_kg : null;
  if (options.testWorkups && singleLoad) {
    let last = Math.max(0, ...warmups.map((set) => set.weight_kg ?? 0));
    for (const share of [0.8, 0.9]) {
      const load = snapTest(singleLoad * share, true);
      if (
        load >= singleLoad ||
        load <= last ||
        warmups.length + adjusted.length >= TRAINING_LIMITS.setsPerExercise
      )
        continue;
      warmups.push({ kind: "warmup", reps_min: 1, reps_max: 1, weight_kg: load });
      last = load;
    }
  }
  return [...warmups, ...adjusted];
}

/** The actual percentage cut after snapping, optionally a range across sets. */
export function loadCutRange(factors: readonly number[]): [number, number] | undefined {
  if (factors.length === 0) return undefined;
  const percent = (factor: number) => Math.round((1 - factor) * 100);
  return [percent(Math.max(...factors)), percent(Math.min(...factors))];
}

export function plannedLoadFactors(before: readonly PlannedSet[], after: readonly PlannedSet[]) {
  const working = before.filter((set) => set.kind !== "warmup");
  return after
    .filter((set) => set.kind !== "warmup")
    .flatMap((set, index) => {
      const original = working[Math.min(index, working.length - 1)]?.weight_kg;
      return original && set.weight_kg !== undefined ? [set.weight_kg / original] : [];
    });
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

/** An empty pattern falls back to Build if the plan still has other settings to keep. */
export function withPattern(plan: PhasePlan | null, pattern: readonly Phase[]): PhasePlan | null {
  const weeks = pattern.slice(0, PHASE_PATTERN_MAX);
  if (weeks.length > 0) return { ...planOrBuild(plan), pattern: weeks };
  if (plan === null) return null;
  const hasSettings =
    plan.overrides.length > 0 ||
    Object.values(plan.modifiers).some((edits) => edits && Object.keys(edits).length > 0) ||
    plan.test_top !== BUILD_ONLY.test_top ||
    plan.test_workups === true;
  return hasSettings ? { ...plan, pattern: ["build"] } : null;
}

/**
 * The plan with one week set to a phase, or back to the pattern with null. With inserted Deloads,
 * the caller supplies the Run week, which may hold a later Program week after a restart.
 */
export function withWeekPhase(
  plan: PhasePlan,
  week: number,
  phase: Phase | null,
  insertedDeloads: readonly number[] = [],
): PhasePlan {
  const target = phaseOfWeek(plan, week, insertedDeloads);
  if (!target || target.inserted || target.programWeek > PHASE_WEEK_MAX) return plan;
  const kept = plan.overrides.filter((item) => item.week !== target.programWeek);
  const patterned = phaseOfWeek({ ...plan, overrides: kept }, week, insertedDeloads)?.phase;
  if (kept.length >= PHASE_OVERRIDES_MAX) return plan;
  const overrides =
    phase === null || phase === patterned
      ? kept
      : [...kept, { week: target.programWeek, phase }].sort((a, b) => a.week - b.week);
  return { ...plan, overrides };
}

/** The plan to show and edit when a Program has none: every week Build. */
export const planOrBuild = (plan: PhasePlan | null): PhasePlan => plan ?? BUILD_ONLY;

/** The pattern with a Build week added at the end; a full pattern stays as it is. */
export function addPatternWeek(pattern: readonly Phase[], phase: Phase = "build"): Phase[] {
  return pattern.length >= PHASE_PATTERN_MAX ? [...pattern] : [...pattern, phase];
}

/** The pattern without its week `index` (0-based); an index outside it changes nothing. */
export function removePatternWeek(pattern: readonly Phase[], index: number): Phase[] {
  return pattern.filter((_, at) => at !== index);
}

/** The pattern with its week `index` (0-based) set to `phase`; an index outside it changes nothing. */
export function setPatternWeek(pattern: readonly Phase[], index: number, phase: Phase): Phase[] {
  return pattern.map((item, at) => (at === index ? phase : item));
}

/** A pattern with its runs folded: Build, Build, Build, Deload as Build ×3, Deload. */
export function patternRuns(pattern: readonly Phase[]): PatternRun[] {
  const runs: PatternRun[] = [];
  for (const phase of pattern) {
    const last = runs[runs.length - 1];
    if (last?.phase === phase) last.count += 1;
    else runs.push({ phase, count: 1 });
  }
  return runs;
}

export type PatternRun = { phase: Phase; count: number };
export type WeeksSummary = { length: number | null; runs: PatternRun[] };

/**
 * What the Weeks row on the Program page says: the planned length (null when open-ended) and the
 * pattern's runs (none when the Program has no phases).
 */
export function weeksSummary(input: {
  plan: PhasePlan | null;
  plannedWeeks: number | null;
}): WeeksSummary {
  return { length: input.plannedWeeks, runs: patternRuns(input.plan?.pattern ?? []) };
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
