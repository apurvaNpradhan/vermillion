import { describe, expect, it } from "vitest";

import type { LoggedSet } from "../logging/logged-set";
import type { PlannedSet } from "../plans/planned-sets";
import { loadGridOf } from "../progress/load-grid";
import { suggestNext, type ProgressionSession } from "../progress/progression";
import { stalledSessions } from "../progress/stalled-lift";
import {
  PHASE_PRESETS,
  applyPhase,
  insertDeload,
  insertedDeloadsSchema,
  isBaselinePhase,
  mainEntryOf,
  modifiersFor,
  phaseEffects,
  phaseFor,
  phaseOfWeek,
  phasePlanSchema,
  type Phase,
  type PhasePlan,
  type PhasePlanInput,
} from "./phases";

const plan = (input: Partial<PhasePlan> & Pick<PhasePlan, "pattern">): PhasePlan =>
  phasePlanSchema.parse(input);
const threeOne = plan({ pattern: ["build", "build", "build", "deload"] });

describe("phaseOfWeek", () => {
  it.each<[string, PhasePlan | null, number, number[], Phase | null]>([
    ["no plan is no phases", null, 1, [], null],
    ["week 1 of the pattern", threeOne, 1, [], "build"],
    ["week 3", threeOne, 3, [], "build"],
    ["week 4 is the deload", threeOne, 4, [], "deload"],
    ["the pattern repeats", threeOne, 5, [], "build"],
    ["and again", threeOne, 8, [], "deload"],
    ["a single-phase pattern", plan({ pattern: ["push"] }), 9, [], "push"],
    [
      "an override wins over the pattern",
      plan({ pattern: ["build"], overrides: [{ week: 2, phase: "test" }] }),
      2,
      [],
      "test",
    ],
    [
      "an override leaves other weeks alone",
      plan({ pattern: ["build"], overrides: [{ week: 2, phase: "test" }] }),
      3,
      [],
      "build",
    ],
    ["an inserted week is a deload", threeOne, 2, [2], "deload"],
    // Week 2 was inserted: Program week 2 (build) is now Run week 3, week 4 holds Program week 3...
    ["later weeks shift by one", threeOne, 3, [2], "build"],
    ["the deload of the plan shifts too", threeOne, 5, [2], "deload"],
    ["two insertions shift by two", threeOne, 5, [2, 3], "build"],
    ["a week before the insertion is unchanged", threeOne, 1, [3], "build"],
    [
      "overrides name Program weeks, so they shift with the insertion",
      plan({ pattern: ["build"], overrides: [{ week: 3, phase: "test" }] }),
      4,
      [2],
      "test",
    ],
    ["week 0 reads as week 1", threeOne, 0, [], "build"],
  ])("%s", (_name, input, week, inserted, expected) => {
    expect(phaseOfWeek(input, week, inserted)?.phase ?? null).toBe(expected);
  });

  it("says whether a week is an inserted deload, and which Program week it holds", () => {
    expect(phaseOfWeek(threeOne, 2, [2])).toMatchObject({ inserted: true, programWeek: 2 });
    expect(phaseOfWeek(threeOne, 3, [2])).toMatchObject({ inserted: false, programWeek: 2 });
  });
});

describe("phaseFor", () => {
  const start = "2026-11-02T10:00:00Z"; // a Monday
  it.each([
    ["the day of the first Session", "2026-11-02T20:00:00Z", 1, "build"],
    ["day seven is still week 1", "2026-11-08T12:00:00Z", 1, "build"],
    ["day eight starts week 2", "2026-11-09T12:00:00Z", 2, "build"],
    ["week 4", "2026-11-23T12:00:00Z", 4, "deload"],
    ["week 5 repeats the pattern", "2026-11-30T12:00:00Z", 5, "build"],
  ])("%s", (_name, now, week, phase) => {
    const found = phaseFor(
      threeOne,
      { started_at: start, inserted_deloads: [] },
      new Date(now),
      "UTC",
    );
    expect(found).toMatchObject({ week, phase });
  });

  it("starts at week 1 before the Run's first Session", () => {
    expect(
      phaseFor(threeOne, { started_at: null, inserted_deloads: [] }, new Date(), "UTC"),
    ).toMatchObject({ week: 1, phase: "build" });
  });

  it("is null without a plan or without a Run", () => {
    const run = { started_at: start, inserted_deloads: [] };
    expect(phaseFor(null, run, new Date(), "UTC")).toBeNull();
    expect(phaseFor(threeOne, null, new Date(), "UTC")).toBeNull();
  });

  it("carries the plan's edited modifiers and the Test top set", () => {
    const edited = plan({
      pattern: ["deload"],
      modifiers: { deload: { load: 0.8 } },
      test_top: "amrap",
    });
    const found = phaseFor(
      edited,
      { started_at: start, inserted_deloads: [] },
      new Date(start),
      "UTC",
    );
    expect(found?.modifiers).toEqual({ sets: 0.5, rpe: -2, load: 0.8 });
    expect(found?.testTop).toBe("amrap");
  });
});

describe("insertDeload", () => {
  it.each<[number[], number, number[]]>([
    [[], 5, [5]],
    [[2], 5, [2, 5]],
    [[5], 5, [5]],
    [[5], 3, [3, 5]],
  ])("%j at week %i gives %j", (inserted, week, expected) => {
    expect(insertDeload(inserted, week)).toEqual(expected);
  });

  it("inserting now makes the week a deload and shifts the rest", () => {
    const run = { started_at: "2026-11-02T10:00:00Z", inserted_deloads: insertDeload([], 2) };
    expect(phaseOfWeek(threeOne, 2, run.inserted_deloads)?.phase).toBe("deload");
    // The week that would have been week 2 is now week 3; the plan's deload moves from 4 to 5.
    expect(phaseOfWeek(threeOne, 4, run.inserted_deloads)?.phase).toBe("build");
    expect(phaseOfWeek(threeOne, 5, run.inserted_deloads)?.phase).toBe("deload");
  });

  it("only accepts ascending weeks", () => {
    expect(insertedDeloadsSchema.safeParse([2, 5]).success).toBe(true);
    expect(insertedDeloadsSchema.safeParse([5, 2]).success).toBe(false);
    expect(insertedDeloadsSchema.safeParse([2, 2]).success).toBe(false);
  });
});

describe("modifiersFor", () => {
  it("is the preset, with the plan's edits over it", () => {
    expect(modifiersFor(null, "deload")).toEqual(PHASE_PRESETS.deload);
    const edited = plan({ pattern: ["build"], modifiers: { push: { rpe: 0.5 } } });
    expect(modifiersFor(edited, "push")).toEqual({ sets: 1, rpe: 0.5, load: 1 });
    expect(modifiersFor(edited, "build")).toEqual(PHASE_PRESETS.build);
  });
});

describe("phasePlanSchema", () => {
  it("fills the defaults and refuses an empty or unknown pattern", () => {
    expect(phasePlanSchema.parse({ pattern: ["build"] })).toEqual({
      pattern: ["build"],
      overrides: [],
      modifiers: {},
      test_top: "single",
    });
    expect(phasePlanSchema.safeParse({ pattern: [] }).success).toBe(false);
    expect(phasePlanSchema.safeParse({ pattern: ["rest"] }).success).toBe(false);
    expect(phasePlanSchema.safeParse({ pattern: ["build"], extra: 1 }).success).toBe(false);
  });

  it("bounds the modifiers", () => {
    const bad = (modifiers: PhasePlanInput["modifiers"]) =>
      phasePlanSchema.safeParse({ pattern: ["build"], modifiers });
    expect(bad({ deload: { load: 1.2 } }).success).toBe(false);
    expect(bad({ deload: { load: 0.2 } }).success).toBe(false);
    expect(bad({ push: { rpe: 4 } }).success).toBe(false);
    expect(bad({ test: { sets: 0 } }).success).toBe(false);
    expect(bad({ deload: { load: 0.85, sets: 0.5, rpe: -2 } }).success).toBe(true);
  });
});

const working = (count: number, extra: Partial<PlannedSet> = {}): PlannedSet[] =>
  Array.from({ length: count }, () => ({ kind: "working", reps_min: 8, reps_max: 10, ...extra }));
const base = { type: "weight_reps", equipment: "barbell" } as const;

describe("applyPhase", () => {
  it.each<[string, Phase, number, number]>([
    ["build keeps every set", "build", 4, 4],
    ["push keeps every set", "push", 4, 4],
    ["deload halves four sets", "deload", 4, 2],
    ["deload rounds up three sets to two", "deload", 3, 2],
    ["deload keeps one set", "deload", 1, 1],
    ["deload of five sets is three", "deload", 5, 3],
    ["test halves an accessory", "test", 4, 2],
  ])("%s", (_name, phase, count, expected) => {
    const out = applyPhase(working(count), phase, { ...base, isMainLift: false });
    expect(out).toHaveLength(expected);
  });

  it("leaves a Workout as planned in Build", () => {
    const sets = [
      { kind: "warmup" } as const,
      ...working(3, { weight_kg: 80, effort_min: 7, effort_max: 8 }),
    ];
    expect(applyPhase(sets, "build", { ...base, isMainLift: true })).toEqual(sets);
  });

  it("never touches warm-ups, and keeps them in front", () => {
    const sets: PlannedSet[] = [
      { kind: "warmup", weight_kg: 40 },
      ...working(4, { weight_kg: 80 }),
    ];
    const out = applyPhase(sets, "deload", { ...base, isMainLift: false });
    expect(out[0]).toEqual({ kind: "warmup", weight_kg: 40 });
    expect(out).toHaveLength(3);
  });

  it("drops the last working sets first", () => {
    const sets: PlannedSet[] = [
      { kind: "top", reps_min: 5, reps_max: 5 },
      { kind: "backoff", reps_min: 8, reps_max: 8 },
      { kind: "backoff", reps_min: 8, reps_max: 8 },
    ];
    expect(applyPhase(sets, "deload", { ...base, isMainLift: false }).map((s) => s.kind)).toEqual([
      "top",
      "backoff",
    ]);
  });

  it.each<[string, Phase, number, number, number, number]>([
    ["push raises the effort a step", "push", 7, 8, 8, 9],
    ["deload lowers it by two", "deload", 8, 9, 6, 7],
  ])("%s", (_name, phase, min, max, shiftedMin, shiftedMax) => {
    const out = applyPhase(working(2, { effort_min: min, effort_max: max }), phase, {
      ...base,
      isMainLift: false,
    });
    expect(out[0]).toMatchObject({ effort_min: shiftedMin, effort_max: shiftedMax });
  });

  it("holds effort to the 6 to 10 scale", () => {
    expect(
      applyPhase(working(1, { effort_min: 9, effort_max: 10 }), "push", {
        ...base,
        isMainLift: false,
      })[0],
    ).toMatchObject({ effort_min: 10, effort_max: 10 });
    expect(
      applyPhase(working(1, { effort_min: 6, effort_max: 7 }), "deload", {
        ...base,
        isMainLift: false,
      })[0],
    ).toMatchObject({ effort_min: 6, effort_max: 6 });
  });

  it("does not invent an effort target", () => {
    expect(
      applyPhase(working(2), "push", { ...base, isMainLift: false })[0]?.effort_min,
    ).toBeUndefined();
  });

  it("applies a plan's edited modifiers", () => {
    const out = applyPhase(working(4, { weight_kg: 100 }), "deload", {
      ...base,
      isMainLift: false,
      modifiers: { sets: 0.75, rpe: -1, load: 0.8 },
    });
    expect(out).toHaveLength(3);
    expect(out[0]?.weight_kg).toBe(80);
  });

  describe("deload load", () => {
    it.each<[number, number]>([
      [100, 90],
      [102.5, 90], // 92.25 rounds down to the 2.5 kg step
      [60, 52.5], // 54 -> 52.5
      [20, 17.5], // 18 -> 17.5
      [2.5, 2.5], // never above the original, never below zero
    ])("%d kg becomes %d kg on a barbell", (kg, expected) => {
      const out = applyPhase(working(2, { weight_kg: kg }), "deload", {
        ...base,
        isMainLift: false,
      });
      expect(out[0]?.weight_kg).toBe(expected);
    });

    it("snaps down to the gym's grid, never up", () => {
      const grid = loadGridOf({
        equipment: "machine",
        unit: "kg",
        ranges: [{ min: 5, max: 90, step: 5 }],
      });
      // 0.9 x 57.5 = 51.75: the nearest stack pin is 50, the next one down.
      const lowered = applyPhase(working(2, { weight_kg: 57.5 }), "deload", {
        type: "weight_reps",
        equipment: "machine",
        isMainLift: false,
        grid,
      });
      expect(lowered[0]?.weight_kg).toBe(50);
      // 0.9 x 55 = 49.5: nearest is 50, which is above it, so it goes down to 45.
      const down = applyPhase(working(2, { weight_kg: 55 }), "deload", {
        type: "weight_reps",
        equipment: "machine",
        isMainLift: false,
        grid,
      });
      expect(down[0]?.weight_kg).toBe(45);
    });

    it("never raises a load", () => {
      for (const kg of [1, 2.5, 5, 7.5, 10, 22.5, 47.5, 100, 142.5]) {
        const out = applyPhase(working(1, { weight_kg: kg }), "deload", {
          ...base,
          isMainLift: false,
        });
        expect(out[0]?.weight_kg ?? 0).toBeLessThanOrEqual(kg);
      }
    });
  });

  describe("test week", () => {
    const sets: PlannedSet[] = [
      { kind: "warmup", weight_kg: 40 },
      ...working(4, { weight_kg: 100, effort_min: 8, effort_max: 9 }),
    ];
    it("turns the main lift into one heavy single", () => {
      const out = applyPhase(sets, "test", { ...base, isMainLift: true });
      expect(out).toEqual([
        { kind: "warmup", weight_kg: 40 },
        { kind: "top", reps_min: 1, reps_max: 1, weight_kg: 100 },
      ]);
    });

    it("or one set to failure when the plan says AMRAP", () => {
      const out = applyPhase(sets, "test", { ...base, isMainLift: true, testTop: "amrap" });
      expect(out).toEqual([
        { kind: "warmup", weight_kg: 40 },
        { kind: "failure", reps_min: 8, reps_max: 10, weight_kg: 100 },
      ]);
    });

    it("keeps a duration lift's target and just makes it the top set", () => {
      const out = applyPhase([{ kind: "working", duration_s: 60 }], "test", {
        type: "duration",
        equipment: "none",
        isMainLift: true,
      });
      expect(out).toEqual([{ kind: "top", duration_s: 60 }]);
    });

    it("leaves accessories at half the sets, loads and effort as planned", () => {
      const out = applyPhase(working(4, { weight_kg: 30, effort_min: 8, effort_max: 8 }), "test", {
        ...base,
        isMainLift: false,
      });
      expect(out).toHaveLength(2);
      expect(out[0]).toMatchObject({ weight_kg: 30, effort_min: 8 });
    });

    it("keeps a Workout with no working sets as it is", () => {
      expect(applyPhase([], "test", { ...base, isMainLift: true })).toEqual([]);
    });
  });

  it("never leaves an exercise without a working set", () => {
    for (const phase of ["build", "push", "test", "deload"] as const)
      for (const main of [true, false])
        expect(
          applyPhase(working(1), phase, { ...base, isMainLift: main }).some(
            (s) => s.kind !== "warmup",
          ),
        ).toBe(true);
  });

  it("repeats the last set when a plan raises the sets", () => {
    const out = applyPhase(working(2, { weight_kg: 50 }), "push", {
      ...base,
      isMainLift: false,
      modifiers: { sets: 1.5, rpe: 0, load: 1 },
    });
    expect(out).toHaveLength(3);
    expect(out[2]).toEqual(out[1]);
  });
});

describe("mainEntryOf", () => {
  it.each<[string[], string | null, string | null]>([
    [["a", "b", "c"], null, "a"],
    [["a", "b", "c"], "c", "c"],
    [["a", "b", "c"], "gone", "a"],
    [[], "a", null],
  ])("%j with %s is %s", (ids, chosen, expected) => {
    expect(mainEntryOf(ids, chosen)).toBe(expected);
  });
});

describe("phaseEffects", () => {
  it("names only what a phase changes", () => {
    expect(phaseEffects("build", PHASE_PRESETS.build)).toEqual({
      sets: null,
      rpe: null,
      loadPct: null,
      top: null,
    });
    expect(phaseEffects("deload", PHASE_PRESETS.deload)).toEqual({
      sets: 0.5,
      rpe: -2,
      loadPct: 90,
      top: null,
    });
    expect(phaseEffects("test", PHASE_PRESETS.test, "amrap").top).toBe("amrap");
    expect(phaseEffects("push", PHASE_PRESETS.push).rpe).toBe(1);
  });
});

describe("baseline exclusion", () => {
  it.each<[Phase | null | undefined, boolean]>([
    [null, true],
    [undefined, true],
    ["build", true],
    ["push", true],
    ["test", false],
    ["deload", false],
  ])("a %s Session is a baseline: %s", (phase, baseline) => {
    expect(isBaselinePhase(phase)).toBe(baseline);
  });

  const NOW = new Date("2026-11-16T12:00:00Z");
  const settings = { weightUnit: "kg", weightIncrementKg: null } as const;
  const target: PlannedSet[] = [0, 1].map(() => ({ kind: "working", reps_min: 8, reps_max: 12 }));
  const set = (reps: number, weight: number): LoggedSet => ({
    id: "s",
    exercise_id: "e",
    exercise_type: "weight_reps",
    kind: "working",
    completed_at: "2026-11-01",
    reps,
    weight_kg: weight,
  });
  const sessionOf = (
    started_at: string,
    reps: number,
    weight: number,
    phase: Phase | null,
  ): ProgressionSession => ({ started_at, phase, sets: [set(reps, weight), set(reps, weight)] });
  const suggest = (history: ProgressionSession[], phaseLoad?: number) =>
    suggestNext(target, history, "weight_reps", "barbell", settings, { now: NOW, phaseLoad });

  it.each<[Phase, boolean]>([
    ["build", true],
    ["push", true],
    ["test", false],
    ["deload", false],
  ])("a %s Session is read as the baseline: %s", (phase, read) => {
    const older = sessionOf("2026-11-06T10:00:00Z", 12, 100, "build");
    const latest = sessionOf("2026-11-13T10:00:00Z", 12, 60, phase);
    const result = suggest([latest, older]);
    // Read: 60 kg x 12 tops the range, so 62.5 kg. Skipped: the build Session's 100 kg adds 2.5.
    expect(result?.sets[0]?.weightKg).toBe(read ? 62.5 : 102.5);
  });

  it("has no suggestion when every Session was a test or a deload", () => {
    expect(suggest([sessionOf("2026-11-13T10:00:00Z", 12, 60, "deload")])).toBeNull();
  });

  it("suggests the phase's load share of the last baseline load, snapped down", () => {
    const history = [sessionOf("2026-11-13T10:00:00Z", 10, 100, "build")];
    const result = suggest(history, 0.9);
    expect(result).toMatchObject({ reason: "deload" });
    expect(result?.sets[0]?.weightKg).toBe(90);
    expect(result?.sets[0]?.reps).toBe(8);
  });

  it("a load share of 1 changes nothing", () => {
    const history = [sessionOf("2026-11-13T10:00:00Z", 10, 100, "build")];
    expect(suggest(history, 1)?.reason).not.toBe("deload");
  });

  it("test and deload Sessions do not count towards a stall", () => {
    const flat = (day: number, phase: Phase | null, weight = 100) => ({
      started_at: `2026-11-${String(day).padStart(2, "0")}T10:00:00Z`,
      phase,
      sets: [set(8, weight)],
    });
    const build = [flat(13, "build"), flat(10, "build"), flat(7, "build"), flat(4, "build")];
    expect(stalledSessions(build, "weight_reps")).toBe(3);
    // A heavy Test Session would break the stall if it counted; it is left out, like a Deload.
    expect(stalledSessions([flat(14, "test", 140), ...build], "weight_reps")).toBe(3);
    expect(stalledSessions([flat(14, "deload", 140), ...build], "weight_reps")).toBe(3);
    expect(stalledSessions([flat(14, "push", 140), ...build], "weight_reps")).toBe(0);
  });
});
