import { describe, expect, it } from "vitest";

import {
  checkSet,
  checkWeighIn,
  referenceFrom,
  type ExerciseReference,
  type SetCheckInput,
} from "./entry-guards";

const LB = 0.45359237;
const lb = (value: number) => value * LB;

const none: ExerciseReference = { heaviestKg: null, bestReps: null };
const bench: ExerciseReference = { heaviestKg: 100, bestReps: 12 };

const input = (over: Partial<SetCheckInput>): SetCheckInput => ({
  type: "weight_reps",
  basis: "total",
  unit: "kg",
  weightKg: 100,
  reps: 5,
  history: bench,
  suggestedKg: null,
  ...over,
});

describe("referenceFrom", () => {
  it("takes the heaviest completed progressing load and the best reps", () => {
    expect(
      referenceFrom([
        { kind: "working", weight_kg: 90, reps: 8, completed_at: "2026-01-01T00:00:00Z" },
        { kind: "top", weight_kg: 100, reps: 3, completed_at: "2026-01-01T00:00:00Z" },
        { kind: "warmup", weight_kg: 140, reps: 20, completed_at: "2026-01-01T00:00:00Z" },
        { kind: "working", weight_kg: 120, reps: 30, completed_at: null },
      ]),
    ).toEqual({ heaviestKg: 100, bestReps: 8 });
  });

  it("is empty without history", () => {
    expect(referenceFrom([])).toEqual(none);
    expect(
      referenceFrom([{ kind: "working", weight_kg: null, reps: 12, completed_at: "x" }]),
    ).toEqual({ heaviestKg: null, bestReps: 12 });
  });
});

describe("checkSet: high load against the reference", () => {
  it("flags a load above both 1.5x and +20 kg", () => {
    expect(checkSet(input({ weightKg: 1000 }))).toEqual({
      reason: "high_load",
      referenceKg: 100,
      source: "history",
    });
    expect(checkSet(input({ weightKg: 151 }))?.reason).toBe("high_load");
  });

  it("does not flag at or below either bound", () => {
    expect(checkSet(input({ weightKg: 150 }))).toBeNull();
    // 1.5x of 30 is 45, but +20 kg is 50: a jump of 22 kg is under the second bound.
    expect(checkSet(input({ history: { heaviestKg: 30, bestReps: 10 }, weightKg: 49 }))).toBeNull();
    expect(
      checkSet(input({ history: { heaviestKg: 30, bestReps: 10 }, weightKg: 51 }))?.reason,
    ).toBe("high_load");
    // +20 kg of 200 is 220, but 1.5x is 300.
    expect(
      checkSet(input({ history: { heaviestKg: 200, bestReps: 5 }, weightKg: 290 })),
    ).toBeNull();
  });

  it("uses +45 lb in pounds", () => {
    const history = { heaviestKg: lb(100), bestReps: 8 };
    // 1.5x of 100 lb is 150 lb, +45 lb is 145 lb: 151 lb passes both.
    expect(checkSet(input({ unit: "lb", history, weightKg: lb(151) }))?.reason).toBe("high_load");
    expect(checkSet(input({ unit: "lb", history, weightKg: lb(150) }))).toBeNull();
    const light = { heaviestKg: lb(20), bestReps: 8 };
    // 1.5x of 20 lb is 30 lb; +45 lb is 65 lb. 64 lb is fine, 66 lb is not.
    expect(checkSet(input({ unit: "lb", history: light, weightKg: lb(64) }))).toBeNull();
    expect(checkSet(input({ unit: "lb", history: light, weightKg: lb(66) }))?.reason).toBe(
      "high_load",
    );
    // In kilograms 66 lb (29.9 kg) over a 9 kg reference is above +20 kg and 1.5x.
    expect(checkSet(input({ history: light, weightKg: lb(66) }))?.reason).toBe("high_load");
  });

  it("takes today's suggestion as the reference when it is higher", () => {
    expect(checkSet(input({ suggestedKg: 120, weightKg: 170 }))).toBeNull();
    expect(checkSet(input({ suggestedKg: 120, weightKg: 181 }))).toEqual({
      reason: "high_load",
      referenceKg: 120,
      source: "suggestion",
    });
  });

  it("never flags a lower load", () => {
    expect(checkSet(input({ weightKg: 40 }))).toBeNull();
    expect(checkSet(input({ weightKg: 0 }))).toBeNull();
    expect(checkSet(input({ weightKg: 10 }))).toBeNull();
  });

  it("works per hand for dumbbells and for added load", () => {
    const history = { heaviestKg: 30, bestReps: 10 };
    expect(checkSet(input({ basis: "per_hand", history, weightKg: 50 }))).toBeNull();
    expect(checkSet(input({ basis: "per_hand", history, weightKg: 55 }))?.reason).toBe("high_load");
    expect(
      checkSet(
        input({
          type: "bodyweight_weighted_reps",
          history: { heaviestKg: 20, bestReps: 8 },
          weightKg: 25,
        }),
      ),
    ).toBeNull();
    expect(
      checkSet(
        input({
          type: "bodyweight_weighted_reps",
          history: { heaviestKg: 20, bestReps: 8 },
          weightKg: 60,
        }),
      )?.reason,
    ).toBe("high_load");
  });
});

describe("checkSet: no history", () => {
  it("flags above the ceiling of the equipment", () => {
    expect(checkSet(input({ history: none, weightKg: 301 }))).toEqual({
      reason: "ceiling",
      ceilingKg: 300,
    });
    expect(checkSet(input({ history: none, weightKg: 300 }))).toBeNull();
  });

  it("uses 80 per hand, 100 added and 150 assisted", () => {
    expect(checkSet(input({ history: none, basis: "per_hand", weightKg: 81 }))).toEqual({
      reason: "ceiling",
      ceilingKg: 80,
    });
    expect(checkSet(input({ history: none, basis: "per_hand", weightKg: 80 }))).toBeNull();
    expect(
      checkSet(input({ history: none, type: "bodyweight_weighted_reps", weightKg: 101 })),
    ).toEqual({ reason: "ceiling", ceilingKg: 100 });
    expect(
      checkSet(input({ history: none, type: "bodyweight_weighted_reps", weightKg: 100 })),
    ).toBeNull();
    expect(
      checkSet(input({ history: none, type: "bodyweight_assisted_reps", weightKg: 151 })),
    ).toEqual({ reason: "ceiling", ceilingKg: 150 });
    expect(
      checkSet(input({ history: none, type: "bodyweight_assisted_reps", weightKg: 150 })),
    ).toBeNull();
  });

  it("halves the ceiling per side for plate-loaded loads", () => {
    expect(checkSet(input({ history: none, basis: "per_side", weightKg: 151 }))?.reason).toBe(
      "ceiling",
    );
    expect(checkSet(input({ history: none, basis: "per_side", weightKg: 150 }))).toBeNull();
  });

  it("does not use the ceiling once a suggestion exists", () => {
    expect(checkSet(input({ history: none, suggestedKg: 100, weightKg: 140 }))).toBeNull();
  });

  it("counts a pound entry by its kilograms", () => {
    expect(checkSet(input({ history: none, unit: "lb", weightKg: lb(700) }))?.reason).toBe(
      "ceiling",
    );
    expect(checkSet(input({ history: none, unit: "lb", weightKg: lb(600) }))).toBeNull();
  });
});

describe("checkSet: the kilogram and pound slip", () => {
  it("flags about 2.2x the reference as an upward slip", () => {
    expect(checkSet(input({ weightKg: 220 }))).toEqual({
      reason: "unit_slip",
      direction: "up",
      referenceKg: 100,
    });
    // within 5% of 2.2x
    expect(checkSet(input({ weightKg: 230 }))?.reason).toBe("unit_slip");
    expect(checkSet(input({ weightKg: 210 }))?.reason).toBe("unit_slip");
  });

  it("reads a lighter slip as a plain high load when it is outside 5%", () => {
    expect(checkSet(input({ weightKg: 235 }))?.reason).toBe("high_load");
    expect(checkSet(input({ weightKg: 205 }))?.reason).toBe("high_load");
  });

  it("flags about 1/2.2 of the reference as a downward slip", () => {
    expect(checkSet(input({ weightKg: 45.4 }))).toEqual({
      reason: "unit_slip",
      direction: "down",
      referenceKg: 100,
    });
    expect(checkSet(input({ weightKg: 47 }))?.reason).toBe("unit_slip");
    expect(checkSet(input({ weightKg: 44 }))?.reason).toBe("unit_slip");
    expect(checkSet(input({ weightKg: 50 }))).toBeNull();
    expect(checkSet(input({ weightKg: 40 }))).toBeNull();
  });

  it("flags the downward slip only from a 40 kg reference", () => {
    // 1/2.2 of 39 kg is 17.7
    expect(
      checkSet(input({ history: { heaviestKg: 39, bestReps: 8 }, weightKg: 17.7 })),
    ).toBeNull();
    expect(
      checkSet(input({ history: { heaviestKg: 40, bestReps: 8 }, weightKg: 18.2 }))?.reason,
    ).toBe("unit_slip");
  });

  it("flags the downward slip only from a 90 lb reference in pounds", () => {
    const at = (reference: number, entered: number) =>
      checkSet(
        input({
          unit: "lb",
          history: { heaviestKg: lb(reference), bestReps: 8 },
          weightKg: lb(entered),
        }),
      );
    expect(at(89, 40)).toBeNull();
    expect(at(90, 41)?.reason).toBe("unit_slip");
    expect(at(225, 102)?.reason).toBe("unit_slip");
  });

  it("flags 2.2x in pounds too", () => {
    expect(
      checkSet(
        input({ unit: "lb", history: { heaviestKg: lb(100), bestReps: 8 }, weightKg: lb(220) }),
      ),
    ).toEqual({ reason: "unit_slip", direction: "up", referenceKg: lb(100) });
  });

  it("needs a reference", () => {
    expect(checkSet(input({ history: none, weightKg: 45 }))).toBeNull();
  });
});

describe("checkSet: reps", () => {
  it("flags above 50 on a weighted exercise that never passed 25", () => {
    const history = { heaviestKg: 100, bestReps: 20 };
    expect(checkSet(input({ history, weightKg: 60, reps: 51 }))).toEqual({
      reason: "high_reps",
      bestReps: 20,
    });
    expect(checkSet(input({ history, weightKg: 60, reps: 50 }))).toBeNull();
    expect(checkSet(input({ history: none, weightKg: 60, reps: 80 }))?.reason).toBe("high_reps");
  });

  it("lets a high-rep history keep its 50s", () => {
    expect(
      checkSet(input({ history: { heaviestKg: 100, bestReps: 30 }, weightKg: 60, reps: 60 })),
    ).toBeNull();
  });

  it("flags above both 3x the best and 30 on any reps exercise", () => {
    const history = { heaviestKg: null, bestReps: 15 };
    expect(checkSet(input({ type: "bodyweight_reps", weightKg: null, history, reps: 46 }))).toEqual(
      { reason: "high_reps", bestReps: 15 },
    );
    expect(
      checkSet(input({ type: "bodyweight_reps", weightKg: null, history, reps: 45 })),
    ).toBeNull();
    // 3x of 5 is 15, but 30 is the other bound.
    expect(
      checkSet(
        input({
          type: "reps_only",
          weightKg: null,
          history: { heaviestKg: null, bestReps: 5 },
          reps: 30,
        }),
      ),
    ).toBeNull();
    expect(
      checkSet(
        input({
          type: "reps_only",
          weightKg: null,
          history: { heaviestKg: null, bestReps: 5 },
          reps: 31,
        }),
      )?.reason,
    ).toBe("high_reps");
  });

  it("does not apply the 50-rep rule to an unweighted exercise without history", () => {
    expect(
      checkSet(input({ type: "bodyweight_reps", weightKg: null, history: none, reps: 60 })),
    ).toBeNull();
  });
});

describe("checkSet: swapped fields", () => {
  it("offers a swap when a rep count sits in the weight and a load in the reps", () => {
    expect(checkSet(input({ weightKg: 8, reps: 100 }))).toEqual({
      reason: "swapped",
      weightKg: 100,
      reps: 8,
    });
  });

  it("swaps in pounds", () => {
    const check = checkSet(
      input({
        unit: "lb",
        history: { heaviestKg: lb(225), bestReps: 8 },
        weightKg: lb(8),
        reps: 225,
      }),
    );
    expect(check?.reason).toBe("swapped");
    if (check?.reason === "swapped") {
      expect(check.reps).toBe(8);
      expect(check.weightKg).toBeCloseTo(lb(225), 2);
    }
  });

  it("needs a whole weight of at most 30 and reps of at least 3x the weight", () => {
    expect(checkSet(input({ weightKg: 8.5, reps: 100 }))?.reason).not.toBe("swapped");
    expect(checkSet(input({ weightKg: 31, reps: 100 }))?.reason).not.toBe("swapped");
    expect(checkSet(input({ weightKg: 40, reps: 100 }))?.reason).not.toBe("swapped");
    expect(checkSet(input({ weightKg: 8, reps: 20 }))).toBeNull();
  });

  it("leaves a light exercise with high reps alone", () => {
    expect(
      checkSet(input({ history: { heaviestKg: 10, bestReps: 20 }, weightKg: 8, reps: 40 })),
    ).toBeNull();
  });

  it("needs a reference", () => {
    expect(checkSet(input({ history: none, weightKg: 8, reps: 100 }))?.reason).not.toBe("swapped");
  });

  it("is not offered when the reps are far below the reference load", () => {
    expect(
      checkSet(input({ history: { heaviestKg: 100, bestReps: 20 }, weightKg: 8, reps: 40 })),
    ).toBeNull();
  });
});

describe("checkSet: nothing to check", () => {
  it("passes a normal set", () => {
    expect(checkSet(input({ weightKg: 102.5, reps: 5 }))).toBeNull();
  });

  it("passes a set without a weight or reps", () => {
    expect(checkSet(input({ weightKg: null, reps: null }))).toBeNull();
    expect(checkSet(input({ type: "duration", weightKg: null, reps: null }))).toBeNull();
  });
});

describe("checkWeighIn", () => {
  it("flags a weigh-in outside 25 to 350 kg", () => {
    expect(checkWeighIn({ kg: 24.9, trendKg: null, unit: "kg" })).toEqual({
      reason: "out_of_range",
    });
    expect(checkWeighIn({ kg: 351, trendKg: null, unit: "kg" })).toEqual({
      reason: "out_of_range",
    });
    expect(checkWeighIn({ kg: 25, trendKg: null, unit: "kg" })).toBeNull();
    expect(checkWeighIn({ kg: 350, trendKg: null, unit: "kg" })).toBeNull();
  });

  it("flags more than 7% and 3 kg from the trend, in either direction", () => {
    expect(checkWeighIn({ kg: 90, trendKg: 80, unit: "kg" })).toEqual({
      reason: "far_from_trend",
      trendKg: 80,
    });
    expect(checkWeighIn({ kg: 70, trendKg: 80, unit: "kg" })?.reason).toBe("far_from_trend");
    // 7% of 80 is 5.6
    expect(checkWeighIn({ kg: 85, trendKg: 80, unit: "kg" })).toBeNull();
    expect(checkWeighIn({ kg: 86, trendKg: 80, unit: "kg" })?.reason).toBe("far_from_trend");
  });

  it("needs 3 kg as well on a light trend", () => {
    // 7% of 40 is 2.8, so 43 is past 7% but under 3 kg.
    expect(checkWeighIn({ kg: 43, trendKg: 40, unit: "kg" })).toBeNull();
    expect(checkWeighIn({ kg: 43.1, trendKg: 40, unit: "kg" })?.reason).toBe("far_from_trend");
  });

  it("uses 7 lb in pounds", () => {
    // 7% of 100 lb is 7 lb exactly, so both bounds meet at 7 lb.
    expect(checkWeighIn({ kg: lb(106), trendKg: lb(100), unit: "lb" })).toBeNull();
    expect(checkWeighIn({ kg: lb(108), trendKg: lb(100), unit: "lb" })?.reason).toBe(
      "far_from_trend",
    );
    // 7% of 200 lb is 14: 210 lb is past 7 lb but not past 7%.
    expect(checkWeighIn({ kg: lb(210), trendKg: lb(200), unit: "lb" })).toBeNull();
    expect(checkWeighIn({ kg: lb(215), trendKg: lb(200), unit: "lb" })?.reason).toBe(
      "far_from_trend",
    );
  });

  it("has no trend check without a trend", () => {
    expect(checkWeighIn({ kg: 200, trendKg: null, unit: "kg" })).toBeNull();
  });
});
