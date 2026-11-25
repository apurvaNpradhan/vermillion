import { describe, expect, it } from "vitest";
import { suggestionContext } from "./suggestion-context";

import { loadGridOf } from "./load-grid";
import { incrementFor, suggestNext, type ProgressionSession } from "./progression";
import { KG_PER_LB, parseWeight } from "../vocabulary/format";
import type { LoggedSet } from "../logging/logged-set";
import type { PlannedSet } from "../plans/planned-sets";

const NOW = new Date("2026-11-16T12:00:00Z");
const settings = { weightUnit: "kg", weightIncrementKg: null } as const;
const plan: PlannedSet[] = [0, 1].map(() => ({ kind: "working", reps_min: 8, reps_max: 12 }));
const logged = (reps: number, weight = 80, extra: Partial<LoggedSet> = {}): LoggedSet => ({
  id: "s",
  exercise_id: "e",
  exercise_type: "weight_reps",
  kind: "working",
  completed_at: "2026-11-01",
  reps,
  weight_kg: weight,
  ...extra,
});
const session = (sets: LoggedSet[], started_at = "2026-11-13T10:00:00Z"): ProgressionSession => ({
  started_at,
  sets,
});
const suggest = (
  last: LoggedSet[],
  older: LoggedSet[] = [],
  targets = plan,
  context: Parameters<typeof suggestNext>[5] = { now: NOW },
  progressionPerSet = false,
) =>
  suggestNext(
    targets,
    [session(last), ...(older.length ? [session(older, "2026-11-10T10:00:00Z")] : [])],
    "weight_reps",
    "barbell",
    { ...settings, progressionPerSet },
    context,
  );

describe("double progression", () => {
  it("requires history and an eligible type", () => {
    expect(suggest([])).toBeNull();
    for (const type of [
      "duration",
      "distance_duration",
      "short_distance_weight",
      "bodyweight_assisted_reps",
    ] as const)
      expect(
        suggestNext(plan, [session([logged(12)])], type, "none", settings, { now: NOW }),
      ).toBeNull();
  });

  it("returns null when the plan has no set that progresses", () => {
    expect(suggest([logged(12)], [], [{ kind: "warmup" }, { kind: "drop" }])).toBeNull();
  });

  it("adds load on a set that topped its range and drops to the bottom of the range", () => {
    expect(suggest([logged(12), logged(13)])).toMatchObject({
      reason: "add_weight",
      sets: [
        { weightKg: 82.5, reps: 8 },
        { weightKg: 82.5, reps: 8 },
      ],
      incrementKg: 2.5,
    });
  });

  it.each([
    { weightUnit: "kg", before: 60, expected: 62.5 },
    { weightUnit: "lb", before: 135, expected: 140 },
  ] as const)(
    "lets a new working slot follow the others in $weightUnit",
    ({ weightUnit, before, expected }) => {
      const targets = [...plan, ...plan];
      const weight = parseWeight(String(before), weightUnit) ?? 0;
      const history = [session(targets.slice(1).map(() => logged(12, weight)))];
      const settings = { weightUnit, weightIncrementKg: null };
      const next = (sets: PlannedSet[]) =>
        suggestNext(sets, history, "weight_reps", "barbell", settings, { now: NOW });
      expect(next(targets)?.sets).toEqual(
        targets.map(() => ({ weightKg: parseWeight(String(expected), weightUnit), reps: 8 })),
      );
      expect(next(targets)?.sets.slice(0, -1)).toEqual(next(targets.slice(1))?.sets);
    },
  );

  it.each([
    { weightUnit: "kg", before: 10, expected: 15 },
    { weightUnit: "lb", before: 25, expected: 35 },
  ] as const)(
    "doubles the next rack step at the dumbbell boundary in $weightUnit",
    ({ weightUnit, before, expected }) => {
      const grid = loadGridOf({ equipment: "dumbbell", unit: weightUnit });
      const weight = parseWeight(String(before), weightUnit) ?? 0;
      const result = suggestNext(
        plan.slice(0, 1),
        [session([logged(12, weight, { rpe: 7 })])],
        "weight_reps",
        "dumbbell",
        { ...settings, weightUnit },
        { now: NOW, grid },
      );
      expect(result).toMatchObject({
        reason: "add_weight",
        sets: [{ weightKg: parseWeight(String(expected), weightUnit), reps: 8 }],
      });
    },
  );

  it.each([
    { weightUnit: "kg", cap: 100.15, atCap: 100 },
    { weightUnit: "lb", cap: 100, atCap: 99.79 },
  ] as const)(
    "adds reps at the highest rounded load under the cap in $weightUnit",
    ({ weightUnit, cap, atCap }) => {
      const grid = loadGridOf({
        equipment: "machine",
        unit: weightUnit,
        ranges: [{ min: 0, max: cap, step: null }],
      });
      const result = suggestNext(
        plan.slice(0, 1),
        [session([logged(12, atCap)])],
        "weight_reps",
        "machine",
        { ...settings, weightUnit },
        { now: NOW, grid },
      );
      expect(result).toMatchObject({ reason: "cap_reps", sets: [{ weightKg: atCap, reps: 13 }] });
    },
  );

  it.each([9.5, 10])("holds a set below the ceiling at RPE %s", (rpe) => {
    expect(suggest([logged(10, 80, { rpe })], [], plan.slice(0, 1))).toMatchObject({
      reason: "hold_effort",
      sets: [{ weightKg: 80, reps: 10 }],
    });
  });

  it("holds working-set load until every working set reaches the ceiling", () => {
    expect(suggest([logged(12), logged(10, 70)])).toMatchObject({
      reason: "add_rep",
      sets: [
        { weightKg: 80, reps: 12 },
        { weightKg: 70, reps: 11 },
      ],
    });
    expect(suggest([logged(12, 80, { rpe: 9.5 }), logged(12)])?.reason).toBe("hold_effort");
  });

  it("can progress sets independently when per-set progression is enabled", () => {
    const next = suggest([logged(12), logged(10, 70)], [], plan, { now: NOW }, true);
    expect(next?.reason).toBe("add_weight");
    expect(next?.sets).toEqual([
      { weightKg: 82.5, reps: 8 },
      { weightKg: 70, reps: 11 },
    ]);
  });

  it("copies the nearest previous working set for a set it had no counterpart for", () => {
    expect(suggest([logged(12)])?.sets).toEqual([
      { weightKg: 82.5, reps: 8 },
      { weightKg: 82.5, reps: 8 },
    ]);
    expect(suggest([logged(10)])?.sets).toEqual([
      { weightKg: 80, reps: 11 },
      { weightKg: 80, reps: 11 },
    ]);
  });

  it("raises the added load of a weighted bodyweight exercise like a weight", () => {
    const pull = (reps: number): LoggedSet => ({
      ...logged(reps, 20),
      exercise_type: "bodyweight_weighted_reps",
    });
    const next = suggestNext(
      plan,
      [session([pull(12), pull(12)])],
      "bodyweight_weighted_reps",
      "other",
      settings,
      { now: NOW },
    );
    expect(next?.reason).toBe("add_weight");
    expect(next?.sets[0]?.weightKg).toBe(21);
  });

  it("adds reps only below the cap and never reduces a logged weight", () => {
    expect(suggest([logged(10), logged(11, 70)])?.sets).toEqual([
      { weightKg: 80, reps: 11 },
      { weightKg: 70, reps: 12 },
    ]);
  });

  it("holds after two sessions that missed the range, even on different working sets", () => {
    expect(suggest([logged(7), logged(12)], [logged(10), logged(6)])).toMatchObject({
      reason: "hold_missed",
      sets: [
        { weightKg: 80, reps: 7 },
        { weightKg: 80, reps: 12 },
      ],
    });
    // Only one session missed: sets can still add reps.
    expect(suggest([logged(7), logged(12)], [logged(10), logged(10)])?.reason).toBe("add_rep");
    expect(suggest([logged(7), logged(11)], [logged(10), logged(10)])?.reason).toBe("add_rep");
  });

  it("ignores warm-ups and drops, matching sets by kind", () => {
    const targets: PlannedSet[] = [{ kind: "warmup" }, ...plan, { kind: "drop" }];
    expect(
      suggest(
        [{ ...logged(1), kind: "warmup" }, logged(12), logged(12), { ...logged(1), kind: "drop" }],
        [],
        targets,
      )?.sets,
    ).toEqual([null, { weightKg: 82.5, reps: 8 }, { weightKg: 82.5, reps: 8 }, null]);
    expect(suggest([{ ...logged(12), completed_at: null }])).toBeNull();
  });

  it("keeps last values without a planned range, including mixed prescriptions", () => {
    expect(suggest([logged(6)], [], [{ kind: "working" }])).toMatchObject({
      reason: "same_as_last",
      sets: [{ weightKg: 80, reps: 6 }],
    });
    expect(
      suggest([logged(6), logged(10)], [], [{ kind: "working" }, plan[0]!])?.sets[0]?.reps,
    ).toBe(6);
  });

  it("uses the lower bound as the cap when no upper bound exists", () => {
    expect(suggest([logged(8)], [], [{ kind: "working", reps_min: 8 }])?.reason).toBe("add_weight");
  });

  it("adds a rep past the range once reps-only sets top it, without external weight", () => {
    for (const type of ["reps_only", "bodyweight_reps"] as const) {
      expect(
        suggestNext(plan, [session([logged(12), logged(12)])], type, "none", settings, {
          now: NOW,
        }),
      ).toMatchObject({
        reason: "add_rep",
        sets: [
          { weightKg: 80, reps: 13 },
          { weightKg: 80, reps: 13 },
        ],
      });
      expect(
        suggestNext(plan, [session([logged(12), logged(10)])], type, "none", settings, {
          now: NOW,
        }),
      ).toMatchObject({
        sets: [
          { weightKg: 80, reps: 12 },
          { weightKg: 80, reps: 11 },
        ],
      });
    }
  });

  it("treats weights that show the same in pounds as one load, and suggests a typed weight", () => {
    const lb = { weightUnit: "lb", weightIncrementKg: null } as const;
    const ghost = 140 * KG_PER_LB;
    const typed = parseWeight("140", "lb") ?? 0;
    const result = suggestNext(
      plan,
      [session([logged(12, ghost), logged(12, typed)])],
      "weight_reps",
      "barbell",
      lb,
      { now: NOW },
    );
    expect(result?.reason).toBe("add_weight");
    expect(result?.sets[0]?.weightKg).toBe(parseWeight("145", "lb"));
    expect(result?.sets[1]?.weightKg).toBe(parseWeight("145", "lb"));
  });
});

describe("top and back-off sets", () => {
  const targets: PlannedSet[] = [
    { kind: "top", reps_min: 3, reps_max: 5 },
    { kind: "backoff", reps_min: 8, reps_max: 10 },
    { kind: "backoff", reps_min: 8, reps_max: 10 },
  ];
  it("progress against their own previous counterparts", () => {
    const next = suggest(
      [
        logged(5, 100, { kind: "top" }),
        logged(9, 80, { kind: "backoff" }),
        logged(10, 80, { kind: "backoff" }),
      ],
      [],
      targets,
    );
    expect(next?.sets).toEqual([
      { weightKg: 102.5, reps: 3 },
      { weightKg: 80, reps: 10 },
      { weightKg: 82.5, reps: 8 },
    ]);
  });

  it("honour the prescription when last time had none of their kind", () => {
    // A heavy working set is not a base for a newly prescribed back-off set.
    const backoff: PlannedSet[] = [{ kind: "backoff", reps_min: 3, reps_max: 5, weight_kg: 60 }];
    const next = suggest([logged(12, 100), logged(12, 100)], [], backoff);
    expect(next?.sets).toEqual([null]);
    const mixed = suggest(
      [logged(12, 100), logged(5, 80, { kind: "backoff" })],
      [],
      [{ kind: "working", reps_min: 8, reps_max: 12 }, ...backoff],
    );
    expect(mixed?.sets[1]).toEqual({ weightKg: 82.5, reps: 3 });
  });
});

describe("effort-aware progression", () => {
  it("holds load and reps once more after topping the range at a grind", () => {
    const next = suggest([logged(12, 80, { rpe: 9.5 }), logged(12, 80, { rpe: 10 })]);
    expect(next).toMatchObject({
      reason: "hold_effort",
      sets: [
        { weightKg: 80, reps: 12 },
        { weightKg: 80, reps: 12 },
      ],
    });
  });

  it("adds two increments after topping the range easily", () => {
    const next = suggest([logged(12, 80, { rpe: 7 }), logged(12, 80, { rpe: 6.5 })]);
    expect(next?.reason).toBe("add_weight");
    expect(next?.sets[0]).toEqual({ weightKg: 85, reps: 8 });
    expect(next?.incrementKg).toBe(5);
  });

  it("adds one increment at a normal effort and when no effort is logged", () => {
    expect(suggest([logged(12, 80, { rpe: 8.5 }), logged(12)])?.sets[0]).toEqual({
      weightKg: 82.5,
      reps: 8,
    });
    expect(suggest([logged(12), logged(12)])?.sets[0]).toEqual({ weightKg: 82.5, reps: 8 });
  });

  it("holds after missing the minimum at a grind on two sessions running", () => {
    const grind = (reps: number) => logged(reps, 80, { rpe: 10 });
    expect(suggest([grind(7), grind(9)], [grind(6), grind(9)])?.reason).toBe("hold_missed");
  });

  it("does not hold when the missed sessions were not hard", () => {
    const easy = (reps: number) => logged(reps, 80, { rpe: 8 });
    expect(suggest([easy(7), easy(9)], [easy(6), easy(9)])?.reason).toBe("add_rep");
  });
});

describe("straight sets", () => {
  it("add one increment, chosen by the hardest set, to every set at the same load", () => {
    const next = suggest([logged(12, 80, { rpe: 7 }), logged(12, 80, { rpe: 8 })]);
    expect(next?.sets).toEqual([
      { weightKg: 82.5, reps: 8 },
      { weightKg: 82.5, reps: 8 },
    ]);
  });

  it("double the increment only when every set at that load was easy", () => {
    const next = suggest([logged(12, 80, { rpe: 7 }), logged(12, 80, { rpe: 6.5 })]);
    expect(next?.sets.map((set) => set?.weightKg)).toEqual([85, 85]);
  });

  it("keep independent increases under the per-set option", () => {
    const next = suggest(
      [logged(12, 80, { rpe: 7 }), logged(12, 80, { rpe: 8 })],
      [],
      plan,
      { now: NOW },
      true,
    );
    expect(next?.sets.map((set) => set?.weightKg)).toEqual([85, 82.5]);
  });
});

describe("increment sized to the lift", () => {
  const inc = (
    kg: number | null,
    equipment: Parameters<typeof incrementFor>[1],
    unit: "kg" | "lb" = "kg",
  ) => incrementFor(kg, equipment, { weightUnit: unit, weightIncrementKg: null });

  it("is about 2.5% of the load, rounded to the equipment's step and never below it", () => {
    expect(inc(60, "barbell")).toBe(2.5);
    expect(inc(100, "barbell")).toBe(2.5);
    expect(inc(140, "barbell")).toBe(2.5);
    expect(inc(200, "barbell")).toBe(5);
    expect(inc(300, "barbell")).toBe(7.5);
    expect(inc(5, "dumbbell")).toBe(1);
    expect(inc(20, "dumbbell")).toBe(2.5);
    expect(inc(60, "dumbbell")).toBe(2.5);
    expect(inc(100, "machine")).toBe(3);
    expect(inc(40, "kettlebell")).toBe(2);
    expect(inc(null, "barbell")).toBe(2.5);
  });

  it("uses plate steps for pounds and survives the display round trip", () => {
    expect(inc(140 * KG_PER_LB, "barbell", "lb")).toBeCloseTo(5 * KG_PER_LB, 6);
    expect(inc(15 * KG_PER_LB, "dumbbell", "lb")).toBeCloseTo(2.5 * KG_PER_LB, 6);
    expect(inc(45 * KG_PER_LB, "dumbbell", "lb")).toBeCloseTo(5 * KG_PER_LB, 6);
    const next = suggestNext(
      plan,
      [session([logged(12, 100 * KG_PER_LB), logged(12, 100 * KG_PER_LB)])],
      "weight_reps",
      "dumbbell",
      { weightUnit: "lb", weightIncrementKg: null },
      { now: NOW },
    );
    expect(next?.sets[0]?.weightKg).toBe(parseWeight("105", "lb"));
  });

  it("a manual increment always wins", () => {
    expect(incrementFor(300, "barbell", { weightUnit: "kg", weightIncrementKg: 1.25 })).toBe(1.25);
    const next = suggestNext(
      plan,
      [session([logged(12, 80), logged(12, 80)])],
      "weight_reps",
      "barbell",
      { weightUnit: "kg", weightIncrementKg: 1.25 },
      { now: NOW },
    );
    expect(next?.sets[0]?.weightKg).toBe(81.25);
    expect(next?.incrementKg).toBe(1.25);
  });

  it("adds a larger step to a heavy lift", () => {
    expect(suggest([logged(12, 200), logged(12, 200)])?.sets[0]?.weightKg).toBe(205);
  });
});

describe("back from a break", () => {
  const after = (days: number, options: { type?: "weight_reps" | "reps_only" } = {}) =>
    suggestNext(
      plan,
      [
        session(
          [logged(12, 100), logged(10, 100)],
          new Date(NOW.getTime() - days * 86_400_000).toISOString(),
        ),
      ],
      options.type ?? "weight_reps",
      "barbell",
      settings,
      { now: NOW },
    );

  it("under 14 days follows the normal rules", () => {
    expect(after(13)?.reason).toBe("add_rep");
  });

  it("14 to 27 days starts at 90% with last reps at the bottom of the range", () => {
    expect(after(14)).toMatchObject({
      reason: "after_break",
      breakDays: 14,
      sets: [
        { weightKg: 90, reps: 8 },
        { weightKg: 90, reps: 8 },
      ],
    });
    expect(after(27)?.reason).toBe("after_break");
  });

  it("counts the break from the latest Session with a completed working set", () => {
    const warmupOnly = session(
      [logged(5, 40, { kind: "warmup" })],
      new Date(NOW.getTime() - 2 * 86_400_000).toISOString(),
    );
    const trained = session(
      [logged(10, 100), logged(10, 100)],
      new Date(NOW.getTime() - 20 * 86_400_000).toISOString(),
    );
    const next = suggestNext(plan, [warmupOnly, trained], "weight_reps", "barbell", settings, {
      now: NOW,
    });
    expect(next).toMatchObject({ reason: "after_break", breakDays: 20 });
  });

  it("28 days and more starts at 80%", () => {
    expect(after(28)?.sets[0]).toEqual({ weightKg: 80, reps: 8 });
    expect(after(60)?.breakDays).toBe(60);
  });

  it("rounds to the equipment's step", () => {
    const next = suggestNext(
      plan,
      [session([logged(10, 82.5), logged(10, 82.5)], "2026-10-20T10:00:00Z")],
      "weight_reps",
      "barbell",
      settings,
      { now: NOW },
    );
    expect(next?.sets[0]?.weightKg).toBe(75);
  });

  it("leaves bodyweight and reps-only exercises on their normal rules", () => {
    expect(after(30, { type: "reps_only" })?.reason).not.toBe("after_break");
  });

  it("measures the break from the last Session even if it was in a Lighter week", () => {
    const next = suggestNext(
      plan,
      [
        session([logged(8, 60)], "2026-11-14T10:00:00Z"),
        session([logged(12, 100), logged(12, 100)], "2026-10-20T10:00:00Z"),
      ],
      "weight_reps",
      "barbell",
      settings,
      {
        now: NOW,
        lighterWeeks: [{ from: "2026-11-13T00:00:00.000Z", until: "2026-11-20T00:00:00.000Z" }],
      },
    );
    // Active Lighter week: 90% of the pre-deload load, not of the deload Session's 60 kg.
    expect(next?.reason).toBe("deload");
    expect(next?.sets[0]?.weightKg).toBe(90);
  });
});

describe("deload and Lighter weeks", () => {
  it("never raises reps after a grind when the load cannot be lowered", () => {
    const pushups: PlannedSet[] = [{ kind: "working", reps_min: 8, reps_max: 12 }];
    const next = suggestNext(
      pushups,
      [
        session([
          { ...logged(5, 0, { rpe: 10 }), exercise_type: "bodyweight_reps", weight_kg: null },
        ]),
      ],
      "bodyweight_reps",
      "none",
      settings,
      { now: NOW, deload: true },
    );
    expect(next).toMatchObject({ reason: "deload", sets: [{ weightKg: null, reps: 5 }] });
  });

  const history = [session([logged(12, 100), logged(12, 100)])];
  it("suggests 90% at the bottom of the range for the stalled-lift deload", () => {
    const next = suggestNext(plan, history, "weight_reps", "barbell", settings, {
      now: NOW,
      deload: true,
    });
    expect(next).toMatchObject({
      reason: "deload",
      sets: [
        { weightKg: 90, reps: 8 },
        { weightKg: 90, reps: 8 },
      ],
    });
  });

  it("suggests 90% while a Lighter week is active, and the normal rules after it ends", () => {
    const week = { from: "2026-11-14T00:00:00.000Z", until: "2026-11-21T00:00:00.000Z" };
    const during = suggestNext(plan, history, "weight_reps", "barbell", settings, {
      now: NOW,
      lighterWeeks: [week],
    });
    expect(during?.reason).toBe("deload");
    const ended = suggestNext(plan, history, "weight_reps", "barbell", settings, {
      now: new Date("2026-11-22T00:00:00Z"),
      lighterWeeks: [week],
    });
    expect(ended?.reason).toBe("add_weight");
  });

  it("never uses a Lighter-week Session as the baseline", () => {
    const week = { from: "2026-11-09T00:00:00.000Z", until: "2026-11-16T00:00:00.000Z" };
    const next = suggestNext(
      plan,
      [
        session([logged(12, 90), logged(12, 90)], "2026-11-12T10:00:00Z"),
        session([logged(12, 100), logged(12, 100)], "2026-11-05T10:00:00Z"),
      ],
      "weight_reps",
      "barbell",
      settings,
      { now: new Date("2026-11-17T12:00:00Z"), lighterWeeks: [week] },
    );
    expect(next?.reason).toBe("add_weight");
    expect(next?.sets[0]?.weightKg).toBe(102.5);
  });

  it("returns null when only Lighter-week Sessions exist", () => {
    const week = { from: "2026-11-09T00:00:00.000Z", until: "2026-11-16T00:00:00.000Z" };
    expect(
      suggestNext(
        plan,
        [session([logged(12, 90)], "2026-11-12T10:00:00Z")],
        "weight_reps",
        "barbell",
        settings,
        {
          now: new Date("2026-11-17T00:00:00Z"),
          lighterWeeks: [week],
        },
      ),
    ).toBeNull();
  });
});

it.each([
  { unit: "kg", override: "lb", increment: 2.5, before: 100, expected: 105 },
  { unit: "lb", override: "kg", increment: 5, before: 60, expected: 62.5 },
] as const)(
  "uses a nominal $override increment for a $unit preference",
  ({ unit, override, increment, before, expected }) => {
    const kilograms = unit === "kg" ? increment : increment * KG_PER_LB;
    const weight = parseWeight(String(before), override) ?? 0;
    const history = [
      {
        ...session([logged(12, weight)]),
        id: "one",
        finished_at: "2026-11-13T11:00:00Z",
        workoutId: null,
      },
    ];
    const context = suggestionContext(
      history,
      {
        exerciseId: "e",
        type: "weight_reps",
        equipment: "machine",
        unitOverride: override,
        workoutId: null,
        gymId: null,
        grid: null,
        stalls: false,
      },
      {
        unit,
        weightIncrementKg: kilograms,
        weightIncrementUnit: unit,
        previousSource: "same_workout",
        lighterWeeks: [],
        bodyweightKg: null,
        stallMemory: () => ({ dismissed: false, applied: false }),
      },
    );
    const result = suggestNext(
      plan.slice(0, 1),
      history,
      "weight_reps",
      "machine",
      context.settings,
      { now: NOW },
    );
    expect(result?.sets[0]?.weightKg).toBe(parseWeight(String(expected), override));
  },
);
