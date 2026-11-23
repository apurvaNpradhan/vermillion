import type { LoggedSet } from "@workspace/shared";
import type { FinishedSession } from "@workspace/sync";
import { describe, expect, it } from "vitest";

import { buildPeriodReport } from "../report/period-report";
import { sessionRecords } from "./session-records";

let counter = 0;
const lift = (weight: number, reps: number): LoggedSet => {
  counter += 1;
  return {
    id: `set-${counter}`,
    exercise_id: "bench",
    exercise_type: "weight_reps",
    kind: "working",
    completed_at: "2026-01-01T00:00:00Z",
    weight_kg: weight,
    reps,
    duration_s: null,
    distance_m: null,
    floors: null,
    steps: null,
  };
};
const session = (id: string, started_at: string, sets: LoggedSet[]): FinishedSession => ({
  id,
  started_at,
  finished_at: started_at,
  pausedMs: 0,
  durationS: 3600,
  workoutId: null,
  title: "Push",
  sets,
});

describe("sessionRecords", () => {
  const first = session("first", "2026-09-01T10:00:00Z", [lift(60, 5)]);
  const second = session("second", "2026-09-15T10:00:00Z", [lift(80, 5)]);
  const third = session("third", "2026-10-05T10:00:00Z", [lift(70, 5)]);
  const all = [first, second, third];

  it("does not count a Record an earlier Session set", () => {
    // `second` beat `first`; `third` beat nothing, so it shows none even though the history holds one.
    expect(sessionRecords({ history: all, session: third, bodyweightKg: null }).total).toBe(0);
    expect(
      sessionRecords({ history: all, session: second, bodyweightKg: null }).total,
    ).toBeGreaterThan(0);
  });

  it("adds up to the month report's Records", () => {
    const report = buildPeriodReport({
      period: { kind: "month", start: Date.UTC(2026, 8, 1) },
      sessions: all,
      exercises: [{ id: "bench", title: "Bench", primary_muscle: "chest", secondary_muscles: [] }],
      timezone: "UTC",
      weekStart: "monday",
      goal: null,
      today: Date.UTC(2026, 10, 20),
    });
    const summed = [first, second].reduce(
      (sum, item) =>
        sum + sessionRecords({ history: all, session: item, bodyweightKg: null }).total,
      0,
    );
    expect(report.records).toBe(summed);
  });
});
