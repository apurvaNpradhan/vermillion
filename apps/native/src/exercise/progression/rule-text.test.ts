import { KG_PER_LB } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { RULE_OPTIONS, previewGroups } from "./rule-text";

describe("rule text", () => {
  it("lists the four rules, Double first", () => {
    expect(RULE_OPTIONS.map(({ id }) => id)).toEqual([
      "double",
      "linear",
      "top_backoff",
      "maintain",
    ]);
    expect(RULE_OPTIONS[1]).toMatchObject({
      titleKey: "progress__rule_linear",
      hintKey: "progress__rule_linear_hint",
    });
  });

  it.each([
    { unit: "kg", top: 140, back: 125 },
    { unit: "lb", top: 315, back: 275 },
  ] as const)(
    "folds identical sets and keeps different ones apart in $unit",
    ({ unit, top, back }) => {
      const kilograms = (value: number) => (unit === "kg" ? value : value * KG_PER_LB);
      const session = {
        sets: [
          { kind: "top", weightKg: kilograms(top), reps: 3 },
          { kind: "backoff", weightKg: kilograms(back), reps: 5 },
          { kind: "backoff", weightKg: kilograms(back), reps: 5 },
        ],
      } as const;
      expect(previewGroups(session, "weight_reps", unit)).toEqual([
        { count: 1, weight: String(top), reps: 3 },
        { count: 2, weight: String(back), reps: 5 },
      ]);
    },
  );

  it("shows reps alone for a lift with no load", () => {
    expect(previewGroups({ sets: [{ weightKg: null, reps: 12 }] }, "reps_only", "kg")).toEqual([
      { count: 1, weight: null, reps: 12 },
    ]);
  });
});
