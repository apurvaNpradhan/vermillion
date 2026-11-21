import {
  exerciseRecords,
  recordFlags,
  type LoggedSet,
  type SessionHistory,
} from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { createRecordBestsCache, tickedSetIsRecord } from "./record-on-tick";

const set = (id: string, overrides: Partial<LoggedSet> = {}): LoggedSet => ({
  id,
  exercise_id: "bench",
  exercise_type: "weight_reps",
  kind: "working",
  completed_at: "2026-01-08T10:00:00.000Z",
  weight_kg: 100,
  reps: 5,
  ...overrides,
});
const finished = (sets: LoggedSet[]): SessionHistory => ({
  id: "old",
  started_at: "2026-01-01T10:00:00.000Z",
  finished_at: "2026-01-01T11:00:00.000Z",
  sets,
});
const session = { id: "now", startedAt: "2026-01-08T09:00:00.000Z" };

describe("tickedSetIsRecord", () => {
  it("is a Record when the set beats every earlier Session", () => {
    const history = [finished([set("o1", { weight_kg: 100 })])];
    expect(
      tickedSetIsRecord({
        bests: exerciseRecords(history),
        sets: [set("n1", { weight_kg: 105 })],
        setId: "n1",
        bodyweightKg: null,
      }),
    ).toBe(true);
  });

  it("is not one when it only ties or falls short", () => {
    const history = [finished([set("o1", { weight_kg: 100 })])];
    expect(
      tickedSetIsRecord({
        bests: exerciseRecords(history),
        sets: [set("n1", { weight_kg: 100 })],
        setId: "n1",
        bodyweightKg: null,
      }),
    ).toBe(false);
    expect(
      tickedSetIsRecord({
        bests: exerciseRecords(history),
        sets: [set("n1", { weight_kg: 90, reps: 5 })],
        setId: "n1",
        bodyweightKg: null,
      }),
    ).toBe(false);
  });

  it("is never one in the first Session of an exercise, nor for a warm-up", () => {
    expect(
      tickedSetIsRecord({
        bests: new Map(),
        sets: [set("n1")],
        setId: "n1",
        bodyweightKg: null,
      }),
    ).toBe(false);
    const history = [finished([set("o1", { weight_kg: 100 })])];
    expect(
      tickedSetIsRecord({
        bests: exerciseRecords(history),
        sets: [set("n1", { kind: "warmup", weight_kg: 300 })],
        setId: "n1",
        bodyweightKg: null,
      }),
    ).toBe(false);
  });
});

it("uses the same session volume record and bodyweight inputs as finish", () => {
  const history = [
    finished([set("o1", { exercise_type: "bodyweight_reps", weight_kg: null, bodyweight_kg: 75 })]),
  ];
  const sets = [
    set("n1", { exercise_type: "bodyweight_reps", weight_kg: null }),
    set("n2", { exercise_type: "bodyweight_reps", weight_kg: null }),
  ];
  const bodyweightKg = 70;
  const finishedFlags = recordFlags(
    [...history, { id: session.id, started_at: session.startedAt, finished_at: null, sets }],
    bodyweightKg,
  );
  expect(finishedFlags.get("n2")).toContain("session_volume");
  expect(
    tickedSetIsRecord({
      bests: exerciseRecords(history),
      sets,
      setId: "n2",
      bodyweightKg,
    }),
  ).toBe(finishedFlags.has("n2"));
});

it("shares pending and cached bests and ignores reads invalidated in flight", async () => {
  const first = Promise.withResolvers<ReturnType<typeof exerciseRecords>>();
  const bests = exerciseRecords([finished([set("o1")])]);
  let reads = 0;
  const cache = createRecordBestsCache(async () => {
    reads += 1;
    return reads === 1 ? first.promise : bests;
  });
  const cold = cache.get("bench");
  expect(cache.get("bench")).toBe(cold);
  expect(cold.value).toBeNull();
  cache.clear();
  first.resolve(new Map());
  expect(await cold.ready).toBeNull();

  const next = cache.get("bench");
  expect(await next.ready).toBe(bests);
  expect(cache.get("bench").value).toBe(bests);
  expect(reads).toBe(2);
});
