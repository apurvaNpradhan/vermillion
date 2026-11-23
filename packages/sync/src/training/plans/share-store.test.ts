import {
  programSnapshotSchema,
  serializeProgram,
  serializeWorkout,
  workoutSnapshotSchema,
  type ShareSnapshot,
} from "@workspace/shared";
import { expect, it } from "vitest";

import { finishSession, startSession } from "../sessions/session-store";
import { tickSet } from "../sessions/session-content-store";
import { pushWorkout, setupSessions, SQUAT } from "../sessions/session-fixtures";
import {
  addExercises,
  addSlot,
  createProgram,
  createWorkout,
  updateWorkoutExercise,
} from "../store";
import {
  importSnapshot,
  previewImportExercises,
  readProgramShareSource,
  readSessionShareSource,
  readWorkoutShareSource,
} from "./share-store";

const CUSTOM_ID = "0192f0a0-0000-7000-8000-0000000000c1";

async function planned() {
  const s = await setupSessions();
  s.sqlite
    .prepare(
      `INSERT INTO exercise (id, user_id, title, primary_muscle, secondary_muscles, equipment,
         exercise_type, is_full_bodyweight, created_at) VALUES (?, 'owner', 'My fly', 'chest', '[]', 'cable', 'weight_reps', 0, 'now')`,
    )
    .run(CUSTOM_ID);
  const programId = await createProgram(s.training, {
    title: "Plan",
    description: "A plan",
    planned_weeks: 6,
    sessions_per_week: 3,
  });
  const workoutId = await createWorkout(s.training, { title: "Legs", program_id: programId });
  const [squat, fly] = await addExercises(s.training, workoutId, [SQUAT, CUSTOM_ID]);
  await updateWorkoutExercise(s.training, squat ?? "", {
    sets: [{ kind: "working", reps_min: 5, reps_max: 5, weight_kg: 100 }],
  });
  await updateWorkoutExercise(s.training, fly ?? "", { note: "slow" });
  await addSlot(s.training, programId, workoutId);
  await addSlot(s.training, programId, null);
  await addSlot(s.training, programId, workoutId);
  return { s, programId, workoutId };
}

/** A fresh device that knows the catalog squat but not the custom exercise. */
async function otherDevice() {
  const other = await setupSessions();
  return other;
}

it("reads a program with its rotation and round-trips it onto another device", async () => {
  const { s, programId } = await planned();
  try {
    const source = await readProgramShareSource(s.training, programId);
    if (!source) throw new Error("no source");
    const snapshot = serializeProgram(source, { weights: true });
    expect(programSnapshotSchema.parse(snapshot).program.rotation).toEqual([0, null, 0]);
    expect(
      snapshot.program.workouts[0]?.exercises.map((entry) => entry.exercise.catalog_id),
    ).toEqual([SQUAT, null]);

    const other = await otherDevice();
    try {
      const preview = await previewImportExercises(other.training, snapshot);
      expect(preview.map((item) => item.match.kind)).toEqual(["catalog", "new"]);
      const imported = await importSnapshot(other.training, snapshot);
      expect(imported).toMatchObject({ kind: "program", createdExercises: 1 });

      expect(other.one("program", imported.id)).toMatchObject({
        title: "Plan",
        planned_weeks: 6,
        sessions_per_week: 3,
      });
      const slots = other.sqlite
        .prepare("SELECT workout_id FROM program_slot WHERE program_id = ? ORDER BY position, id")
        .all(imported.id);
      expect(slots).toHaveLength(3);
      const bySlot = slots.map((row) => row["workout_id"]);
      expect(bySlot[1]).toBeNull();
      expect(bySlot[0]).toBe(bySlot[2]);
      const custom = other
        .all("exercise")
        .filter((row) => (row as { user_id: string | null }).user_id);
      expect(custom).toMatchObject([{ title: "My fly", equipment: "cable", user_id: "owner" }]);
      const workoutExercises = other.all("workout_exercise") as {
        note: string | null;
        sets: string;
      }[];
      expect(workoutExercises).toHaveLength(2);
      expect(JSON.parse(workoutExercises[0]?.sets ?? "[]")).toEqual([
        { kind: "working", reps_min: 5, reps_max: 5, weight_kg: 100 },
      ]);

      // Importing again reuses the custom exercise it made, and adds a second copy of the plan.
      expect(await importSnapshot(other.training, snapshot)).toMatchObject({ createdExercises: 0 });
      expect(
        other.all("exercise").filter((row) => (row as { user_id: string | null }).user_id),
      ).toHaveLength(1);
      expect(other.all("program")).toHaveLength(2);
    } finally {
      other.sqlite.close();
    }
  } finally {
    s.sqlite.close();
  }
});

it("imports a workout as a standalone workout, with its supersets", async () => {
  const s = await setupSessions();
  try {
    const { workoutId: id } = await pushWorkout(s);
    const source = await readWorkoutShareSource(s.training, id);
    if (!source) throw new Error("no source");
    const snapshot = serializeWorkout(source, { weights: false });
    expect(workoutSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain("weight_kg");
    const imported = await importSnapshot(s.training, snapshot);
    expect(imported.kind).toBe("workout");
    expect(s.one("workout", imported.id)).toMatchObject({ program_id: null, title: "Legs" });
  } finally {
    s.sqlite.close();
  }
});

it("turns a finished session into a workout template of its completed working sets", async () => {
  const s = await setupSessions();
  try {
    const { workoutId } = await pushWorkout(s, "Legs");
    const sessionId = await startSession(s.training, { workoutId, derivedTitle: "Legs" });
    const [first] = s.exercises(sessionId);
    const sets = s.sets(String((first as { id: string }).id));
    for (const set of sets) {
      const row = set as { id: string; kind: string };
      if (row.kind === "working") await tickSet(s.training, row.id, { weight: 90, reps: 6 });
    }
    await finishSession(s.training, sessionId);
    const source = await readSessionShareSource(s.training, sessionId);
    if (!source) throw new Error("no source");
    const snapshot: ShareSnapshot = serializeWorkout(source, { weights: true });
    const exercise = workoutSnapshotSchema.parse(snapshot).workout.exercises[0];
    expect(exercise?.sets.length).toBeGreaterThan(0);
    for (const set of exercise?.sets ?? []) {
      expect(set).toMatchObject({
        kind: expect.not.stringMatching(/warmup/),
        weight_kg: 90,
        reps_min: 6,
        reps_max: 6,
      });
    }
  } finally {
    s.sqlite.close();
  }
});
