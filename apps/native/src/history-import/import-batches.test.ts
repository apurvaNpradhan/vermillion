import type { PlannedImportSession } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { batchSessions, countSets } from "./import-batches";

const session = (sets: number): PlannedImportSession => ({
  key: String(sets),
  title: "t",
  note: null,
  startedAt: "2026-03-02T10:00:00.000Z",
  durationS: null,
  exercises: [
    {
      exerciseId: "e",
      title: "e",
      type: "weight_reps",
      note: null,
      supersetKey: null,
      logEffort: false,
      sets: Array.from({ length: sets }, () => ({
        kind: "working" as const,
        weightKg: 1,
        reps: 1,
        durationS: null,
        distanceM: null,
        rpe: null,
      })),
    },
  ],
});

describe("batchSessions", () => {
  it("keeps whole Sessions and respects both limits", () => {
    const all = [session(10), session(10), session(10), session(10), session(10)];
    expect(batchSessions(all, 2, 1000).map((batch) => batch.length)).toEqual([2, 2, 1]);
    expect(batchSessions(all, 10, 25).map((batch) => batch.length)).toEqual([2, 2, 1]);
  });

  it("puts an oversized Session in a batch of its own", () => {
    const batches = batchSessions([session(5), session(50), session(5)], 10, 20);
    expect(batches.map((batch) => batch.length)).toEqual([1, 1, 1]);
  });

  it("returns no batches for nothing", () => {
    expect(batchSessions([], 5, 5)).toEqual([]);
    expect(countSets([session(3), session(4)])).toBe(7);
  });
});
