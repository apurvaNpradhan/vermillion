import { describe, expect, it } from "vitest";

import { HEVY, STRONG_COMMA, STRONG_UNITS } from "./fixtures";
import { createDuplicateFinder, fitSet, planSession, type ExerciseTarget } from "./import-plan";
import {
  createExerciseMatcher,
  inferEquipment,
  inferExerciseType,
  normalizeExerciseName,
  type LibraryEntry,
} from "./match-exercises";
import { parseHistoryCsv, type ImportedSet, type ImportedSession } from "./parse-history";

const set = (overrides: Partial<ImportedSet> = {}): ImportedSet => ({
  kind: "working",
  weight: null,
  reps: null,
  durationS: null,
  distanceM: null,
  rpe: null,
  ...overrides,
});

const entry = (id: string, title: string, overrides: Partial<LibraryEntry> = {}): LibraryEntry => ({
  id,
  title,
  aka: null,
  custom: false,
  exerciseType: "weight_reps",
  ...overrides,
});

function history(text: string) {
  const result = parseHistoryCsv(text);
  if (!result.ok) throw new Error(result.reason);
  return result.history;
}

describe("matching names", () => {
  const library = [
    entry("bench", "Bench Press (Barbell)"),
    entry("squat", "Squat (Barbell)"),
    entry("rdl", "Romanian Deadlift (Barbell)", { aka: "RDL, Stiff Leg Deadlift" }),
    entry("my-curl", "Curl (Dumbbell)", { custom: true }),
    entry("curl", "Curl (Dumbbell)"),
    entry("a", "Cable Row Seated"),
    entry("b", "Seated Cable Row"),
  ];
  const match = createExerciseMatcher(library);

  it("ignores case, punctuation and accents", () => {
    expect(normalizeExerciseName("Bench Press (Barbell)")).toBe("bench press barbell");
    expect(match("bench  press - BARBELL")).toBe("bench");
    expect(normalizeExerciseName("Crème Curl")).toBe("creme curl");
  });

  it("matches an alias", () => {
    expect(match("rdl")).toBe("rdl");
    expect(match("Stiff Leg Deadlift")).toBe("rdl");
  });

  it("matches the words in any order", () => {
    expect(match("Barbell Squat")).toBe("squat");
  });

  it("prefers the user's own exercise over the catalog's", () => {
    expect(match("Curl (Dumbbell)")).toBe("my-curl");
  });

  it("leaves an ambiguous or unknown name for the user", () => {
    expect(match("Row Seated Cable")).toBeNull();
    expect(match("Zercher Squat")).toBeNull();
  });
});

describe("inferring a new exercise", () => {
  it("picks the type from what the sets recorded", () => {
    expect(inferExerciseType([set({ weight: 20, reps: 8 })])).toBe("weight_reps");
    expect(inferExerciseType([set({ weight: 0, reps: 8 })])).toBe("bodyweight_reps");
    expect(inferExerciseType([set({ durationS: 60 })])).toBe("duration");
    expect(inferExerciseType([set({ distanceM: 5000, durationS: 1800 })])).toBe(
      "distance_duration",
    );
    expect(inferExerciseType([set({ distanceM: 40, weight: 50 })])).toBe("short_distance_weight");
  });

  it("reads equipment from the name", () => {
    expect(inferEquipment("Curl (Dumbbell)", "weight_reps")).toBe("dumbbell");
    expect(inferEquipment("Squat (Smith Machine)", "weight_reps")).toBe("smith_machine");
    expect(inferEquipment("Skull Thing", "weight_reps")).toBe("other");
    expect(inferEquipment("Plank", "duration")).toBe("none");
  });
});

describe("fitting a set to a type", () => {
  it("converts pounds and keeps only what the type records", () => {
    expect(fitSet("weight_reps", set({ weight: 135, reps: 5, durationS: 9 }), "lb")).toEqual({
      kind: "working",
      weightKg: 61.235,
      reps: 5,
      durationS: null,
      distanceM: null,
      rpe: null,
    });
  });

  it("treats a missing weight as the bar when the type wants one", () => {
    expect(fitSet("weight_reps", set({ reps: 10 }), "kg")?.weightKg).toBe(0);
  });

  it("drops a weight a bodyweight type does not record, and keeps the effort on reps", () => {
    expect(fitSet("bodyweight_reps", set({ weight: 20, reps: 8, rpe: 9 }), "kg")).toMatchObject({
      weightKg: null,
      reps: 8,
      rpe: 9,
    });
  });

  it("drops a set with nothing to record or out of range", () => {
    expect(fitSet("weight_reps", set({ weight: 60 }), "kg")).toBeNull();
    expect(fitSet("duration", set({ reps: 5 }), "kg")).toBeNull();
    expect(fitSet("weight_reps", set({ weight: 5000, reps: 5 }), "kg")).toBeNull();
    expect(fitSet("floors_duration", set({ durationS: 60 }), "kg")).toBeNull();
  });
});

describe("planning a workout", () => {
  const targets = new Map<string, ExerciseTarget>([
    [
      "bench press (barbell)",
      { exerciseId: "bench", title: "Bench Press (Barbell)", type: "weight_reps" },
    ],
    ["plank", { exerciseId: "plank", title: "Plank", type: "duration" }],
    ["pull up", { exerciseId: "pull", title: "Pull Up", type: "bodyweight_reps" }],
    ["running", { exerciseId: "run", title: "Running", type: "distance_duration" }],
  ]);
  const resolve = (name: string) => targets.get(name.toLowerCase()) ?? null;

  it("plans a Strong workout with its sets fitted", () => {
    const [push] = history(STRONG_COMMA).sessions;
    const outcome = planSession(push as ImportedSession, resolve, "kg", "Workout");
    if (outcome.kind !== "planned") throw new Error(outcome.kind);
    expect(outcome.session.title).toBe("Push Day");
    expect(outcome.session.exercises.map((e) => e.exerciseId)).toEqual(["bench", "plank", "pull"]);
    const bench = outcome.session.exercises[0];
    expect(bench?.sets.map((s) => s.kind)).toEqual(["warmup", "working", "working", "drop"]);
    expect(bench?.logEffort).toBe(true);
    expect(outcome.session.exercises[1]?.sets[0]).toMatchObject({ durationS: 60 });
    expect(outcome.session.durationS).toBe(3900);
    expect(outcome.session.startedAt).toBe(new Date(2026, 2, 2, 18, 30).toISOString());
  });

  it("leaves out exercises with no target and a workout with nothing left", () => {
    const [, run] = history(STRONG_COMMA).sessions;
    const none = planSession(run as ImportedSession, () => null, "kg", "Workout");
    expect(none).toEqual({ kind: "empty" });
  });

  it("leaves out a workout older than ten years", () => {
    const [push] = history(STRONG_COMMA).sessions;
    const old = {
      ...(push as ImportedSession),
      start: { ...(push as ImportedSession).start, year: 2001 },
    };
    expect(planSession(old, resolve, "kg", "Workout")).toEqual({ kind: "out_of_range" });
  });

  it("clears a superset held by one exercise only", () => {
    const [upper] = history(HEVY).sessions;
    const hevyTargets = (name: string): ExerciseTarget | null =>
      name === "Bench Press (Barbell)"
        ? { exerciseId: "bench", title: name, type: "weight_reps" }
        : name === "Bent Over Row (Barbell)"
          ? { exerciseId: "row", title: name, type: "weight_reps" }
          : null;
    const outcome = planSession(upper as ImportedSession, hevyTargets, "kg", "Workout");
    if (outcome.kind !== "planned") throw new Error(outcome.kind);
    expect(outcome.session.exercises.map((e) => e.supersetKey)).toEqual(["0", "0"]);
    const alone = planSession(
      upper as ImportedSession,
      (name) => (name === "Bench Press (Barbell)" ? hevyTargets(name) : null),
      "kg",
      "Workout",
    );
    if (alone.kind !== "planned") throw new Error(alone.kind);
    expect(alone.session.exercises[0]?.supersetKey).toBeNull();
  });

  it("trims past the limits and says how much", () => {
    const [leg] = history(STRONG_UNITS).sessions;
    const many = {
      ...(leg as ImportedSession),
      exercises: [
        {
          name: "Squat (Barbell)",
          note: null,
          supersetKey: null,
          sets: Array.from({ length: 25 }, () => set({ weight: 100, reps: 5 })),
        },
      ],
    };
    const outcome = planSession(
      many,
      () => ({ exerciseId: "squat", title: "Squat", type: "weight_reps" }),
      "kg",
      "Workout",
    );
    if (outcome.kind !== "planned") throw new Error(outcome.kind);
    expect(outcome.trimmed).toBe(5);
    expect(outcome.session.exercises[0]?.sets).toHaveLength(20);
  });

  it("falls back to a title when the file has none", () => {
    const [push] = history(STRONG_COMMA).sessions;
    const outcome = planSession(
      { ...(push as ImportedSession), title: " " },
      resolve,
      "kg",
      "Imported",
    );
    if (outcome.kind !== "planned") throw new Error(outcome.kind);
    expect(outcome.session.title).toBe("Imported");
  });
});

describe("duplicates", () => {
  const planned = (startedAt: string, ids: string[]) => ({
    key: "k",
    title: "t",
    note: null,
    startedAt,
    durationS: null,
    exercises: ids.map((exerciseId) => ({
      exerciseId,
      title: exerciseId,
      type: "weight_reps" as const,
      note: null,
      supersetKey: null,
      logEffort: false,
      sets: [],
    })),
  });
  const find = createDuplicateFinder([
    { startedAt: "2026-03-02T18:30:00.000Z", exerciseIds: ["bench", "squat"] },
  ]);

  it("matches the same exercises within a minute, in any order", () => {
    expect(find(planned("2026-03-02T18:30:45.000Z", ["squat", "bench"]))).toBe(true);
    expect(find(planned("2026-03-02T18:29:00.000Z", ["bench", "squat"]))).toBe(true);
  });

  it("does not match a different time or different exercises", () => {
    expect(find(planned("2026-03-02T18:31:30.000Z", ["bench", "squat"]))).toBe(false);
    expect(find(planned("2026-03-02T18:30:00.000Z", ["bench"]))).toBe(false);
    expect(find(planned("2026-03-02T18:30:00.000Z", ["bench", "squat", "row"]))).toBe(false);
  });
});
