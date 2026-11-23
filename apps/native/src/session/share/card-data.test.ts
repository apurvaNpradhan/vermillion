import type { SessionDetail } from "@workspace/sync";
import { describe, expect, it } from "vitest";

import { buildCardData, type SessionCardLabels } from "./card-data";

const labels: SessionCardLabels = {
  unit: "kg",
  unitLabel: "kg",
  reps: (n) => `${n} reps`,
  distance: (m) => `${m} m`,
  floors: (n) => `${n} floors`,
  steps: (n) => `${n} steps`,
  repRange: (min, max) => `${min}–${max} reps`,
  weightReps: (weight, reps) => `${weight} kg × ${reps}`,
  date: () => "Monday 16 November · Evening",
  statLabel: (id) => id,
  volume: (kg) => ({ value: String(kg), unit: "kg" }),
  records: (n) => `${n} Records`,
  rowSummary: (sets, detail, kind) =>
    kind === "best" ? `${sets} sets · best ${detail}` : `${sets} sets · ${detail}`,
  more: (n) => `+${n} more`,
  muscleName: (m) => m,
  muscleSets: (n) => `${n} sets`,
};

const set = (
  id: string,
  values: Partial<SessionDetail["exercises"][number]["sets"][number]> = {},
) => ({
  id,
  position: id,
  kind: "working" as const,
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
const exercise = (n: number): SessionDetail["exercises"][number] => ({
  id: `e${n}`,
  exerciseId: `x${n}`,
  title: `Exercise ${n}`,
  type: "weight_reps",
  sourceWorkoutExerciseId: null,
  position: String(n).padStart(3, "0"),
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
  exercise: {
    primaryMuscle: "chest",
    secondaryMuscles: [],
    equipment: "barbell",
    thumbnailKey: null,
  },
  sets: [set(`s${n}a`, { kind: "warmup", weightKg: 20 }), set(`s${n}b`), set(`s${n}c`)],
});
const session = (count: number): SessionDetail => ({
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
  startedAt: "2026-11-16T17:00:00Z",
  finishedAt: "2026-11-16T17:52:10Z",
  durationS: null,
  deviceId: "d",
  rest: null,
  pausedAt: null,
  pausedMs: 0,
  exercises: Array.from({ length: count }, (_, at) => exercise(at + 1)),
});
const distribution = [{ id: "x1", primary_muscle: "chest" as const, secondary_muscles: [] }];
const base = {
  flagged: new Map(),
  bodyweightKg: null,
  distribution,
  labels,
};
const on = { weights: true, exercises: true, photo: false };

describe("session card data", () => {
  it("builds the stats from Counted sets only", () => {
    const data = buildCardData({ ...base, session: session(1), toggles: on });
    expect(data.stats).toEqual([
      { id: "duration", label: "duration", value: "52:10" },
      { id: "volume", label: "volume", value: "1000", unit: "kg" },
      { id: "sets", label: "sets", value: "2" },
    ]);
    expect(data.exercises?.items[0]?.summary).toBe("2 sets · best 100 kg × 5");
  });

  it("hides volume and weights when Show weights is off", () => {
    const data = buildCardData({
      ...base,
      session: session(1),
      toggles: { ...on, weights: false },
    });
    expect(data.stats.map((stat) => stat.id)).toEqual(["duration", "sets"]);
    expect(data.exercises?.items[0]?.summary).toBe("2 sets · 5–5 reps");
  });

  it("hides the rows when Show exercises is off", () => {
    expect(
      buildCardData({ ...base, session: session(3), toggles: { ...on, exercises: false } })
        .exercises,
    ).toBeNull();
  });

  it("says how many exercises beyond 12 are left out", () => {
    const data = buildCardData({ ...base, session: session(15), toggles: on });
    expect(data.exercises?.items).toHaveLength(12);
    expect(data.exercises?.more).toBe("+3 more");
    expect(
      buildCardData({ ...base, session: session(12), toggles: on }).exercises?.more,
    ).toBeNull();
  });

  it("counts Records only when there are any", () => {
    expect(buildCardData({ ...base, session: session(2), toggles: on }).records).toBeNull();
    const flagged: Parameters<typeof buildCardData>[0]["flagged"] = new Map([
      ["s1a", ["heaviest_weight"]],
      ["s1b", ["heaviest_weight", "set_volume"]],
      ["s2c", ["heaviest_weight"]],
    ]);
    const data = buildCardData({ ...base, flagged, session: session(2), toggles: on });
    expect(data.records).toBe("3 Records");
    expect(data.exercises?.items.map((item) => item.record)).toEqual([true, true]);
  });

  it("agrees with the warm-up setting for a warm-up-only session, both ways", () => {
    const warm = session(1);
    warm.exercises[0] = {
      ...exercise(1),
      sets: [set("w1", { kind: "warmup" }), set("w2", { kind: "warmup" })],
    };
    const flagged: Parameters<typeof buildCardData>[0]["flagged"] = new Map([
      ["w1", ["heaviest_weight"]],
    ]);
    const without = buildCardData({ ...base, flagged, session: warm, toggles: on });
    expect(without.stats.find((stat) => stat.id === "sets")?.value).toBe("0");
    expect(without.records).toBeNull();
    expect(without.exercises?.items).toEqual([]);
    const counted = buildCardData({
      ...base,
      flagged,
      session: warm,
      toggles: on,
      countWarmups: true,
    });
    expect(counted.stats.find((stat) => stat.id === "sets")?.value).toBe("2");
    expect(counted.records).toBe("1 Records");
    expect(counted.exercises?.items).toHaveLength(1);
  });

  it("ranks muscles for the Muscles card", () => {
    const data = buildCardData({ ...base, session: session(1), toggles: on });
    expect(data.muscles).toEqual([{ name: "chest", sets: "2 sets", share: 1 }]);
  });
});
