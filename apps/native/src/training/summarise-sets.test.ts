import type { PlannedSet } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { summariseSets, type SummaryLabels, type SummaryPrefs } from "./summarise-sets";

const labels: SummaryLabels = {
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
};
const kg: SummaryPrefs = { weightUnit: "kg", effortScale: "rpe" };
const working = (set: Omit<PlannedSet, "kind"> = {}): PlannedSet => ({ kind: "working", ...set });
const three = (set: Omit<PlannedSet, "kind">) => [working(set), working(set), working(set)];

describe("summariseSets", () => {
  it("shows sets × rep range, effort and rest", () => {
    const sets = three({ reps_min: 8, reps_max: 10, effort_min: 8, effort_max: 9 });
    expect(summariseSets(sets, "weight_reps", 120, kg, labels)).toBe("3 × 8–10 · RPE 8–9 · 2:00");
  });

  it("puts warm-ups first and the weight after the reps", () => {
    const sets: PlannedSet[] = [
      { kind: "warmup", reps_min: 8, reps_max: 8 },
      { kind: "warmup", reps_min: 5, reps_max: 5 },
      ...three({ reps_min: 6, reps_max: 8, weight_kg: 100 }),
    ];
    expect(summariseSets(sets, "weight_reps", null, kg, labels)).toBe(
      "2 warm-up + 3 × 6–8 @ 100 kg · Rest off",
    );
  });

  it("converts weight and effort to the preferred units", () => {
    const sets = three({
      reps_min: 5,
      reps_max: 5,
      weight_kg: 45.359,
      effort_min: 8,
      effort_max: 9,
    });
    expect(
      summariseSets(sets, "weight_reps", 90, { weightUnit: "lb", effortScale: "rir" }, labels),
    ).toBe("3 × 5 @ 100 lb · RIR 1–2 · 1:30");
  });

  it("describes duration, distance and mixed types", () => {
    expect(summariseSets(three({ duration_s: 30 }), "duration", 60, kg, labels)).toBe(
      "3 × 30 s · 1:00",
    );
    expect(summariseSets(three({ duration_s: 90 }), "duration", 60, kg, labels)).toBe(
      "3 × 1 min 30 s · 1:00",
    );
    expect(
      summariseSets(
        three({ distance_m: 1500, duration_s: 600 }),
        "distance_duration",
        null,
        kg,
        labels,
      ),
    ).toBe("3 × 1.5 km · 10 min · Rest off");
    expect(
      summariseSets(
        three({ distance_m: 20, weight_kg: 50 }),
        "short_distance_weight",
        90,
        kg,
        labels,
      ),
    ).toBe("3 × 20 m @ 50 kg · 1:30");
  });

  it("ignores a weight the type does not record", () => {
    expect(
      summariseSets(
        three({ reps_min: 10, reps_max: 10, weight_kg: 20 }),
        "reps_only",
        60,
        kg,
        labels,
      ),
    ).toBe("3 × 10 · 1:00");
  });

  it("counts working sets that differ and spans their reps", () => {
    const sets = [working({ reps_min: 6, reps_max: 8 }), working({ reps_min: 10, reps_max: 12 })];
    expect(summariseSets(sets, "weight_reps", 120, kg, labels)).toBe("2 sets · 6–12 · 2:00");
    expect(
      summariseSets(
        [{ kind: "drop", reps_min: 8, reps_max: 8 }, working({ reps_min: 8, reps_max: 8 })],
        "weight_reps",
        60,
        kg,
        labels,
      ),
    ).toBe("2 × 8 · 1:00");
  });

  it("falls back to a count when no target is set, and to rest alone without sets", () => {
    expect(summariseSets(three({}), "reps_only", 60, kg, labels)).toBe("3 sets · 1:00");
    expect(summariseSets([], "weight_reps", null, kg, labels)).toBe("Rest off");
  });

  it("shows No rest for a superset member that does not hold the group's rest", () => {
    const sets = three({ reps_min: 8, reps_max: 10 });
    expect(summariseSets(sets, "weight_reps", null, kg, labels, "group")).toBe(
      "3 × 8–10 · No rest",
    );
    expect(summariseSets(sets, "weight_reps", 90, kg, labels, "group")).toBe("3 × 8–10 · No rest");
    expect(summariseSets(sets, "weight_reps", 90, kg, labels, "own")).toBe("3 × 8–10 · 1:30");
  });
});
