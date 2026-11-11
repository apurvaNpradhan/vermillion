import type { SessionDetail, SessionExerciseDetail, SessionSetDetail } from "@workspace/sync";
import { describe, expect, it } from "vitest";

import {
  NO_PENDING,
  nudged,
  restFrom,
  restKey,
  setKey,
  settled,
  tickChange,
  withPending,
  type Pending,
} from "./optimistic";

const NOW = "2026-01-01T10:00:00.000Z";

const set = (overrides: Partial<SessionSetDetail> = {}): SessionSetDetail => ({
  id: "set-1",
  position: "a0",
  kind: "working",
  weightKg: null,
  reps: null,
  durationS: null,
  distanceM: null,
  floors: null,
  steps: null,
  rpe: null,
  completedAt: null,
  timerStartedAt: null,
  target: null,
  ...overrides,
});

const session = (sets: SessionSetDetail[], rest: SessionDetail["rest"] = null): SessionDetail => {
  const exercise: SessionExerciseDetail = {
    id: "ex-1",
    exerciseId: "squat",
    title: "Squat",
    type: "weight_reps",
    sourceWorkoutExerciseId: null,
    position: "a0",
    restSeconds: 120,
    note: null,
    supersetGroup: null,
    logEffort: false,
    sets,
    exercise: null,
  };
  return {
    id: "s-1",
    workoutId: null,
    programId: null,
    runId: null,
    slotId: null,
    cycle: null,
    title: "Legs",
    titleDerived: false,
    note: null,
    startedAt: NOW,
    finishedAt: null,
    durationS: null,
    deviceId: "me",
    rest,
    exercises: [exercise],
  };
};

describe("tickChange", () => {
  it("adopts Ghost values into empty cells, as the store does", () => {
    expect(tickChange(set({ reps: 6 }), "weight_reps", { weight: 60, reps: 8 }, NOW)).toEqual({
      completedAt: NOW,
      timerStartedAt: null,
      weightKg: 60,
    });
  });

  it("shows nothing for a tick the store refuses or ignores", () => {
    expect(tickChange(set(), "weight_reps", { weight: 60 }, NOW)).toBeNull();
    expect(tickChange(set({ completedAt: NOW }), "weight_reps", {}, NOW)).toBeNull();
  });
});

describe("withPending and settled", () => {
  const stored = session([set()]);
  const pending: Pending = {
    sets: new Map([
      ["set-1", { before: setKey(set()), change: { completedAt: NOW, weightKg: 60, reps: 8 } }],
    ]),
    rest: { before: restKey(null), value: restFrom("set-1", 90, Date.parse(NOW)) },
  };

  it("shows pending changes over the stored Session", () => {
    const shown = withPending(stored, pending);
    expect(shown.exercises[0]?.sets[0]).toMatchObject({ completedAt: NOW, weightKg: 60, reps: 8 });
    expect(shown.rest).toEqual({
      setId: "set-1",
      startedAt: NOW,
      endsAt: "2026-01-01T10:01:30.000Z",
    });
    expect(withPending(stored, NO_PENDING)).toBe(stored);
  });

  it("drops a change once the stored value moves on, and keeps the rest", () => {
    const delivered = session([set({ completedAt: NOW, weightKg: 60, reps: 8 })]);
    const left = settled(pending, delivered);
    expect(left.sets.size).toBe(0);
    expect(left.rest).toBe(pending.rest);
    // A change made against an older value is never shown over a newer one.
    expect(withPending(delivered, pending).exercises[0]?.sets[0]?.completedAt).toBe(NOW);
    expect(settled(NO_PENDING, delivered)).toBe(NO_PENDING);
  });
});

describe("nudged", () => {
  const rest = restFrom("set-1", 60, Date.parse(NOW));

  it("caps the actual end time at 600 seconds from now", () => {
    expect(nudged(rest, 1000, Date.parse(NOW))?.endsAt).toBe("2026-01-01T10:10:00.000Z");
  });

  it("moves the end and ends the Rest when pulled to now", () => {
    expect(nudged(rest, 15, Date.parse(NOW))?.endsAt).toBe("2026-01-01T10:01:15.000Z");
    expect(nudged(rest, -60, Date.parse(NOW))).toBeNull();
    expect(nudged(null, 15, Date.parse(NOW))).toBeNull();
  });
});
