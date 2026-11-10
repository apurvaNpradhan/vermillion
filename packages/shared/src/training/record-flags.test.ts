import { describe, expect, it } from "vitest";

import { recordFlags } from "./records";
import { loggedSet, sessionOf, setOf } from "./session-fixtures";

const day = (n: number) => `2026-01-${String(n).padStart(2, "0")}T10:00:00Z`;

describe("recordFlags", () => {
  it("flags nothing in the first Session of an exercise", () => {
    const sets = [loggedSet({ weight_kg: 100, reps: 5 }), loggedSet({ weight_kg: 110, reps: 3 })];
    expect(recordFlags([sessionOf("a", day(1), sets)]).size).toBe(0);
  });

  it("flags the sets that beat every earlier Session, not their siblings", () => {
    const first = loggedSet({ weight_kg: 100, reps: 5 });
    const better = loggedSet({ weight_kg: 105, reps: 5 });
    const sibling = loggedSet({ weight_kg: 102, reps: 5 });
    const flags = recordFlags([
      sessionOf("a", day(1), [first]),
      sessionOf("b", day(2), [better, sibling]),
    ]);
    expect(flags.get(better.id)).toEqual(
      expect.arrayContaining(["heaviest_weight", "estimated_one_rep_max", "set_volume", "reps_5"]),
    );
    expect(flags.get(sibling.id)).toEqual(expect.arrayContaining(["heaviest_weight", "reps_5"]));
    // Both beat the earlier Session; `sibling` is not compared with `better`.
    expect(flags.has(first.id)).toBe(false);
  });

  it("does not flag a set that only ties", () => {
    const flags = recordFlags([
      sessionOf("a", day(1), [loggedSet({ weight_kg: 100, reps: 5 })]),
      sessionOf("b", day(2), [loggedSet({ weight_kg: 100, reps: 5 })]),
    ]);
    expect(flags.size).toBe(0);
  });

  it("flags a rep count never done before", () => {
    const eight = loggedSet({ weight_kg: 60, reps: 8 });
    const flags = recordFlags([
      sessionOf("a", day(1), [loggedSet({ weight_kg: 100, reps: 5 })]),
      sessionOf("b", day(2), [eight]),
    ]);
    expect(flags.get(eight.id)).toContain("reps_8");
    expect(flags.get(eight.id)).not.toContain("heaviest_weight");
  });

  it("ignores warm-ups and unticked sets, on both sides", () => {
    const warmup = loggedSet({ kind: "warmup", weight_kg: 300, reps: 1 });
    const unticked = loggedSet({ completed_at: null, weight_kg: 300, reps: 1 });
    const working = loggedSet({ weight_kg: 105, reps: 5 });
    const flags = recordFlags([
      sessionOf("a", day(1), [warmup, loggedSet({ weight_kg: 100, reps: 5 })]),
      sessionOf("b", day(2), [warmup, unticked, working]),
    ]);
    expect(flags.has(warmup.id)).toBe(false);
    expect(flags.has(unticked.id)).toBe(false);
    expect(flags.get(working.id)).toContain("heaviest_weight");
  });

  it("puts a session-volume Record on the exercise's last Counted set", () => {
    const one = loggedSet({ weight_kg: 50, reps: 10 });
    const two = loggedSet({ weight_kg: 50, reps: 10 });
    const flags = recordFlags([
      sessionOf("a", day(1), [loggedSet({ weight_kg: 50, reps: 10 })]),
      sessionOf("b", day(2), [one, two]),
    ]);
    expect(flags.get(one.id) ?? []).not.toContain("session_volume");
    expect(flags.get(two.id)).toContain("session_volume");
  });

  it("orders Sessions by start then id, whatever order they come in", () => {
    const late = loggedSet({ weight_kg: 110, reps: 5 });
    const early = loggedSet({ weight_kg: 100, reps: 5 });
    const flags = recordFlags([sessionOf("b", day(5), [late]), sessionOf("a", day(1), [early])]);
    expect(flags.has(late.id)).toBe(true);
    expect(flags.has(early.id)).toBe(false);
  });

  it("keeps Records consistent after a middle Session is deleted", () => {
    const a = loggedSet({ weight_kg: 100, reps: 5 });
    const b = loggedSet({ weight_kg: 120, reps: 5 });
    const c = loggedSet({ weight_kg: 110, reps: 5 });
    const all = [
      sessionOf("a", day(1), [a]),
      sessionOf("b", day(2), [b]),
      sessionOf("c", day(3), [c]),
    ];
    expect(recordFlags(all).has(c.id)).toBe(false);
    const withoutMiddle = all.filter((session) => session.id !== "b");
    expect(recordFlags(withoutMiddle).get(c.id)).toContain("heaviest_weight");
  });

  it("scores exercises separately", () => {
    const squat = loggedSet({ exercise_id: "squat", weight_kg: 140, reps: 5 });
    const flags = recordFlags([
      sessionOf("a", day(1), [loggedSet({ weight_kg: 100, reps: 5 })]),
      sessionOf("b", day(2), [squat]),
    ]);
    expect(flags.size).toBe(0);
  });

  it("flags longest duration, longest distance and best pace on timed types", () => {
    const run = (id: string, distance: number, duration: number) =>
      setOf("distance_duration", "working", {
        id,
        exercise_id: "run",
        weight_kg: null,
        reps: null,
        distance_m: distance,
        duration_s: duration,
      });
    const flags = recordFlags([
      sessionOf("a", day(1), [run("r1", 5000, 1800)]),
      sessionOf("b", day(2), [run("r2", 5000, 1700)]),
      sessionOf("c", day(3), [run("r3", 6000, 2400)]),
    ]);
    expect(flags.get("r2")).toEqual(["best_pace"]);
    expect(flags.get("r3")).toEqual(
      expect.arrayContaining(["longest_distance", "longest_duration"]),
    );
    expect(flags.get("r3")).not.toContain("best_pace");
  });

  it("uses the bodyweight for bodyweight types, and flags no weight records without one", () => {
    const before = setOf("bodyweight_reps", "working", {
      exercise_id: "pushup",
      weight_kg: null,
      reps: 10,
    });
    const after = setOf("bodyweight_reps", "working", {
      exercise_id: "pushup",
      weight_kg: null,
      reps: 12,
    });
    const history = [sessionOf("a", day(1), [before]), sessionOf("b", day(2), [after])];
    expect(recordFlags(history).size).toBe(0);
    expect(recordFlags(history, 80).get(after.id)).toContain("set_volume");
  });
});
