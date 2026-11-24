import { describe, expect, it } from "vitest";

import { recordCount, recordEntries, recordFlags } from "./records";
import { loggedSet, sessionOf } from "../logging/session-fixtures";

const day = (n: number) => `2026-01-${String(n).padStart(2, "0")}T10:00:00Z`;
const BENCH_KEYS = ["heaviest_weight", "estimated_one_rep_max", "reps_6", "set_volume"];

function summarize(sessions: ReturnType<typeof sessionOf>[]) {
  const last = sessions[sessions.length - 1];
  if (!last) throw new Error("no session");
  const flags = recordFlags(sessions);
  return { flags, entries: recordEntries(flags, last.sets), count: recordCount(flags, last.sets) };
}

describe("recordEntries and recordCount", () => {
  const before = sessionOf("a", day(1), [loggedSet({ weight_kg: 85, reps: 6 })]);

  it("counts a record kind once when several sets beat the best", () => {
    const sets = [1, 2, 3].map(() => loggedSet({ weight_kg: 87.5, reps: 6 }));
    const { flags, entries, count } = summarize([before, sessionOf("b", day(2), sets)]);
    // Every set is a live record chip, but the summary has one entry per kind.
    expect(sets.every((set) => flags.has(set.id))).toBe(true);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.exerciseId).toBe("bench");
    expect(entries[0]?.keys).toEqual(expect.arrayContaining(BENCH_KEYS));
    expect(new Set(entries[0]?.keys).size).toBe(entries[0]?.keys.length);
    // Session volume sits on the last set, so it is counted once as well.
    expect(count).toBe(entries[0]?.keys.length);
    expect(count).toBe(5);
  });

  it("does not count a tie with an earlier set of the same Session again", () => {
    const first = loggedSet({ weight_kg: 90, reps: 6 });
    const tied = loggedSet({ weight_kg: 90, reps: 6 });
    const { entries, count } = summarize([before, sessionOf("b", day(2), [first, tied])]);
    expect(entries).toHaveLength(1);
    expect(count).toBe(entries[0]?.keys.length);
  });

  it("counts nothing for sets that only tie the earlier best", () => {
    const { entries, count } = summarize([
      before,
      sessionOf("b", day(2), [loggedSet({ weight_kg: 85, reps: 6 })]),
    ]);
    expect(entries).toEqual([]);
    expect(count).toBe(0);
  });

  it("keeps one entry per exercise", () => {
    const squatBefore = loggedSet({ exercise_id: "squat", weight_kg: 100, reps: 5 });
    const history = sessionOf("a", day(1), [loggedSet({ weight_kg: 85, reps: 6 }), squatBefore]);
    const sets = [
      loggedSet({ weight_kg: 87.5, reps: 6 }),
      loggedSet({ exercise_id: "squat", weight_kg: 110, reps: 5 }),
      loggedSet({ weight_kg: 90, reps: 6 }),
      loggedSet({ exercise_id: "squat", weight_kg: 112.5, reps: 5 }),
    ];
    const { entries, count } = summarize([history, sessionOf("b", day(2), sets)]);
    expect(entries.map((entry) => entry.exerciseId)).toEqual(["bench", "squat"]);
    expect(count).toBe(entries.reduce((sum, entry) => sum + entry.keys.length, 0));
  });

  it("merges the different kinds won by different sets of one exercise", () => {
    // The heavy single wins heaviest weight; the volume set wins set volume.
    const heavy = loggedSet({ weight_kg: 95, reps: 1 });
    const volume = loggedSet({ weight_kg: 80, reps: 12 });
    const { flags, entries } = summarize([before, sessionOf("b", day(2), [heavy, volume])]);
    expect(flags.get(heavy.id)).toContain("heaviest_weight");
    expect(flags.get(volume.id)).toContain("set_volume");
    expect(entries).toHaveLength(1);
    expect(entries[0]?.keys).toEqual(expect.arrayContaining(["heaviest_weight", "set_volume"]));
  });
});
