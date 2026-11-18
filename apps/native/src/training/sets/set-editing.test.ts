import type { PlannedSet } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { newSetIds, reconcileSetIds, removeSetAt, replaceSet } from "./set-editing";

const set = (reps: number): PlannedSet => ({ kind: "working", reps_min: reps, reps_max: reps });

describe("reconcileSetIds", () => {
  const sets = [set(5), set(6), set(7)];
  const ids = newSetIds(sets);

  it("keeps the ids of the sets that stay when one in the middle is removed", () => {
    const next = removeSetAt(sets, 1);
    expect(reconcileSetIds(sets, ids, next)).toEqual([ids[0], ids[2]]);
  });

  it("keeps a row's id when its set is edited", () => {
    const next = replaceSet(sets, 1, { ...set(6), weight_kg: 50 });
    expect(reconcileSetIds(sets, ids, next)).toEqual(ids);
  });

  it("gives an added set a new id", () => {
    const next = [...sets, set(8)];
    const result = reconcileSetIds(sets, ids, next);
    expect(result.slice(0, 3)).toEqual(ids);
    expect(ids).not.toContain(result[3]);
  });

  it("keeps ids when the list is re-read as copies of the same length", () => {
    const copies = sets.map((item) => ({ ...item }));
    expect(reconcileSetIds(sets, ids, copies)).toEqual(ids);
  });
});
