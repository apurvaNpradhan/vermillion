import { KG_PER_LB, type Evidence } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { evidenceLines, evidenceSets } from "./evidence-text";

const format = {
  sets: (weight: string, unit: string, reps: string) => `${weight} ${unit} × ${reps}`,
  assisted: (weight: string, unit: string, reps: string) => `${weight} ${unit} assist × ${reps}`,
  duration: (seconds: number) => `${seconds} s`,
  distance: (metres: number) => `${metres} m`,
};
const options = (unit: "kg" | "lb") => ({
  type: "weight_reps" as const,
  unit,
  formatDate: (iso: string) => iso.slice(0, 10),
  formats: format,
});
const baseline = (unit: "kg" | "lb"): NonNullable<Evidence["baseline"]> => {
  const kg = (value: number) => (unit === "kg" ? value : value * KG_PER_LB);
  return {
    at: "2026-11-24T10:00:00.000Z",
    sets: [
      { kind: "working", weightKg: kg(unit === "kg" ? 60 : 135), reps: 12 },
      { kind: "working", weightKg: kg(unit === "kg" ? 60 : 135), reps: 12 },
      { kind: "working", weightKg: kg(unit === "kg" ? 60 : 135), reps: 11 },
    ],
  };
};

describe.each(["kg", "lb"] as const)("evidence lines in %s", (unit) => {
  const load = unit === "kg" ? "60" : "135";

  it("says which Session was read and what was done in it", () => {
    expect(evidenceLines({ baseline: baseline(unit) }, options(unit))).toEqual([
      {
        key: "progress__evidence_from",
        params: { date: "2026-11-24", sets: `${load} ${unit} × 12, 12, 11` },
      },
    ]);
  });

  it("splits runs by load and leaves out the load of a lift without one", () => {
    const kg = (value: number) => (unit === "kg" ? value : value * KG_PER_LB);
    const sets = [
      { weightKg: kg(unit === "kg" ? 60 : 135), reps: 8 },
      { weightKg: kg(unit === "kg" ? 55 : 125), reps: 10 },
      { weightKg: kg(unit === "kg" ? 55 : 125), reps: null },
    ];
    expect(evidenceSets(sets, "weight_reps", unit, format)).toBe(
      unit === "kg" ? "60 kg × 8 · 55 kg × 10, –" : "135 lb × 8 · 125 lb × 10, –",
    );
    expect(
      evidenceSets(
        [
          { weightKg: null, reps: 12 },
          { weightKg: null, reps: 11 },
        ],
        "reps_only",
        unit,
        format,
      ),
    ).toBe("12, 11");
  });

  it("names a break with its days and share", () => {
    const lines = evidenceLines(
      { baseline: baseline(unit), factor: { source: "break", share: 0.9, days: 23 } },
      options(unit),
    );
    expect(lines.map(({ key }) => key)).toEqual([
      "progress__evidence_from",
      "progress__evidence_break",
    ]);
    expect(lines[1]?.params).toEqual({ count: 23, percent: 90 });
  });

  it("names the real cut when the grid moved the load", () => {
    const kg = (value: number) => (unit === "kg" ? value : value * KG_PER_LB);
    const lines = evidenceLines(
      {
        baseline: null,
        factor: { source: "deload", share: 0.9 },
        snapped: {
          source: "grid",
          fromKg: kg(unit === "kg" ? 12.5 : 30),
          toKg: kg(unit === "kg" ? 10 : 25),
        },
      },
      options(unit),
    );
    expect(lines).toEqual([
      {
        key: "progress__evidence_deload_snapped",
        params: {
          percent: 90,
          value: unit === "kg" ? "10" : "25",
          unit,
          cut: unit === "kg" ? 20 : 17,
        },
      },
    ]);
  });

  it("names the cap a load came down to, and says nothing without evidence", () => {
    const kg = (value: number) => (unit === "kg" ? value : value * KG_PER_LB);
    const lines = evidenceLines(
      {
        baseline: null,
        snapped: {
          source: "cap",
          fromKg: kg(unit === "kg" ? 100 : 225),
          toKg: kg(unit === "kg" ? 90 : 200),
        },
      },
      options(unit),
    );
    expect(lines).toEqual([
      {
        key: "progress__evidence_cap",
        params: { from: unit === "kg" ? "100" : "225", value: unit === "kg" ? "90" : "200", unit },
      },
    ]);
    expect(evidenceLines(undefined, options(unit))).toEqual([]);
  });
});

describe("evidence of timed, carried and assisted work", () => {
  it("says how long a hold was and how far a carry went", () => {
    expect(
      evidenceSets(
        [
          { weightKg: null, reps: null, durationS: 30 },
          { weightKg: null, reps: null, durationS: 25 },
        ],
        "duration",
        "kg",
        format,
      ),
    ).toBe("30 s, 25 s");
    expect(
      evidenceSets(
        [
          { weightKg: 24, reps: null, distanceM: 40 },
          { weightKg: 24, reps: null, distanceM: 40 },
        ],
        "short_distance_weight",
        "kg",
        format,
      ),
    ).toBe("24 kg × 40 m, 40 m");
  });

  it("says how much help an assisted set had", () => {
    expect(
      evidenceSets(
        [
          { weightKg: 20, reps: 8 },
          { weightKg: 20, reps: 7 },
        ],
        "bodyweight_assisted_reps",
        "kg",
        format,
      ),
    ).toBe("20 kg assist × 8, 7");
  });
});
