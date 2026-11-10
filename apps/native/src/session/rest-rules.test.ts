import { describe, expect, it } from "vitest";

import { blocksOf } from "./blocks";
import {
  clampedAdjustment,
  restAfterTick,
  restBelongsTo,
  restView,
  type RestExercise,
} from "./rest-rules";

const exercise = (
  id: string,
  group: string | null,
  restSeconds: number | null,
  kinds: ("warmup" | "working")[] = ["working", "working"],
): RestExercise => ({
  id,
  supersetGroup: group,
  restSeconds,
  sets: kinds.map((kind, index) => ({ id: `${id}-${index + 1}`, completedAt: null, kind })),
});

const after = (list: RestExercise[], exerciseId: string, setId: string) => {
  const block = blocksOf(list).find((candidate) =>
    candidate.members.some((member) => member.id === exerciseId),
  );
  return block ? restAfterTick(block, exerciseId, setId) : null;
};

describe("rest after a tick", () => {
  it("is the exercise's rest, and nothing when rest is off", () => {
    expect(after([exercise("a", null, 90)], "a", "a-1")).toBe(90);
    expect(after([exercise("a", null, null)], "a", "a-1")).toBeNull();
    expect(after([exercise("a", null, 0)], "a", "a-1")).toBeNull();
  });

  it("uses the fixed warm-up rest after a warm-up, unless rest is off", () => {
    expect(after([exercise("a", null, 180, ["warmup", "working"])], "a", "a-1")).toBe(60);
    expect(after([exercise("a", null, null, ["warmup", "working"])], "a", "a-1")).toBeNull();
  });

  it("stays within ten minutes", () => {
    expect(after([exercise("a", null, 900)], "a", "a-1")).toBe(600);
  });

  it("is nothing for a set that is not there", () => {
    expect(after([exercise("a", null, 90)], "a", "zzz")).toBeNull();
    expect(after([exercise("a", null, 90)], "b", "a-1")).toBeNull();
  });

  it("in a superset starts only after the last member's set of the round, with the group's rest", () => {
    const list = [exercise("a", "g", null), exercise("b", "g", 120)];
    expect(after(list, "a", "a-1")).toBeNull();
    expect(after(list, "b", "b-1")).toBe(120);
    expect(after(list, "a", "a-2")).toBeNull();
    expect(after(list, "b", "b-2")).toBe(120);
  });

  it("in a superset lets the last member with a set in the round start it", () => {
    const list = [
      exercise("a", "g", null, ["working", "working", "working"]),
      exercise("b", "g", 90, ["working"]),
    ];
    // B has no second or third set, so A2 and A3 are the last of their rounds.
    expect(after(list, "a", "a-1")).toBeNull();
    expect(after(list, "a", "a-2")).toBe(90);
    expect(after(list, "a", "a-3")).toBe(90);
    expect(after(list, "b", "b-1")).toBe(90);
  });

  it("in a superset with the group's rest off starts nothing", () => {
    const list = [exercise("a", "g", null), exercise("b", "g", null)];
    expect(after(list, "b", "b-1")).toBeNull();
  });
});

describe("adjusting the rest", () => {
  it("keeps it between 0 and 10 minutes", () => {
    expect(clampedAdjustment(60, 15)).toEqual({ delta: 15, ends: false });
    expect(clampedAdjustment(60, -15)).toEqual({ delta: -15, ends: false });
    expect(clampedAdjustment(595, 15)).toEqual({ delta: 5, ends: false });
    expect(clampedAdjustment(600, 15)).toEqual({ delta: 0, ends: false });
    expect(clampedAdjustment(10, -15)).toEqual({ delta: -10, ends: true });
    expect(clampedAdjustment(15, -15)).toEqual({ delta: -15, ends: true });
  });
});

describe("the rest as it stands", () => {
  const rest = { startedAt: "2026-01-01T10:00:00.000Z", endsAt: "2026-01-01T10:02:00.000Z" };

  it("reads remaining and total from the stored times", () => {
    expect(restView(rest, Date.parse("2026-01-01T10:00:30.000Z"))).toEqual({
      remaining: 90,
      total: 120,
      running: true,
    });
    expect(restView(rest, Date.parse("2026-01-01T10:02:00.000Z")).running).toBe(false);
  });

  it("does not run longer than it was set for when the clock jumps back", () => {
    expect(restView(rest, Date.parse("2025-12-31T10:00:00.000Z")).remaining).toBe(120);
  });

  it("belongs to the exercise whose set started it, while running", () => {
    const owner = { sets: [{ id: "s1" }, { id: "s2" }] };
    expect(restBelongsTo({ setId: "s2" }, owner, true)).toBe(true);
    expect(restBelongsTo({ setId: "s2" }, owner, false)).toBe(false);
    expect(restBelongsTo({ setId: "x" }, owner, true)).toBe(false);
    expect(restBelongsTo(null, owner, true)).toBe(false);
  });
});
