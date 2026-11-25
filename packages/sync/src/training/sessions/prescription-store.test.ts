import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  prescriptionSchema,
  type AdjustmentLoads,
  type PrescriptionDraft,
} from "@workspace/shared";
import { pushWorkout, setupSessions, SQUAT, type Sessions } from "./session-fixtures";
import { capturePrescription, undoSessionAdjustment } from "./prescription-store";
import { tickSet, updateSet } from "./session-content-store";
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
async function logged(s: Sessions, setId: string, reps: number) {
  await updateSet(s.training, setId, { reps });
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
      // Only a working set triggers.
      await logged(s, t.work1, 5);
      const after = stored(s, t.entry);
      expect(after.revision).not.toBe(before?.revision);
      expect(after.previousRevision).toBe(before?.revision);
      expect(after.adjustment).toEqual({ setId: t.work1, reason: "reps_short", reps: 3 });
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
      expect(stored(s, t.entry).adjustment).toBeUndefined();
    });

    it("never adjusts without loads, on another install, or in a finished Session", async () => {
      const s = await setupSessions();
      const t = await started(s);
      await capturePrescription(s.training, t.entry, t.draft);
      await updateSet(s.training, t.work1, { reps: 5 });
      await tickSet(s.training, t.work1, {});
      expect(stored(s, t.entry).adjustment).toBeUndefined();
      s.sqlite.prepare("UPDATE training_session SET device_id = 'other' WHERE id = ?").run(t.id);
      await logged(s, t.work2, 5);
      expect(stored(s, t.entry).adjustment).toBeUndefined();
    });

    it("undoes for the Session, restoring unticked targets and stopping further adjustment", async () => {
      const s = await setupSessions();
      const t = await started(s);
      await capturePrescription(s.training, t.entry, t.draft);
      await logged(s, t.work1, 5);
      expect(await undoSessionAdjustment(s.training, t.entry)).toBe(true);
      const after = stored(s, t.entry);
      expect(after.adjustment).toBeUndefined();
      expect(after.adjustmentUndone).toBe(true);
      expect(after.sets[2]?.ghosts.weight).toBe(100);
      expect(await undoSessionAdjustment(s.training, t.entry)).toBe(false);
      await logged(s, t.work2, 4);
      expect(stored(s, t.entry).adjustment).toBeUndefined();
    });
  });
});
