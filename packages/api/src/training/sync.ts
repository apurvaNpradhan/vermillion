import { runSyncHandler } from "./run-sync";
import type { DbExecutor } from "@workspace/db";
import {
  plannedSetsSchema,
  programInput,
  programSlotInput,
  TRAINING_LIMITS,
  workoutExerciseInput,
  workoutInput,
  type PlannedSet,
} from "@workspace/shared";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { SyncRejection, type SyncTableHandler } from "../platform/sync/handler";
import {
  countSlotsDeletedWith,
  countWorkoutsDeletedWith,
  deleteProgramCascade,
  deleteWorkoutCascade,
  restoreProgramCascade,
  restoreWorkoutCascade,
} from "./operations/cascade";
import {
  countLivePrograms,
  countLiveSlots,
  countLiveWorkoutExercises,
  countLiveWorkouts,
  findProgram,
  findSlot,
  findWorkout,
  findWorkoutExercise,
  liveProgram,
  liveWorkout,
  lockUserTraining,
  visibleExerciseType,
} from "./operations/lookup";
import { program, programSlot, workout, workoutExercise } from "./tables";
import {
  accept,
  assertRoom,
  checkPut,
  idOf,
  invalid,
  liveRow,
  newRowId,
  now,
  ownRow,
  restoreMarker,
} from "./sync-common";
import { sessionSyncHandlers } from "./session-sync";

// ---- Program ----

const putProgram = z.strictObject({
  restore: restoreMarker,
  title: programInput.shape.title,
  description: programInput.shape.description.default(null),
  planned_weeks: programInput.shape.planned_weeks.default(null),
});
const patchProgram = programInput.partial();

async function updateProgram(db: DbExecutor, id: string, values: z.infer<typeof programInput>) {
  await db
    .update(program)
    .set({
      title: values.title,
      description: values.description,
      plannedWeeks: values.planned_weeks,
      updatedAt: now(),
    })
    .where(eq(program.id, id));
}

const programSyncHandler: SyncTableHandler = {
  table: "program",
  async apply(db, userId, op) {
    const id = idOf(op.id);
    await lockUserTraining(db, userId);
    const found = await findProgram(db, userId, id);

    if (op.op === "DELETE") {
      const row = ownRow(found);
      if (row.deletedAt === null) await deleteProgramCascade(db, id, now());
      return;
    }

    if (op.op === "PUT") {
      if (found.kind === "other-user") throw new SyncRejection("SYNC_ID_CONFLICT");
      const values = accept(putProgram.safeParse(op.opData ?? {}));
      checkPut(found, values.restore);
      if (found.kind === "absent") {
        accept(newRowId.safeParse(id));
        assertRoom(await countLivePrograms(db, userId, id), 1, TRAINING_LIMITS.livePrograms);
        await db.insert(program).values({
          id,
          userId,
          title: values.title,
          description: values.description,
          plannedWeeks: values.planned_weeks,
        });
        return;
      }
      const deletedAt = found.row.deletedAt;
      if (deletedAt !== null) {
        // Putting a deleted row again is the Undo of a delete: it brings back what that delete took.
        assertRoom(await countLivePrograms(db, userId, id), 1, TRAINING_LIMITS.livePrograms);
        const workouts = await countWorkoutsDeletedWith(db, id, deletedAt);
        assertRoom(await countLiveWorkouts(db, userId, id), workouts, TRAINING_LIMITS.liveWorkouts);
        await restoreProgramCascade(db, id, deletedAt, now());
      }
      await updateProgram(db, id, values);
      return;
    }

    const row = liveRow(found);
    const patch = accept(patchProgram.safeParse(op.opData ?? {}));
    const merged = accept(
      programInput.safeParse({
        title: row.title,
        description: row.description,
        planned_weeks: row.plannedWeeks,
        ...patch,
      }),
    );
    await updateProgram(db, id, merged);
  },
  purgeTombstones: async () => 0,
};

// ---- Workout ----

const putWorkout = z.strictObject({
  restore: restoreMarker,
  program_id: workoutInput.shape.program_id.default(null),
  title: workoutInput.shape.title.default(null),
  note: workoutInput.shape.note.default(null),
});
// A Workout never changes Program: "add to program" copies.
const patchWorkout = workoutInput.omit({ program_id: true }).partial();

/** The Program a Workout would belong to must be the writer's own and live. */
async function assertProgramOpen(db: DbExecutor, userId: string, programId: string | null) {
  if (programId === null) return;
  if (!(await liveProgram(db, userId, programId))) {
    throw new SyncRejection("TRAINING_PARENT_NOT_FOUND");
  }
}

const workoutSyncHandler: SyncTableHandler = {
  table: "workout",
  async apply(db, userId, op) {
    const id = idOf(op.id);
    await lockUserTraining(db, userId);
    const found = await findWorkout(db, userId, id);

    if (op.op === "DELETE") {
      const row = ownRow(found);
      if (row.deletedAt === null) await deleteWorkoutCascade(db, id, now());
      return;
    }

    if (op.op === "PUT") {
      if (found.kind === "other-user") throw new SyncRejection("SYNC_ID_CONFLICT");
      const values = accept(putWorkout.safeParse(op.opData ?? {}));
      checkPut(found, values.restore);
      if (found.kind === "absent") {
        accept(newRowId.safeParse(id));
        await assertProgramOpen(db, userId, values.program_id);
        assertRoom(await countLiveWorkouts(db, userId, id), 1, TRAINING_LIMITS.liveWorkouts);
        await db.insert(workout).values({
          id,
          userId,
          programId: values.program_id,
          title: values.title,
          note: values.note,
        });
        return;
      }
      if (found.row.programId !== values.program_id) return invalid();
      const deletedAt = found.row.deletedAt;
      if (deletedAt !== null) {
        await assertProgramOpen(db, userId, values.program_id);
        assertRoom(await countLiveWorkouts(db, userId, id), 1, TRAINING_LIMITS.liveWorkouts);
        if (values.program_id !== null) {
          const slots = await countSlotsDeletedWith(db, id, deletedAt);
          const live = await countLiveSlots(db, values.program_id, id);
          assertRoom(live, slots, TRAINING_LIMITS.slotsPerProgram);
        }
        await restoreWorkoutCascade(db, id, deletedAt, now());
      }
      await db
        .update(workout)
        .set({ title: values.title, note: values.note, updatedAt: now() })
        .where(eq(workout.id, id));
      return;
    }

    liveRow(found);
    const patch = accept(patchWorkout.safeParse(op.opData ?? {}));
    await db
      .update(workout)
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
        updatedAt: now(),
      })
      .where(eq(workout.id, id));
  },
  purgeTombstones: async () => 0,
};

// ---- Workout exercise ----

/** Sets travel as JSON text (SQLite stores them that way). */
const wireSets = z.string();

const putWorkoutExercise = z.strictObject({
  restore: restoreMarker,
  workout_id: workoutExerciseInput.shape.workout_id,
  exercise_id: workoutExerciseInput.shape.exercise_id,
  position: workoutExerciseInput.shape.position,
  rest_seconds: workoutExerciseInput.shape.rest_seconds.default(null),
  note: workoutExerciseInput.shape.note.default(null),
  superset_group: workoutExerciseInput.shape.superset_group.default(null),
  sets: wireSets.default("[]"),
});
const patchWorkoutExercise = z
  .strictObject({
    exercise_id: workoutExerciseInput.shape.exercise_id,
    position: workoutExerciseInput.shape.position,
    rest_seconds: workoutExerciseInput.shape.rest_seconds,
    note: workoutExerciseInput.shape.note,
    superset_group: workoutExerciseInput.shape.superset_group,
    sets: wireSets,
  })
  .partial();

/** Sets must be JSON that fits the exercise's type; anything else is a permanent refusal. */
function validSets(text: string, exerciseType: Parameters<typeof plannedSetsSchema>[0]) {
  let value: ReturnType<typeof JSON.parse>;
  try {
    value = JSON.parse(text);
  } catch {
    throw new SyncRejection("TRAINING_INVALID_SETS");
  }
  const sets = plannedSetsSchema(exerciseType).safeParse(value);
  if (!sets.success) throw new SyncRejection("TRAINING_INVALID_SETS");
  return sets.data;
}

async function exerciseTypeOf(db: DbExecutor, userId: string, exerciseId: string) {
  const type = await visibleExerciseType(db, userId, exerciseId);
  if (!type) throw new SyncRejection("TRAINING_PARENT_NOT_FOUND");
  return type;
}

const workoutExerciseSyncHandler: SyncTableHandler = {
  table: "workout_exercise",
  async apply(db, userId, op) {
    const id = idOf(op.id);
    await lockUserTraining(db, userId);
    const found = await findWorkoutExercise(db, userId, id);

    if (op.op === "DELETE") {
      const row = ownRow(found);
      if (row.deletedAt === null) {
        const at = now();
        await db
          .update(workoutExercise)
          .set({ deletedAt: at, updatedAt: at })
          .where(eq(workoutExercise.id, id));
      }
      return;
    }

    if (op.op === "PUT") {
      if (found.kind === "other-user") throw new SyncRejection("SYNC_ID_CONFLICT");
      const values = accept(putWorkoutExercise.safeParse(op.opData ?? {}));
      checkPut(found, values.restore);
      if (found.kind === "own" && found.row.workoutId !== values.workout_id) return invalid();
      if (!(await liveWorkout(db, userId, values.workout_id))) {
        throw new SyncRejection("TRAINING_PARENT_NOT_FOUND");
      }
      const type = await exerciseTypeOf(db, userId, values.exercise_id);
      const sets = validSets(values.sets, type);
      const columns = {
        exerciseId: values.exercise_id,
        position: values.position,
        restSeconds: values.rest_seconds,
        note: values.note,
        supersetGroup: values.superset_group,
        sets,
      };
      if (found.kind === "absent") {
        accept(newRowId.safeParse(id));
        const live = await countLiveWorkoutExercises(db, values.workout_id, id);
        assertRoom(live, 1, TRAINING_LIMITS.exercisesPerWorkout);
        await db
          .insert(workoutExercise)
          .values({ id, userId, workoutId: values.workout_id, ...columns });
        return;
      }
      if (found.row.deletedAt !== null) {
        const live = await countLiveWorkoutExercises(db, values.workout_id, id);
        assertRoom(live, 1, TRAINING_LIMITS.exercisesPerWorkout);
      }
      await db
        .update(workoutExercise)
        .set({ ...columns, deletedAt: null, updatedAt: now() })
        .where(eq(workoutExercise.id, id));
      return;
    }

    const row = liveRow(found);
    const patch = accept(patchWorkoutExercise.safeParse(op.opData ?? {}));
    const exerciseId = patch.exercise_id ?? row.exerciseId;
    let sets: PlannedSet[] | undefined;
    if (patch.sets !== undefined || patch.exercise_id !== undefined) {
      const type = await exerciseTypeOf(db, userId, exerciseId);
      // A new exercise must still fit the sets that stay; the client sends fresh ones otherwise.
      sets = validSets(patch.sets ?? JSON.stringify(row.sets), type);
    }
    await db
      .update(workoutExercise)
      .set({
        ...(patch.exercise_id !== undefined ? { exerciseId: patch.exercise_id } : {}),
        ...(patch.position !== undefined ? { position: patch.position } : {}),
        ...(patch.rest_seconds !== undefined ? { restSeconds: patch.rest_seconds } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
        ...(patch.superset_group !== undefined ? { supersetGroup: patch.superset_group } : {}),
        ...(sets !== undefined ? { sets } : {}),
        updatedAt: now(),
      })
      .where(and(eq(workoutExercise.id, id), eq(workoutExercise.userId, userId)));
  },
  purgeTombstones: async () => 0,
};

// ---- Program slot ----

const putSlot = z.strictObject({
  restore: restoreMarker,
  program_id: programSlotInput.shape.program_id,
  workout_id: programSlotInput.shape.workout_id.default(null),
  position: programSlotInput.shape.position,
});
const patchSlot = z
  .strictObject({
    workout_id: programSlotInput.shape.workout_id,
    position: programSlotInput.shape.position,
  })
  .partial();

/** A Slot holds Rest, or a live Workout the writer owns that belongs to the Slot's Program. */
async function assertSlotWorkout(
  db: DbExecutor,
  userId: string,
  programId: string,
  workoutId: string | null,
) {
  if (workoutId === null) return;
  const target = await liveWorkout(db, userId, workoutId);
  if (!target) throw new SyncRejection("TRAINING_PARENT_NOT_FOUND");
  if (target.programId !== programId) throw new SyncRejection("TRAINING_SLOT_PROGRAM_MISMATCH");
}

const programSlotSyncHandler: SyncTableHandler = {
  table: "program_slot",
  async apply(db, userId, op) {
    const id = idOf(op.id);
    await lockUserTraining(db, userId);
    const found = await findSlot(db, userId, id);

    if (op.op === "DELETE") {
      const row = ownRow(found);
      if (row.deletedAt === null) {
        const at = now();
        await db
          .update(programSlot)
          .set({ deletedAt: at, updatedAt: at })
          .where(eq(programSlot.id, id));
      }
      return;
    }

    if (op.op === "PUT") {
      if (found.kind === "other-user") throw new SyncRejection("SYNC_ID_CONFLICT");
      const values = accept(putSlot.safeParse(op.opData ?? {}));
      checkPut(found, values.restore);
      if (found.kind === "own" && found.row.programId !== values.program_id) return invalid();
      if (!(await liveProgram(db, userId, values.program_id))) {
        throw new SyncRejection("TRAINING_PARENT_NOT_FOUND");
      }
      await assertSlotWorkout(db, userId, values.program_id, values.workout_id);
      if (found.kind === "absent") {
        accept(newRowId.safeParse(id));
        const live = await countLiveSlots(db, values.program_id, id);
        assertRoom(live, 1, TRAINING_LIMITS.slotsPerProgram);
        await db.insert(programSlot).values({
          id,
          userId,
          programId: values.program_id,
          workoutId: values.workout_id,
          position: values.position,
        });
        return;
      }
      if (found.row.deletedAt !== null) {
        const live = await countLiveSlots(db, values.program_id, id);
        assertRoom(live, 1, TRAINING_LIMITS.slotsPerProgram);
      }
      await db
        .update(programSlot)
        .set({
          workoutId: values.workout_id,
          position: values.position,
          deletedAt: null,
          updatedAt: now(),
        })
        .where(eq(programSlot.id, id));
      return;
    }

    const row = liveRow(found);
    const patch = accept(patchSlot.safeParse(op.opData ?? {}));
    if (patch.workout_id !== undefined) {
      await assertSlotWorkout(db, userId, row.programId, patch.workout_id);
    }
    await db
      .update(programSlot)
      .set({
        ...(patch.workout_id !== undefined ? { workoutId: patch.workout_id } : {}),
        ...(patch.position !== undefined ? { position: patch.position } : {}),
        updatedAt: now(),
      })
      .where(eq(programSlot.id, id));
  },
  purgeTombstones: async () => 0,
};

/**
 * Upload handlers of the training tables (ADR 0036). Same rules as the other synced tables:
 * strict data (a column the server owns is refused), the writer's own rows only, dirty-field
 * PATCH, and DELETE as a soft delete that cascades down the plan. Delete wins over ordinary
 * writes: a plain PUT or PATCH of a deleted row is refused. Restore is an explicit action, a PUT
 * carrying the `restore` marker, which brings back what that delete took. Tombstones are not purged yet: the
 * rows are small and a purge needs a marker table against late PUTs (see the ADR follow-ups).
 */
export const trainingSyncHandlers: readonly SyncTableHandler[] = [
  runSyncHandler,
  programSyncHandler,
  workoutSyncHandler,
  workoutExerciseSyncHandler,
  programSlotSyncHandler,
  ...sessionSyncHandlers,
];
