import type { PlannedSet } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { effortLabel, formatEffortRange, nudgeEffort, selectEffort } from "./effort";
import { estimateMinutes, estimateSeconds } from "./estimate";
import { beforeIdOf, movedOrder, slotOf, targetIndex } from "./reorder";
import { formatClock, parseDuration, restChoices } from "./rest";
import {
  appendSet,
  appendWarmup,
  chipTexts,
  removeSetAt,
  withKind,
  withTarget,
} from "./set-editing";

const working = (set: Omit<PlannedSet, "kind"> = {}): PlannedSet => ({ kind: "working", ...set });

describe("duration estimate", () => {
  it("is sets × (40 s + rest), warm-ups resting a fixed minute", () => {
    expect(estimateSeconds([{ sets: [working(), working(), working()], restSeconds: 120 }])).toBe(
      480,
    );
    expect(estimateSeconds([{ sets: [{ kind: "warmup" }], restSeconds: 300 }])).toBe(100);
    expect(estimateSeconds([{ sets: [working()], restSeconds: null }])).toBe(40);
  });

  it("rounds to five minutes and is zero without sets", () => {
    expect(estimateMinutes([])).toBe(0);
    expect(estimateMinutes([{ sets: [working()], restSeconds: null }])).toBe(5);
    const seven = Array.from({ length: 7 }, () => ({
      sets: [working(), working(), working()],
      restSeconds: 120,
    }));
    expect(estimateMinutes(seven)).toBe(55);
  });

  it("includes the planned time for continuous cardio instead of treating it as a short set", () => {
    const cardio = [
      { sets: [working({ duration_s: 900, distance_m: 1200 })], restSeconds: null },
      { sets: [working({ duration_s: 600, distance_m: 2500 })], restSeconds: null },
    ];
    expect(estimateSeconds(cardio)).toBe(1500);
    expect(estimateMinutes(cardio)).toBe(25);
    expect(estimateSeconds([...cardio, { sets: [working()], restSeconds: 60 }])).toBe(1600);
  });
});

describe("warm-ups", () => {
  const five = (): PlannedSet => working({ reps_min: 5, reps_max: 5 });

  it("adds a warm-up before the working sets with their reps, up to five", () => {
    const sets = appendWarmup([five(), five()], "weight_reps");
    expect(sets.map((s) => s.kind)).toEqual(["warmup", "working", "working"]);
    expect(sets[0]).toEqual({ kind: "warmup", reps_min: 5, reps_max: 5 });
    const full = Array.from({ length: 5 }, (): PlannedSet => ({ kind: "warmup" }));
    expect(appendWarmup([...full, working()], "weight_reps")).toHaveLength(6);
  });

  it("does nothing for types that do not record reps", () => {
    expect(appendWarmup([working()], "duration")).toHaveLength(1);
  });
});

describe("per-set editing", () => {
  it("counts all training sets while keeping warm-ups separate", () => {
    const letters = { warmup: "W", working: "", drop: "D", failure: "T" };
    expect(
      chipTexts(
        [{ kind: "warmup" }, working(), { kind: "drop" }, working(), { kind: "failure" }],
        letters,
      ),
    ).toEqual(["W", "1", "2D", "3", "4T"]);
  });

  it("distinguishes multiple warm-ups without counting them as training sets", () => {
    const letters = { warmup: "W", working: "", drop: "D", failure: "T" };
    expect(
      chipTexts([{ kind: "warmup" }, { kind: "warmup" }, working(), { kind: "drop" }], letters),
    ).toEqual(["W1", "W2", "1", "2D"]);
  });

  it("keeps later training numbers when a working set becomes a drop or failure set", () => {
    const letters = { warmup: "W", working: "", drop: "D", failure: "T" };
    const sets = [working(), working(), working()];
    expect(chipTexts([withKind(sets[0]!, "drop"), sets[1]!, sets[2]!], letters)).toEqual([
      "1D",
      "2",
      "3",
    ]);
    expect(chipTexts([withKind(sets[0]!, "failure"), sets[1]!, sets[2]!], letters)).toEqual([
      "1T",
      "2",
      "3",
    ]);
  });

  it("appends a copy of the last working set, up to the limit", () => {
    const sets = appendSet([working({ reps_min: 5, reps_max: 5, weight_kg: 60 })], "weight_reps");
    expect(sets[1]).toEqual({ kind: "working", reps_min: 5, reps_max: 5, weight_kg: 60 });
    expect(
      appendSet(
        Array.from({ length: 20 }, () => working()),
        "weight_reps",
      ),
    ).toHaveLength(20);
  });

  it("never removes the last set, and changes kind or target in place", () => {
    expect(removeSetAt([working()], 0)).toHaveLength(1);
    expect(removeSetAt([working(), { kind: "drop" }], 0)).toEqual([{ kind: "drop" }]);
    expect(withKind(working({ reps_min: 1, reps_max: 1 }), "failure").kind).toBe("failure");
    expect(withTarget(working({ weight_kg: 5 }), { weight_kg: undefined })).toEqual({
      kind: "working",
    });
  });
});

describe("rest and duration", () => {
  it("formats clocks and offers the picker's choices with the current one added", () => {
    expect(formatClock(135)).toBe("2:15");
    expect(formatClock(600)).toBe("10:00");
    expect(restChoices(120)).toHaveLength(10);
    expect(restChoices(null)[0]).toBe(30);
    expect(restChoices(100)).toEqual([30, 45, 60, 75, 90, 100, 120, 150, 180, 240, 300]);
  });

  it("parses seconds or m:ss", () => {
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("")).toBeUndefined();
    expect(parseDuration("0")).toBeUndefined();
    expect(parseDuration("1:")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
  });
});

describe("effort", () => {
  it("labels in the preferred scale", () => {
    expect(effortLabel(8.5, "rpe")).toBe("8.5");
    expect(effortLabel(8.5, "rir")).toBe("1.5");
    expect(formatEffortRange(8, 9, "rir")).toBe("1–2");
    expect(formatEffortRange(8, 8, "rpe")).toBe("8");
  });

  it("selects by tap: single, range, single again, clear", () => {
    expect(selectEffort(null, 8)).toEqual({ min: 8, max: 8 });
    expect(selectEffort({ min: 8, max: 8 }, 9)).toEqual({ min: 8, max: 9 });
    expect(selectEffort({ min: 8, max: 8 }, 7)).toEqual({ min: 7, max: 8 });
    expect(selectEffort({ min: 8, max: 9 }, 6)).toEqual({ min: 6, max: 6 });
    expect(selectEffort({ min: 8, max: 9 }, 9)).toEqual({ min: 9, max: 9 });
    expect(selectEffort({ min: 8, max: 8 }, 8)).toBeNull();
  });

  it("nudges for screen readers", () => {
    expect(nudgeEffort(null, 1)).toEqual({ min: 6, max: 6 });
    expect(nudgeEffort({ min: 10, max: 10 }, 1)).toEqual({ min: 10, max: 10 });
    expect(nudgeEffort({ min: 8, max: 9 }, -1)).toEqual({ min: 7.5, max: 7.5 });
  });
});

describe("reorder geometry", () => {
  it("maps a finger position to a clamped target row", () => {
    expect(targetIndex(28, 56, 5)).toBe(0);
    expect(targetIndex(150, 56, 5)).toBe(2);
    expect(targetIndex(9999, 56, 5)).toBe(4);
    expect(targetIndex(-40, 56, 5)).toBe(0);
  });

  it("makes room for the dragged row", () => {
    expect([0, 1, 2, 3].map((index) => slotOf(index, 0, 2))).toEqual([0, 0, 1, 3]);
    expect([0, 1, 2, 3].map((index) => slotOf(index, 3, 1))).toEqual([0, 2, 3, 3]);
  });

  it("finds the row a moved item now sits before", () => {
    expect(movedOrder(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(beforeIdOf(["a", "b", "c", "d"], 0, 2)).toBe("d");
    expect(beforeIdOf(["a", "b", "c", "d"], 0, 3)).toBeNull();
    expect(beforeIdOf(["a", "b", "c", "d"], 3, 0)).toBe("a");
  });
});
