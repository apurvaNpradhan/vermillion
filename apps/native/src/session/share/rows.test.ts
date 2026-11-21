import type { SessionDetail } from "@workspace/sync";
import { describe, expect, it } from "vitest";

import { compactRows, MAX_ROWS, rowMetrics, shareRows } from "./rows";
import { bodyIntensity, topMuscles } from "./muscles";

const drawn = (muscle: string): muscle is "chest" | "triceps" =>
  muscle === "chest" || muscle === "triceps";
import { sessionDuration } from "./stats";

type Entry = SessionDetail["exercises"][number];
type SetDetail = Entry["sets"][number];

const set = (id: string, values: Partial<SetDetail> = {}): SetDetail => ({
  id,
  position: id,
  kind: "working",
  weightKg: 100,
  reps: 5,
  durationS: null,
  distanceM: null,
  floors: null,
  steps: null,
  rpe: null,
  completedAt: "2026-11-16T10:00:00Z",
  timerStartedAt: null,
  generatedWarmup: false,
  target: null,
  ...values,
});
const entry = (id: string, sets: SetDetail[], extra: Partial<Entry> = {}): Entry => ({
  id,
  exerciseId: `ex-${id}`,
  title: `Exercise ${id}`,
  type: "weight_reps",
  sourceWorkoutExerciseId: null,
  position: id,
  restSeconds: null,
  note: null,
  supersetGroup: null,
  logEffort: false,
  progressionPerSet: false,
  autoWarmups: false,
  pinnedNote: null,
  lastNote: null,
  warmupKey: null,
  repeated: false,
  barId: null,
  exercise: null,
  sets,
  ...extra,
});
const session = (exercises: Entry[]): SessionDetail => ({
  id: "s",
  workoutId: null,
  programId: null,
  runId: null,
  slotId: null,
  cycle: null,
  title: "Push",
  titleDerived: false,
  workoutStructure: null,
  note: null,
  workoutNote: null,
  startedAt: "2026-11-16T10:00:00Z",
  finishedAt: "2026-11-16T11:00:00Z",
  durationS: null,
  deviceId: "d",
  rest: null,
  exercises,
});

describe("share rows", () => {
  it("counts only ticked working sets and leaves warm-ups out", () => {
    const rows = shareRows(
      session([
        entry("a", [
          set("a1", { kind: "warmup", weightKg: 20 }),
          set("a2"),
          set("a3", { weightKg: 105, reps: 3 }),
          set("a4", { completedAt: null, weightKg: 200 }),
        ]),
      ]),
      new Set(),
      true,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sets: 2,
      detail: { kind: "best", set: { weightKg: 105, reps: 3 } },
    });
  });

  it("drops an exercise with only warm-ups or unticked sets", () => {
    const rows = shareRows(
      session([
        entry("a", [set("a1", { kind: "warmup" })]),
        entry("b", [set("b1", { completedAt: null })]),
        entry("c", [set("c1")]),
      ]),
      new Set(),
      true,
    );
    expect(rows.map((row) => row.id)).toEqual(["c"]);
  });

  it("marks a row whose Counted set set a Record", () => {
    const rows = shareRows(
      session([entry("a", [set("a1"), set("a2")]), entry("b", [set("b1")])]),
      new Set(["a2"]),
      true,
    );
    expect(rows.map((row) => row.record)).toEqual([true, false]);
  });

  it("never flags a warm-up's Record", () => {
    const rows = shareRows(
      session([entry("a", [set("a1", { kind: "warmup" }), set("a2")])]),
      new Set(["a1"]),
      true,
    );
    expect(rows[0]?.record).toBe(false);
  });

  it("counts warm-ups, their Records and a warm-up-only exercise when they are counted", () => {
    const warmups = session([
      entry("a", [set("a1", { kind: "warmup", weightKg: 20 }), set("a2")]),
      entry("b", [set("b1", { kind: "warmup" })]),
    ]);
    expect(shareRows(warmups, new Set(["a1"]), true, true)).toMatchObject([
      { id: "a", sets: 2, record: true },
      { id: "b", sets: 1, record: false },
    ]);
    expect(shareRows(warmups, new Set(["a1"]), true, false)).toMatchObject([
      { id: "a", sets: 1, record: false },
    ]);
  });

  it("shows rep ranges when weights are off", () => {
    const rows = shareRows(
      session([entry("a", [set("a1", { reps: 8 }), set("a2", { reps: 5 })])]),
      new Set(),
      false,
    );
    expect(rows[0]?.detail).toEqual({ kind: "reps", min: 5, max: 8 });
  });
});

describe("row compaction", () => {
  const rows = (count: number) => Array.from({ length: count }, (_, at) => at);

  it("keeps up to 12 rows without a remainder", () => {
    expect(compactRows(rows(MAX_ROWS))).toEqual({ shown: rows(12), more: 0 });
    expect(compactRows(rows(3))).toEqual({ shown: rows(3), more: 0 });
  });

  it("says how many more beyond 12", () => {
    const { shown, more } = compactRows(rows(15));
    expect(shown).toHaveLength(12);
    expect(more).toBe(3);
    expect(compactRows(rows(13)).more).toBe(1);
  });

  it("shrinks rows as they grow in number but always fits 12 under the header", () => {
    expect(rowMetrics(4).height).toBeGreaterThan(rowMetrics(8).height);
    expect(rowMetrics(8).height).toBeGreaterThan(rowMetrics(12).height);
    // 1920 − 168 top − 168 footer − 618 for the heading, stats, Records chip and gaps leaves 966
    // for the rows and the "+N more" line (64).
    expect(rowMetrics(12).height * 12 + 64).toBeLessThanOrEqual(966);
    expect(rowMetrics(9).height * 9).toBeLessThanOrEqual(966);
    expect(rowMetrics(6).height * 6).toBeLessThanOrEqual(966);
  });
});

describe("muscles and duration", () => {
  const loads = [
    { muscle: "chest", sets: 9 },
    { muscle: "triceps", sets: 4.5 },
    { muscle: "shoulders", sets: 3 },
    { muscle: "biceps", sets: 1 },
  ] as const;

  it("ranks the top three", () => {
    expect(topMuscles(loads).map((load) => load.muscle)).toEqual(["chest", "triceps", "shoulders"]);
  });

  it("scales body map heat to the most worked muscle", () => {
    const heat = bodyIntensity(loads, drawn);
    expect(heat.chest).toBe(1);
    expect(heat.triceps).toBe(0.5);
    expect(Object.keys(heat)).toEqual(["chest", "triceps"]);
    expect(bodyIntensity([], drawn)).toEqual({});
  });

  it("takes the override duration, else start to finish", () => {
    expect(
      sessionDuration({ durationS: 1800, startedAt: "2026-11-16T10:00:00Z", finishedAt: null }),
    ).toBe(1800);
    expect(
      sessionDuration({
        durationS: null,
        startedAt: "2026-11-16T10:00:00Z",
        finishedAt: "2026-11-16T11:00:00Z",
      }),
    ).toBe(3600);
    expect(
      sessionDuration({ durationS: null, startedAt: "2026-11-16T10:00:00Z", finishedAt: null }),
    ).toBe(0);
  });
});
