import type { PlannedSet } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import {
  planAsText,
  plainText,
  type PlanTextLabels,
  type SharedExercise,
  type SharedProgram,
  type SharedWorkout,
} from "./plan-as-text";
import type { SummaryPrefs } from "./summarise-sets";

const labels: PlanTextLabels = {
  warmup: (count) => `${count} warm-up`,
  sets: (count) => `${count} sets`,
  seconds: (value) => `${value} s`,
  minutes: (value) => `${value} min`,
  minutesSeconds: (minutes, seconds) => `${minutes} min ${seconds} s`,
  meters: (value) => `${value} m`,
  kilometers: (value) => `${value} km`,
  floors: (value) => `${value} floors`,
  steps: (value) => `${value} steps`,
  weight: (value, unit) => `${value} ${unit}`,
  effort: (scale, value) => `${scale.toUpperCase()} ${value}`,
  restOff: "Rest off",
  noRest: "No rest",
  rest: (clock) => `rest ${clock}`,
  at: (weight) => `at ${weight}`,
  superset: "Superset",
  slot: (number, title) => `${number}. ${title}`,
  restDay: (number) => `${number}. Rest`,
};

const working = (set: Omit<PlannedSet, "kind"> = {}): PlannedSet => ({ kind: "working", ...set });
const three = (set: Omit<PlannedSet, "kind">) => [working(set), working(set), working(set)];

function exercise(overrides: Partial<SharedExercise> & { name: string }): SharedExercise {
  return {
    type: "weight_reps",
    sets: three({ reps_min: 8, reps_max: 10 }),
    restSeconds: 120,
    note: null,
    supersetGroup: null,
    ...overrides,
  };
}

const bench = exercise({
  name: "Bench Press",
  sets: [
    { kind: "warmup", reps_min: 8, reps_max: 8 },
    { kind: "warmup", reps_min: 5, reps_max: 5 },
    ...three({ reps_min: 6, reps_max: 8, effort_min: 8, effort_max: 9 }),
  ],
  restSeconds: 180,
  note: "Pause on the chest",
});
const press = exercise({
  name: "Overhead Press",
  sets: three({ reps_min: 8, reps_max: 10, weight_kg: 45.359 }),
});
const plank = exercise({
  name: "Plank",
  type: "duration",
  sets: three({ duration_s: 45 }),
  restSeconds: null,
});
const curl = exercise({ name: "Curl", supersetGroup: "g", restSeconds: null });
const extension = exercise({ name: "Triceps Extension", supersetGroup: "g", restSeconds: 60 });

const workoutOf = (title: string, exercises: SharedExercise[], note: string | null = null) =>
  ({ title, note, exercises }) satisfies SharedWorkout;

const push = workoutOf("Push", [bench, press]);
const pull = workoutOf("Pull", [curl, extension]);
const legs = workoutOf("Legs", [plank], "Keep it easy");

const program: SharedProgram = {
  title: "Push Pull Legs",
  description: "A **simple** split.\n\n- Train hard\n- Rest well",
  slots: [push, pull, null, push, pull, legs],
};

const rpeKg: SummaryPrefs = { weightUnit: "kg", effortScale: "rpe" };
const rirLb: SummaryPrefs = { weightUnit: "lb", effortScale: "rir" };

describe("planAsText", () => {
  it("writes a Workout: title, then one line per exercise with the note under it", () => {
    expect(planAsText({ kind: "workout", workout: push }, rpeKg, labels)).toBe(
      [
        "Push",
        "Bench Press: 2 warm-up, 3 × 6–8 @ RPE 8–9, rest 3:00",
        "  Pause on the chest",
        "Overhead Press: 3 × 8–10 at 45.25 kg, rest 2:00",
      ].join("\n"),
    );
  });

  it("follows the effort scale and the weight unit", () => {
    const text = planAsText({ kind: "workout", workout: push }, rirLb, labels);
    expect(text).toContain("Bench Press: 2 warm-up, 3 × 6–8 @ RIR 1–2, rest 3:00");
    expect(text).toContain("Overhead Press: 3 × 8–10 at 100 lb, rest 2:00");
  });

  it("writes a 6-Slot Program in both scales and both units", () => {
    const kg = planAsText({ kind: "program", program }, rpeKg, labels);
    expect(kg).toBe(
      [
        "Push Pull Legs",
        "",
        "A simple split.",
        "",
        "• Train hard",
        "• Rest well",
        "",
        "1. Push",
        "Bench Press: 2 warm-up, 3 × 6–8 @ RPE 8–9, rest 3:00",
        "  Pause on the chest",
        "Overhead Press: 3 × 8–10 at 45.25 kg, rest 2:00",
        "",
        "2. Pull",
        "Superset",
        "  Curl: 3 × 8–10",
        "  Triceps Extension: 3 × 8–10, rest 1:00",
        "",
        "3. Rest",
        "",
        "4. Push",
        "Bench Press: 2 warm-up, 3 × 6–8 @ RPE 8–9, rest 3:00",
        "  Pause on the chest",
        "Overhead Press: 3 × 8–10 at 45.25 kg, rest 2:00",
        "",
        "5. Pull",
        "Superset",
        "  Curl: 3 × 8–10",
        "  Triceps Extension: 3 × 8–10, rest 1:00",
        "",
        "6. Legs",
        "Keep it easy",
        "Plank: 3 × 45 s",
      ].join("\n"),
    );
    const lb = planAsText({ kind: "program", program }, rirLb, labels);
    expect(lb).toContain("Bench Press: 2 warm-up, 3 × 6–8 @ RIR 1–2, rest 3:00");
    expect(lb).toContain("Overhead Press: 3 × 8–10 at 100 lb, rest 2:00");
    expect(lb).not.toContain("RPE");
    expect(lb.split("\n").filter((line) => /^\d\. /.test(line))).toHaveLength(6);
  });

  it("leaves out an absent description and handles an empty Workout", () => {
    const text = planAsText(
      { kind: "program", program: { title: "Empty", description: null, slots: [] } },
      rpeKg,
      labels,
    );
    expect(text).toBe("Empty");
    expect(planAsText({ kind: "workout", workout: workoutOf("None", []) }, rpeKg, labels)).toBe(
      "None",
    );
  });

  it("does not treat a lone group member as a superset (gap after a concurrent reorder)", () => {
    const split = workoutOf("Split", [
      exercise({ name: "A", supersetGroup: "g" }),
      exercise({ name: "B" }),
      exercise({ name: "C", supersetGroup: "g" }),
    ]);
    const text = planAsText({ kind: "workout", workout: split }, rpeKg, labels);
    expect(text).not.toContain("Superset");
    expect(text).toContain("A: 3 × 8–10, rest 2:00");
  });
});

describe("plainText", () => {
  it("reads Markdown as plain text", () => {
    expect(plainText("# Title\n\nSome *words* with a [link](https://example.com).")).toBe(
      "Title\n\nSome words with a link.",
    );
  });
});
