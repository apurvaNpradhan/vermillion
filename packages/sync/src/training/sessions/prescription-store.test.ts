import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  latestAdjustment,
  prescriptionSchema,
  type AdjustmentLoads,
  type PrescriptionDraft,
} from "@workspace/shared";
import { pushWorkout, setupSessions, SQUAT, type Sessions } from "./session-fixtures";
import {
  capturePrescription,
  revisePrescription,
  undoSessionAdjustment,
} from "./prescription-store";
import { addSet, tickSet, untickSet, updateSet } from "./session-content-store";
import { EXERCISE_HISTORY_SQL, parseFinishedSessions } from "./session-watch";
import { finishSession, startSession } from "./session-store";

const loads: AdjustmentLoads = {
  equipment: "barbell",
  type: "weight_reps",
  unit: "kg",
  grid: null,
  weightIncrementKg: 2.5,
};

async function started(s: Sessions) {
  const plan = await pushWorkout(s);
  const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle: "Legs" });
  const [squat] = s.exercises(id);
  const entry = String(squat?.["id"]);
  const [warm, work1, work2] = s.sets(entry).map((row) => String(row["id"]));
  const draft: PrescriptionDraft = {
    exerciseId: SQUAT,
    reason: "add_weight",
    incrementKg: 2.5,
    breakDays: null,
    capKg: null,
    sets: [warm, work1, work2].map((setId, index) => ({
      id: setId ?? "",
      ghosts: index === 0 ? { weight: 40, reps: 10 } : { weight: 100, reps: 8, rpe: 8 },
      outcome: index === 0 ? null : { reason: "add_weight", changeKg: 2.5 },
    })),
  };
  return { id, entry, warm: warm ?? "", work1: work1 ?? "", work2: work2 ?? "", draft };
}

/** Types the reps over the target, then ticks with the loads the screen gives. */
async function logged(s: Sessions, setId: string, reps: number, weight?: number) {
  await updateSet(s.training, setId, {
    reps,
    ...(weight === undefined ? {} : { weight_kg: weight }),
  });
  await tickSet(s.training, setId, {}, undefined, null, undefined, null, loads);
}

const storedRow = z.object({ prescription: z.string().nullable() });

/** The snapshot as the sync layer stores it. */
const stored = (s: Sessions, entry: string) => {
  const { prescription } = storedRow.parse(s.one("session_exercise", entry));
  return prescriptionSchema.parse(JSON.parse(prescription ?? "null"));
};

describe("prescription snapshots", () => {
  it("keeps the first capture and ticks with the stored targets", async () => {
    const s = await setupSessions();
    const t = await started(s);
    const first = await capturePrescription(s.training, t.entry, t.draft);
    const changed = { ...t.draft, capKg: 90 };
    expect(await capturePrescription(s.training, t.entry, changed)).toEqual(first);
    expect(stored(s, t.entry)).toMatchObject({ capKg: null, previousRevision: null });
    // The tick adopts the stored ghost, not the one the caller offers.
    await tickSet(s.training, t.work1, { weight: 50, reps: 3 });
    expect(s.one("session_set", t.work1)).toMatchObject({ weight_kg: 100, reps: 8 });
  });

  it("is refused for a Session of another install and after it finishes", async () => {
    const s = await setupSessions();
    const t = await started(s);
    s.sqlite.prepare("UPDATE training_session SET device_id = 'other' WHERE id = ?").run(t.id);
    expect(await capturePrescription(s.training, t.entry, t.draft)).toBeNull();
    s.sqlite
      .prepare("UPDATE training_session SET device_id = ? WHERE id = ?")
      .run(s.installId, t.id);
    await capturePrescription(s.training, t.entry, t.draft);
    await finishSession(s.training, t.id);
    expect(await undoSessionAdjustment(s.training, t.entry)).toBe(false);
  });

  describe("same-day adjustment", () => {
    it("re-suggests only the unticked sets of that exercise and names the snapshot it replaces", async () => {
      const s = await setupSessions();
      const t = await started(s);
      const before = await capturePrescription(s.training, t.entry, t.draft);
      await tickSet(s.training, t.warm, {}, undefined, null, undefined, null, loads);
      expect(stored(s, t.entry).revision).toBe(before?.revision);
      // A warm-up never triggers.
      await logged(s, t.work1, 5);
      const after = stored(s, t.entry);
      expect(after.revision).not.toBe(before?.revision);
      expect(after.previousRevision).toBe(before?.revision);
      expect(latestAdjustment(after)).toEqual({
        setId: t.work1,
        reason: "reps_short",
        reps: 3,
        moved: [{ id: t.work2, fromKg: 100 }],
      });
      const weight = (index: number) => after.sets[index]?.ghosts.weight;
      expect(weight(0)).toBe(40);
      expect(weight(1)).toBe(100);
      expect(weight(2)).toBeLessThan(100);
      expect(after.sets[2]?.unadjustedWeightKg).toBe(100);
    });

    it("does not adjust when the set hits its target", async () => {
      const s = await setupSessions();
      const t = await started(s);
      await capturePrescription(s.training, t.entry, t.draft);
      // Logged exactly on the target: no deviation.
      await logged(s, t.work1, 8);
      expect(stored(s, t.entry).adjustments).toBeUndefined();
    });

    it("never adjusts without loads, on another install, or in a finished Session", async () => {
      const s = await setupSessions();
      const t = await started(s);
      await capturePrescription(s.training, t.entry, t.draft);
      await updateSet(s.training, t.work1, { reps: 5 });
      await tickSet(s.training, t.work1, {});
      expect(stored(s, t.entry).adjustments).toBeUndefined();
      s.sqlite.prepare("UPDATE training_session SET device_id = 'other' WHERE id = ?").run(t.id);
      await logged(s, t.work2, 5);
      expect(stored(s, t.entry).adjustments).toBeUndefined();
    });

    it("undoes for the Session, restoring unticked targets and stopping further adjustment", async () => {
      const s = await setupSessions();
      const t = await started(s);
      await capturePrescription(s.training, t.entry, t.draft);
      await logged(s, t.work1, 5);
      expect(await undoSessionAdjustment(s.training, t.entry)).toBe(true);
      const after = stored(s, t.entry);
      expect(after.adjustments).toBeUndefined();
      expect(after.adjustmentUndone).toBe(true);
      expect(after.sets[2]?.ghosts.weight).toBe(100);
      expect(await undoSessionAdjustment(s.training, t.entry)).toBe(false);
      await logged(s, t.work2, 4);
      expect(stored(s, t.entry).adjustments).toBeUndefined();
    });
  });

  it("hands history what was suggested before any adjustment, and nothing without a snapshot", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await capturePrescription(s.training, t.entry, t.draft);
    await logged(s, t.work1, 5);
    await tickSet(s.training, t.work2, {}, undefined, null, undefined, null, loads);
    await finishSession(s.training, t.id);
    const [session] = parseFinishedSessions(
      s.sqlite.prepare(EXERCISE_HISTORY_SQL).all(SQUAT, SQUAT),
    );
    const bySet = new Map(session?.sets.map((set) => [set.id, set]));
    expect(bySet.get(t.work1)?.suggested).toEqual({ weight_kg: 100, reps: 8 });
    // The second set was lowered to 97.5 and logged there; it was offered 100.
    expect(bySet.get(t.work2)?.weight_kg).toBeLessThan(100);
    expect(bySet.get(t.work2)?.suggested).toEqual({ weight_kg: 100, reps: 8 });

    const bare = await setupSessions();
    const u = await started(bare);
    await tickSet(bare.training, u.work1, { weight: 100, reps: 8 });
    await finishSession(bare.training, u.id);
    const [plain] = parseFinishedSessions(
      bare.sqlite.prepare(EXERCISE_HISTORY_SQL).all(SQUAT, SQUAT),
    );
    expect(plain?.sets.find((set) => set.id === u.work1)?.suggested).toBeNull();
  });

  describe("which sets adjust", () => {
    it("lets a top set's miss lower its back-offs, and never moves a drop or myo set", async () => {
      const s = await setupSessions();
      const t = await started(s);
      await capturePrescription(s.training, t.entry, t.draft);
      await updateSet(s.training, t.work1, { kind: "top" });
      await updateSet(s.training, t.work2, { kind: "backoff" });
      await logged(s, t.work1, 5);
      expect(stored(s, t.entry).sets[2]?.ghosts.weight).toBeLessThan(100);

      const other = await setupSessions();
      const u = await started(other);
      await capturePrescription(other.training, u.entry, u.draft);
      await updateSet(other.training, u.work2, { kind: "drop" });
      await logged(other, u.work1, 5);
      expect(stored(other, u.entry).adjustments).toBeUndefined();
      await untickSet(other.training, u.work1);
      await updateSet(other.training, u.work1, { kind: "failure" });
      await updateSet(other.training, u.work2, { kind: "working" });
      await logged(other, u.work1, 5);
      expect(stored(other, u.entry).adjustments).toBeUndefined();
    });
  });

  describe("taking an adjustment back", () => {
    it("reverts when the trigger set is unticked, and adjusts again when it is re-ticked", async () => {
      const s = await setupSessions();
      const t = await started(s);
      await capturePrescription(s.training, t.entry, t.draft);
      await logged(s, t.work1, 5);
      const adjusted = stored(s, t.entry);
      expect(adjusted.sets[2]?.ghosts.weight).toBeLessThan(100);
      expect(await untickSet(s.training, t.work1)).toBe(true);
      const reverted = stored(s, t.entry);
      expect(reverted.previousRevision).toBe(adjusted.revision);
      expect(reverted.sets.map((set) => set.ghosts.weight)).toEqual([40, 100, 100]);
      expect(reverted.adjustments).toBeUndefined();
      expect(reverted.adjustmentUndone).toBeUndefined();
      await tickSet(s.training, t.work1, {}, undefined, null, undefined, null, loads);
      expect(stored(s, t.entry).sets[2]?.ghosts.weight).toBeLessThan(100);
    });

    it("keeps what a moved set was done at when it is already ticked", async () => {
      const s = await setupSessions();
      const t = await started(s);
      await capturePrescription(s.training, t.entry, t.draft);
      await logged(s, t.work1, 5);
      await tickSet(s.training, t.work2, {}, undefined, null, undefined, null, loads);
      const done = s.one("session_set", t.work2)?.["weight_kg"];
      await untickSet(s.training, t.work1);
      expect(stored(s, t.entry).adjustments).toBeUndefined();
      expect(s.one("session_set", t.work2)?.["weight_kg"]).toBe(done);
    });

    it("reverts and reads again when the ticked trigger set is corrected", async () => {
      const s = await setupSessions();
      const t = await started(s);
      await capturePrescription(s.training, t.entry, t.draft);
      await logged(s, t.work1, 5);
      // The reps were a typo: 8 was done, so the lighter target goes.
      await updateSet(s.training, t.work1, { reps: 8 }, undefined, loads);
      expect(stored(s, t.entry).sets.map((set) => set.ghosts.weight)).toEqual([40, 100, 100]);
      expect(stored(s, t.entry).adjustments).toBeUndefined();
      // Corrected to a miss again: it reads the new value.
      await updateSet(s.training, t.work1, { reps: 4 }, undefined, loads);
      expect(latestAdjustment(stored(s, t.entry))).toMatchObject({ setId: t.work1, reps: 4 });
      // Without loads there is nothing to read with, but the old adjustment still goes.
      await updateSet(s.training, t.work1, { reps: 8 }, undefined, undefined);
      expect(stored(s, t.entry).adjustments).toBeUndefined();
    });

    it("undoes compounded adjustments one at a time", async () => {
      const s = await setupSessions();
      const t = await started(s);
      await capturePrescription(s.training, t.entry, t.draft);
      const extra = await addSet(s.training, t.entry, {
        target: { kind: "working", reps_min: 5, reps_max: 8, weight_kg: 100 },
      });
      const snapshot = stored(s, t.entry);
      const draft: PrescriptionDraft = {
        ...snapshot,
        sets: [...snapshot.sets, { id: extra, ghosts: { weight: 100, reps: 8 }, outcome: null }],
      };
      expect(await revisePrescription(s.training, t.entry, draft, [])).toBe(true);
      await logged(s, t.work1, 5);
      await logged(s, t.work2, 4);
      const twice = stored(s, t.entry);
      expect(twice.adjustments?.map(({ setId }) => setId)).toEqual([t.work1, t.work2]);
      const lowest = twice.sets[3]?.ghosts.weight ?? 0;
      expect(lowest).toBeLessThan(97.5);
      expect(await undoSessionAdjustment(s.training, t.entry)).toBe(true);
      const once = stored(s, t.entry);
      expect(once.adjustments?.map(({ setId }) => setId)).toEqual([t.work1]);
      expect(once.sets[3]?.ghosts.weight).toBeGreaterThan(lowest);
      expect(once.sets[3]?.unadjustedWeightKg).toBe(100);
      expect(await undoSessionAdjustment(s.training, t.entry)).toBe(true);
      expect(stored(s, t.entry).sets[3]?.ghosts.weight).toBe(100);
      expect(await undoSessionAdjustment(s.training, t.entry)).toBe(false);
    });
  });

  describe("revising a snapshot", () => {
    const gym = "0192f0a0-0000-7000-8000-0000000000a1";

    it("gives the unticked sets a fresh suggestion and keeps the ticked ones, naming what it replaces", async () => {
      const s = await setupSessions();
      const t = await started(s);
      const first = await capturePrescription(s.training, t.entry, t.draft);
      await tickSet(s.training, t.work1, {});
      const draft: PrescriptionDraft = {
        ...t.draft,
        gymId: gym,
        capKg: 90,
        sets: t.draft.sets.map((set) => ({ ...set, ghosts: { ...set.ghosts, weight: 90 } })),
      };
      expect(await revisePrescription(s.training, t.entry, draft, [t.warm, t.work1, t.work2])).toBe(
        true,
      );
      const after = stored(s, t.entry);
      expect(after.previousRevision).toBe(first?.revision);
      // The ticked set keeps what it was suggested (and done at); the others follow the draft.
      expect(after.sets.map((set) => set.ghosts.weight)).toEqual([90, 100, 90]);
      expect(after).toMatchObject({ capKg: 90, gymId: gym });
    });

    it("appends a set that was added after the snapshot, so it is counted", async () => {
      const s = await setupSessions();
      const t = await started(s);
      await capturePrescription(s.training, t.entry, t.draft);
      const extra = await addSet(s.training, t.entry, {});
      const draft: PrescriptionDraft = {
        ...t.draft,
        sets: [...t.draft.sets, { id: extra, ghosts: { weight: 105, reps: 6 }, outcome: null }],
      };
      expect(await revisePrescription(s.training, t.entry, draft, [])).toBe(true);
      const after = stored(s, t.entry);
      expect(after.sets.map(({ id }) => id)).toEqual([t.warm, t.work1, t.work2, extra]);
      expect(after.sets[3]?.ghosts).toEqual({ weight: 105, reps: 6 });
      // The new set can be adjusted: it is a still-unticked progressing set of the snapshot.
      await logged(s, t.work1, 5);
      expect(stored(s, t.entry).sets[3]?.ghosts.weight).toBeLessThan(105);
    });

    it("is refused for another install, after finishing, and without a snapshot", async () => {
      const s = await setupSessions();
      const t = await started(s);
      expect(await revisePrescription(s.training, t.entry, t.draft, [t.work2])).toBe(false);
      await capturePrescription(s.training, t.entry, t.draft);
      s.sqlite.prepare("UPDATE training_session SET device_id = 'other' WHERE id = ?").run(t.id);
      expect(await revisePrescription(s.training, t.entry, t.draft, [t.work2])).toBe(false);
      s.sqlite
        .prepare("UPDATE training_session SET device_id = ? WHERE id = ?")
        .run(s.installId, t.id);
      await finishSession(s.training, t.id);
      expect(await revisePrescription(s.training, t.entry, t.draft, [t.work2])).toBe(false);
    });
  });

  describe("a snapshot this build cannot read", () => {
    const foreign = (s: Sessions, entry: string, content: string) =>
      s.sqlite
        .prepare("UPDATE session_exercise SET prescription = ? WHERE id = ?")
        .run(content, entry);

    it("is not used for ghosts, adjusted, revised or written over", async () => {
      const s = await setupSessions();
      const t = await started(s);
      const mine = await capturePrescription(s.training, t.entry, t.draft);
      const newer = { ...mine, futureField: { kept: true }, reason: "a_later_reason" };
      foreign(s, t.entry, JSON.stringify(newer));
      expect(await capturePrescription(s.training, t.entry, { ...t.draft, capKg: 70 })).toBeNull();
      expect(await revisePrescription(s.training, t.entry, t.draft, [t.work2])).toBe(false);
      // The tick uses what the screen gives, and nothing is adjusted or rewritten.
      await updateSet(s.training, t.work1, { reps: 5 });
      await tickSet(
        s.training,
        t.work1,
        { weight: 100 },
        undefined,
        null,
        undefined,
        t.draft,
        loads,
      );
      expect(JSON.parse(String(s.one("session_exercise", t.entry)?.["prescription"]))).toEqual(
        newer,
      );
      expect(s.one("session_set", t.work1)).toMatchObject({ weight_kg: 100, reps: 5 });
      expect(await undoSessionAdjustment(s.training, t.entry)).toBe(false);
    });

    it("is replaced by a capture only when it belongs to another exercise", async () => {
      const s = await setupSessions();
      const t = await started(s);
      const mine = await capturePrescription(s.training, t.entry, t.draft);
      foreign(
        s,
        t.entry,
        JSON.stringify({ ...mine, exerciseId: "0192f0a0-0000-7000-8000-000000000009" }),
      );
      const fresh = await capturePrescription(s.training, t.entry, t.draft);
      expect(fresh?.exerciseId).toBe(SQUAT);
      expect(stored(s, t.entry).revision).toBe(fresh?.revision);
    });
  });
});
