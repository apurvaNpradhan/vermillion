import type { LoggedSet, SessionHistory } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { tickedSetIsRecord } from "./record-on-tick";

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
        history,
        session,
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
        history,
        session,
        sets: [set("n1", { weight_kg: 100 })],
        setId: "n1",
        bodyweightKg: null,
      }),
    ).toBe(false);
    expect(
      tickedSetIsRecord({
        history,
        session,
        sets: [set("n1", { weight_kg: 90, reps: 5 })],
        setId: "n1",
        bodyweightKg: null,
      }),
    ).toBe(false);
  });

  it("is never one in the first Session of an exercise, nor for a warm-up", () => {
    expect(
      tickedSetIsRecord({
        history: [],
        session,
        sets: [set("n1")],
        setId: "n1",
        bodyweightKg: null,
      }),
    ).toBe(false);
    const history = [finished([set("o1", { weight_kg: 100 })])];
    expect(
      tickedSetIsRecord({
        history,
        session,
        sets: [set("n1", { kind: "warmup", weight_kg: 300 })],
        setId: "n1",
        bodyweightKg: null,
      }),
    ).toBe(false);
  });
});
