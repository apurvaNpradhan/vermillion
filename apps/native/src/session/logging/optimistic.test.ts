import type { SessionDetail, SessionExerciseDetail, SessionSetDetail } from "@workspace/sync";
import { describe, expect, it } from "vitest";

import {
  NO_PENDING,
  nudged,
  previewTick,
  settled,
  settleTick,
  withPending,
  type PendingWrite,
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

describe("pending writes", () => {
  const later = "2026-01-01T10:00:01.000Z";
  const rest = { setId: "set-1", startedAt: NOW, endsAt: "2026-01-01T10:01:30.000Z" };
  const before = set({ weightKg: 60, reps: 8 });
  const ticked = { ...before, completedAt: NOW };
  const stored = session([before]);
  const tick: PendingWrite = {
    id: Symbol(),
    set: { id: before.id, before, value: { completedAt: NOW } },
  };
  const savedTick = { ...tick, saved: true, rest: { before: null, value: { value: rest } } };
  const untick: PendingWrite = {
    id: Symbol(),
    set: { id: before.id, before: ticked, value: { completedAt: null } },
    rest: { before: rest, value: { clearFor: before.id } },
  };
  const edit: PendingWrite = {
    id: Symbol(),
    set: { id: before.id, before: ticked, value: { reps: 9 } },
  };

  it("shows a tick right away and starts rest only when its write succeeds", () => {
    expect(withPending(stored, [tick]).exercises[0]?.sets[0]?.completedAt).toBe(NOW);
    expect(withPending(stored, [tick]).rest).toBeNull();
    expect(withPending(stored, [savedTick]).rest).toEqual(rest);
    expect(withPending(stored, NO_PENDING)).toBe(stored);
  });

  it("accepts the exact tick echo after settlement or when it arrived before settlement", () => {
    const delivered = session([ticked], rest);
    expect(settled([tick], delivered)).toEqual([tick]);
    expect(settled([savedTick], delivered)).toEqual([]);
    expect(settled([savedTick], session([{ ...ticked, completedAt: later }], rest))).toMatchObject([
      { set: { value: { completedAt: NOW } }, rest: undefined },
    ]);
  });

  it("keeps the later untick through a late tick echo, even when the stored baseline is unticked", () => {
    const savedUntick = { ...untick, saved: true };
    const pending = [savedTick, savedUntick];
    expect(settled(pending, stored)).toBe(pending);
    const echoedTick = session([ticked], rest);
    const remaining = settled(pending, echoedTick);
    expect(remaining).toEqual([savedUntick]);
    expect(withPending(echoedTick, remaining).exercises[0]?.sets[0]?.completedAt).toBeNull();
    expect(withPending(echoedTick, remaining).rest).toBeNull();
    expect(settled(remaining, stored)).toEqual([]);
  });

  it("keeps a retick through an echo for a prior completion of the same set", () => {
    const retick: PendingWrite = {
      ...tick,
      saved: true,
      id: Symbol(),
      set: { id: before.id, before, value: { completedAt: later } },
    };
    const pending = [savedTick, { ...untick, saved: true }, retick];
    const remaining = settled(pending, session([ticked], rest));
    expect(remaining).toEqual(pending.slice(1));
    expect(settled(remaining, session([{ ...ticked, completedAt: later }]))).toEqual([]);
  });

  it("settles overlapping edits when the watch only returns their final values", () => {
    const savedEdit = { ...edit, saved: true };
    const laterEdit: PendingWrite = {
      id: Symbol(),
      set: { id: before.id, before: { ...ticked, reps: 9 }, value: { reps: 10 } },
      saved: true,
    };
    expect(
      settled([savedTick, savedEdit, laterEdit], session([{ ...ticked, reps: 10 }], rest)),
    ).toEqual([]);
  });

  it("does not drop a tick on the earlier keypad echo", () => {
    const typed = { ...before, reps: 9 };
    const savedEdit = { ...edit, saved: true };
    const pending = [savedEdit, savedTick];
    const keyed = session([typed]);
    const remaining = settled(pending, keyed);
    expect(remaining).toEqual([savedTick]);
    expect(withPending(keyed, remaining).exercises[0]?.sets[0]).toMatchObject({
      reps: 9,
      completedAt: NOW,
    });
  });

  it("rolls back each failed write without reverting a different write", () => {
    expect(withPending(stored, [tick, edit]).exercises[0]?.sets[0]).toMatchObject({
      reps: 9,
      completedAt: NOW,
    });
    expect(withPending(stored, [edit]).exercises[0]?.sets[0]).toMatchObject({
      reps: 9,
      completedAt: null,
    });
    expect(withPending(stored, [savedTick]).exercises[0]?.sets[0]).toMatchObject({
      reps: 8,
      completedAt: NOW,
    });
    expect(withPending(stored, [savedTick, untick]).rest).toBeNull();
    expect(withPending(stored, [savedTick]).rest).toEqual(rest);
  });
});

describe("nudged", () => {
  const rest = { setId: "set-1", startedAt: NOW, endsAt: "2026-01-01T10:01:00.000Z" };

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
        completedAt: NOW,
        values: {},
        rest: { startedAt: NOW, endsAt: NOW },
      }),
    ).toEqual({ outcome: "recorded", keepSet: true, keepRest: true });
  });

  it("takes back only the Rest the store did not start", () => {
    expect(settleTick({ ok: true, wrote: true, completedAt: NOW, values: {} })).toEqual({
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
