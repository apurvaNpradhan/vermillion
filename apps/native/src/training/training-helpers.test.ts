import type { PlannedSet } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { dragEffort, effortLabel, formatEffortRange, nudgeEffort, tapEffort } from "./effort";
import { estimateMinutes, estimateSeconds } from "./estimate";
import { beforeIdOf, movedOrder, slotOf, targetIndex } from "./reorder";
import { formatClock, restWhenOn, stepDuration, stepRest } from "./rest";
import {
  alikeModel,
  appendSet,
  buildAlike,
  chipTexts,
  clampCounts,
  removeSetAt,
  setsAlike,
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
});

describe("all sets alike", () => {
  const target = { reps_min: 8, reps_max: 10 };
  it("detects equal working sets and ignores warm-ups", () => {
    expect(
      setsAlike([{ kind: "warmup", reps_min: 5, reps_max: 5 }, working(target), working(target)]),
    ).toBe(true);
    expect(setsAlike([working(target), working({ reps_min: 6, reps_max: 8 })])).toBe(false);
    expect(setsAlike([working(target), { kind: "drop", ...target }])).toBe(false);
    expect(setsAlike([])).toBe(true);
  });

  it("builds warm-ups first, copies the reps and keeps existing warm-ups", () => {
    const built = buildAlike({ warmups: 2, working: 3, target }, "weight_reps");
    expect(built.map((set) => set.kind)).toEqual([
      "warmup",
      "warmup",
      "working",
      "working",
      "working",
    ]);
    expect(built[0]).toEqual({ kind: "warmup", reps_min: 10, reps_max: 10 });
    const again = buildAlike({ warmups: 3, working: 3, target }, "weight_reps", [
      { kind: "warmup", reps_min: 3, reps_max: 3 },
    ]);
    expect(again[0]).toEqual({ kind: "warmup", reps_min: 3, reps_max: 3 });
    expect(alikeModel(built, "weight_reps")).toEqual({ warmups: 2, working: 3, target });
  });

  it("drops fields the type does not record and warm-ups for non-rep types", () => {
    const built = buildAlike(
      { warmups: 2, working: 2, target: { duration_s: 30, reps_min: 5, reps_max: 5 } },
      "duration",
    );
    expect(built).toEqual([
      { kind: "working", duration_s: 30 },
      { kind: "working", duration_s: 30 },
    ]);
  });

  it("keeps the total within 20 sets and 5 warm-ups", () => {
    expect(clampCounts("weight_reps", 9, 30)).toEqual({ warmups: 0, working: 20 });
    expect(clampCounts("weight_reps", 9, 10)).toEqual({ warmups: 5, working: 10 });
    expect(clampCounts("weight_reps", 5, 0)).toEqual({ warmups: 5, working: 1 });
  });
});

describe("per-set editing", () => {
  it("numbers working sets and letters the other kinds", () => {
    const letters = { warmup: "W", working: "", drop: "D", failure: "F" };
    expect(
      chipTexts(
        [{ kind: "warmup" }, working(), { kind: "drop" }, working(), { kind: "failure" }],
        letters,
      ),
    ).toEqual(["W", "1", "D", "2", "F"]);
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

describe("rest stepper", () => {
  it("steps by 15 s between 0:15 and 10:00", () => {
    expect(stepRest(120, 1)).toBe(135);
    expect(stepRest(15, -1)).toBe(15);
    expect(stepRest(600, 1)).toBe(600);
    expect(formatClock(135)).toBe("2:15");
    expect(formatClock(600)).toBe("10:00");
  });

  it("restores a remembered or default rest when turned back on", () => {
    expect(restWhenOn(null, 120)).toBe(120);
    expect(restWhenOn(90, 120)).toBe(90);
  });
});

describe("duration stepper", () => {
  it("steps finer for short targets", () => {
    expect(stepDuration(30, 1)).toBe(35);
    expect(stepDuration(60, -1)).toBe(55);
    expect(stepDuration(60, 1)).toBe(75);
    expect(stepDuration(300, -1)).toBe(285);
    expect(stepDuration(300, 1)).toBe(330);
    expect(stepDuration(5, -1)).toBe(5);
  });
});

describe("effort", () => {
  it("labels in the preferred scale", () => {
    expect(effortLabel(8.5, "rpe")).toBe("8.5");
    expect(effortLabel(8.5, "rir")).toBe("1.5");
    expect(formatEffortRange(8, 9, "rir")).toBe("1–2");
    expect(formatEffortRange(8, 8, "rpe")).toBe("8");
  });

  it("taps and drags to a single value or a range", () => {
    expect(tapEffort(null, 8)).toEqual({ min: 8, max: 8 });
    expect(tapEffort({ min: 8, max: 8 }, 8)).toBeNull();
    expect(tapEffort({ min: 8, max: 9 }, 8)).toEqual({ min: 8, max: 8 });
    expect(dragEffort(6, 4)).toEqual({ min: 8, max: 9 });
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
