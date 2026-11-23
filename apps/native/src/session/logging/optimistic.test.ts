import type { SessionDetail, SessionExerciseDetail, SessionSetDetail } from "@workspace/sync";
import { describe, expect, it } from "vitest";

import {
  NO_PENDING,
  nudged,
  previewTick,
  restFrom,
  restKey,
  setKey,
  settled,
  settleTick,
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
  generatedWarmup: false,
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
    progressionPerSet: false,
    autoWarmups: false,
    pinnedNote: null,
    lastNote: null,
    warmupKey: null,
    repeated: false,
    barId: null,
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
    workoutStructure: null,
    note: null,
    workoutNote: null,
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

  it("keeps a completion preview through an earlier keypad-write snapshot", () => {
    const pendingAfterTyping: Pending = {
      sets: new Map([
        [
          "set-1",
          {
            before: setKey(set()),
            change: { completedAt: NOW, weightKg: 60, reps: 8 },
            awaitFields: true,
          },
        ],
      ]),
      rest: null,
    };
    const keyed = session([set({ weightKg: 60, reps: 8 })]);
    expect(settled(pendingAfterTyping, keyed)).toBe(pendingAfterTyping);
    expect(withPending(keyed, pendingAfterTyping).exercises[0]?.sets[0]?.completedAt).toBe(NOW);

    const committed = session([
      set({ weightKg: 60, reps: 8, completedAt: "2026-01-01T10:00:01.000Z" }),
    ]);
    expect(settled(pendingAfterTyping, committed).sets.size).toBe(0);
    expect(withPending(committed, pendingAfterTyping)).toBe(committed);
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

describe("previewTick", () => {
  it("shows the tick with the Ghost values the store will adopt", () => {
    expect(previewTick(set({ reps: 6 }), "weight_reps", { weight: 60, reps: 8 }, NOW)).toEqual({
      kind: "ok",
      change: { completedAt: NOW, timerStartedAt: null, weightKg: 60 },
    });
  });

  it("refuses with the cells that lack a value, before anything is written", () => {
    expect(previewTick(set(), "weight_reps", { weight: 60 }, NOW)).toEqual({
      kind: "refused",
      missing: ["reps"],
    });
  });

  it("does nothing for a set that is already ticked", () => {
    expect(previewTick(set({ completedAt: NOW }), "weight_reps", {}, NOW)).toEqual({
      kind: "noop",
    });
  });
});

describe("settleTick", () => {
  it("keeps the tick and its Rest when the write held and started one", () => {
    expect(
      settleTick({
        ok: true,
        wrote: true,
        values: {},
        rest: { startedAt: NOW, endsAt: NOW },
      }),
    ).toEqual({ outcome: "recorded", keepSet: true, keepRest: true });
  });

  it("takes back only the Rest the store did not start", () => {
    expect(settleTick({ ok: true, wrote: true, values: {} })).toEqual({
      outcome: "recorded",
      keepSet: true,
      keepRest: false,
    });
  });

  it("takes everything back when the write failed", () => {
    expect(settleTick(null)).toEqual({ outcome: "failed", keepSet: false, keepRest: false });
  });

  it("takes everything back for a refusal or a write that changed nothing", () => {
    expect(settleTick({ ok: false, missing: ["reps"] })).toEqual({
      outcome: "refused",
      keepSet: false,
      keepRest: false,
    });
    expect(settleTick({ ok: true, wrote: false, values: {} })).toEqual({
      outcome: "unchanged",
      keepSet: false,
      keepRest: false,
    });
  });
});
