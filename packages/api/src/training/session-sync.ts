import { checkSessionRun } from "./run-sync";
import type { DbExecutor } from "@workspace/db";
import {
  EXERCISE_TYPES,
  exerciseSettingInput,
  gymEquipmentInput,
  plannedSetSchema,
  SESSION_LIMITS,
  sessionExerciseInput,
  sessionInput,
  sessionSetInput,
  sessionSetSchema,
  sessionStartAllowed,
  sessionTimesConsistent,
  type SessionInput,
  type SessionSetInput,
} from "@workspace/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { SyncRejection, type SyncTableHandler } from "../platform/sync/handler";
import {
  deleteSessionCascade,
  deleteSessionExerciseCascade,
  restoreSessionCascade,
  restoreSessionExerciseCascade,
} from "./operations/session-cascade";
import {
  countLiveSessionExercises,
  countLiveSessionSets,
  findEquipment,
  findExerciseSetting,
  findSession,
  findSessionExercise,
  findSessionSet,
  liveSession,
  liveSessionExercise,
  liveSettingFor,
  lockUserTraining,
  ownEquipment,
  visibleExerciseType,
  type SessionRow,
  type SessionSetRow,
} from "./operations/lookup";
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
import { exerciseSetting, gymEquipment, session, sessionExercise, sessionSet } from "./tables";

// The client stores booleans as 0/1 and the target as JSON text, and uploads them that way.
const wireBoolean = z
  .union([z.boolean(), z.literal(0), z.literal(1)])
  .transform((value) => value === true || value === 1);
const wireTarget = z
  .string()
  .transform((text, ctx) => {
    try {
      return JSON.parse(text);
    } catch {
      ctx.addIssue({ code: "custom", message: "not JSON" });
      return z.NEVER;
    }
  })
  .pipe(plannedSetSchema.nullable())
  .or(z.null());

const iso = (date: Date | null) => (date === null ? null : date.toISOString());
const date = (text: string | null) => (text === null ? null : new Date(text));

function parentMissing(): never {
  throw new SyncRejection("SESSION_PARENT_NOT_FOUND");
}

async function exerciseVisible(db: DbExecutor, userId: string, exerciseId: string) {
  if (!(await visibleExerciseType(db, userId, exerciseId))) parentMissing();
}

// ---- Session ----

const putSession = z.strictObject({
  restore: restoreMarker,
  workout_id: sessionInput.shape.workout_id.default(null),
  program_id: sessionInput.shape.program_id.default(null),
  run_id: sessionInput.shape.run_id.default(null),
  slot_id: sessionInput.shape.slot_id.default(null),
  cycle: sessionInput.shape.cycle.default(null),
  title: sessionInput.shape.title,
  title_derived: wireBoolean.default(true),
  note: sessionInput.shape.note.default(null),
  started_at: sessionInput.shape.started_at,
  finished_at: sessionInput.shape.finished_at.default(null),
  duration_s: sessionInput.shape.duration_s.default(null),
  device_id: sessionInput.shape.device_id,
  rest_set_id: sessionInput.shape.rest_set_id.default(null),
  rest_started_at: sessionInput.shape.rest_started_at.default(null),
  rest_ends_at: sessionInput.shape.rest_ends_at.default(null),
});
const patchSession = z
  .strictObject({ ...sessionInput.shape, title_derived: wireBoolean })
  .partial();

function sessionRowAsInput(row: SessionRow): SessionInput {
  return {
    workout_id: row.workoutId,
    program_id: row.programId,
    run_id: row.runId,
    slot_id: row.slotId,
    cycle: row.cycle,
    title: row.title,
    title_derived: row.titleDerived,
    note: row.note,
    started_at: row.startedAt.toISOString(),
    finished_at: iso(row.finishedAt),
    duration_s: row.durationS,
    device_id: row.deviceId,
    rest_set_id: row.restSetId,
    rest_started_at: iso(row.restStartedAt),
    rest_ends_at: iso(row.restEndsAt),
  };
}

function sessionColumns(values: SessionInput) {
  return {
    workoutId: values.workout_id,
    programId: values.program_id,
    runId: values.run_id,
    slotId: values.slot_id,
    cycle: values.cycle,
    title: values.title,
    titleDerived: values.title_derived,
    note: values.note,
    startedAt: new Date(values.started_at),
    finishedAt: date(values.finished_at),
    durationS: values.duration_s,
    deviceId: values.device_id,
    restSetId: values.rest_set_id,
    restStartedAt: date(values.rest_started_at),
    restEndsAt: date(values.rest_ends_at),
  };
}

/** Times in order, and a start inside the backfill window when it is new or moved. */
function checkSessionTimes(values: SessionInput, previousStart: string | null) {
  if (!sessionTimesConsistent(values)) invalid();
  const moved =
    previousStart === null || Date.parse(previousStart) !== Date.parse(values.started_at);
  if (moved && !sessionStartAllowed(values.started_at, now())) {
    throw new SyncRejection("SESSION_DATE_OUT_OF_RANGE");
  }
}

const sessionSyncHandler: SyncTableHandler = {
  table: "training_session",
  async apply(db, userId, op) {
    const id = idOf(op.id);
    await lockUserTraining(db, userId);
    const found = await findSession(db, userId, id);

    if (op.op === "DELETE") {
      const row = ownRow(found);
      if (row.deletedAt === null) await deleteSessionCascade(db, id, now());
      return;
    }

    if (op.op === "PUT") {
      if (found.kind === "other-user") throw new SyncRejection("SYNC_ID_CONFLICT");
      const { restore, ...data } = accept(putSession.safeParse(op.opData ?? {}));
      checkPut(found, restore);
      const values = accept(sessionInput.safeParse(data));
      await checkSessionRun(db, userId, values);
      if (found.kind === "absent") {
        accept(newRowId.safeParse(id));
        checkSessionTimes(values, null);
        await db.insert(session).values({ id, userId, ...sessionColumns(values) });
        return;
      }
      checkSessionTimes(values, found.row.startedAt.toISOString());
      const deletedAt = found.row.deletedAt;
      // Putting a deleted row again is the Undo of a delete: it brings back what that delete took.
      if (deletedAt !== null) await restoreSessionCascade(db, id, deletedAt, now());
      await db
        .update(session)
        .set({ ...sessionColumns(values), updatedAt: now() })
        .where(eq(session.id, id));
      return;
    }

    const row = liveRow(found);
    const patch = accept(patchSession.safeParse(op.opData ?? {}));
    const before = sessionRowAsInput(row);
    const merged = accept(sessionInput.safeParse({ ...before, ...patch }));
    await checkSessionRun(db, userId, merged);
    checkSessionTimes(merged, before.started_at);
    await db
      .update(session)
      .set({ ...sessionColumns(merged), updatedAt: now() })
      .where(eq(session.id, id));
  },
  purgeTombstones: async () => 0,
};

// ---- Session exercise ----

const putSessionExercise = z.strictObject({
  restore: restoreMarker,
  session_id: sessionExerciseInput.shape.session_id,
  exercise_id: sessionExerciseInput.shape.exercise_id,
  exercise_title: sessionExerciseInput.shape.exercise_title,
  exercise_type: sessionExerciseInput.shape.exercise_type,
  source_workout_exercise_id: sessionExerciseInput.shape.source_workout_exercise_id.default(null),
  position: sessionExerciseInput.shape.position,
  rest_seconds: sessionExerciseInput.shape.rest_seconds.default(null),
  note: sessionExerciseInput.shape.note.default(null),
  superset_group: sessionExerciseInput.shape.superset_group.default(null),
  log_effort: wireBoolean.default(false),
});
// An exercise never moves to another Session.
const patchSessionExercise = z
  .strictObject({
    ...sessionExerciseInput.omit({ session_id: true }).shape,
    log_effort: wireBoolean,
  })
  .partial();

const sessionExerciseSyncHandler: SyncTableHandler = {
  table: "session_exercise",
  async apply(db, userId, op) {
    const id = idOf(op.id);
    await lockUserTraining(db, userId);
    const found = await findSessionExercise(db, userId, id);

    if (op.op === "DELETE") {
      const row = ownRow(found);
      if (row.deletedAt === null) await deleteSessionExerciseCascade(db, id, now());
      return;
    }

    const columns = (values: z.infer<typeof sessionExerciseInput>) => ({
      exerciseId: values.exercise_id,
      exerciseTitle: values.exercise_title,
      exerciseType: values.exercise_type,
      sourceWorkoutExerciseId: values.source_workout_exercise_id,
      position: values.position,
      restSeconds: values.rest_seconds,
      note: values.note,
      supersetGroup: values.superset_group,
      logEffort: values.log_effort,
    });

    if (op.op === "PUT") {
      if (found.kind === "other-user") throw new SyncRejection("SYNC_ID_CONFLICT");
      const { restore, ...data } = accept(putSessionExercise.safeParse(op.opData ?? {}));
      checkPut(found, restore);
      const values = accept(sessionExerciseInput.safeParse(data));
      if (found.kind === "own" && found.row.sessionId !== values.session_id) return invalid();
      if (!(await liveSession(db, userId, values.session_id))) parentMissing();
      await exerciseVisible(db, userId, values.exercise_id);
      const live = await countLiveSessionExercises(db, values.session_id, id);
      if (found.kind === "absent") {
        accept(newRowId.safeParse(id));
        assertRoom(live, 1, SESSION_LIMITS.exercisesPerSession, "SESSION_LIMIT_REACHED");
        await db
          .insert(sessionExercise)
          .values({ id, userId, sessionId: values.session_id, ...columns(values) });
        return;
      }
      const deletedAt = found.row.deletedAt;
      if (deletedAt !== null) {
        assertRoom(live, 1, SESSION_LIMITS.exercisesPerSession, "SESSION_LIMIT_REACHED");
        await restoreSessionExerciseCascade(db, id, deletedAt, now());
      }
      await db
        .update(sessionExercise)
        .set({ ...columns(values), updatedAt: now() })
        .where(eq(sessionExercise.id, id));
      return;
    }

    const row = liveRow(found);
    const patch = accept(patchSessionExercise.safeParse(op.opData ?? {}));
    const merged = accept(
      sessionExerciseInput.safeParse({
        session_id: row.sessionId,
        exercise_id: row.exerciseId,
        exercise_title: row.exerciseTitle,
        exercise_type: row.exerciseType,
        source_workout_exercise_id: row.sourceWorkoutExerciseId,
        position: row.position,
        rest_seconds: row.restSeconds,
        note: row.note,
        superset_group: row.supersetGroup,
        log_effort: row.logEffort,
        ...patch,
      }),
    );
    if (patch.exercise_id !== undefined) await exerciseVisible(db, userId, patch.exercise_id);
    await db
      .update(sessionExercise)
      .set({ ...columns(merged), updatedAt: now() })
      .where(eq(sessionExercise.id, id));
  },
  purgeTombstones: async () => 0,
};

// ---- Session set ----

const putSessionSet = z.strictObject({
  restore: restoreMarker,
  session_exercise_id: sessionSetInput.shape.session_exercise_id,
  position: sessionSetInput.shape.position,
  kind: sessionSetInput.shape.kind,
  weight_kg: sessionSetInput.shape.weight_kg.default(null),
  reps: sessionSetInput.shape.reps.default(null),
  duration_s: sessionSetInput.shape.duration_s.default(null),
  distance_m: sessionSetInput.shape.distance_m.default(null),
  floors: sessionSetInput.shape.floors.default(null),
  steps: sessionSetInput.shape.steps.default(null),
  rpe: sessionSetInput.shape.rpe.default(null),
  completed_at: sessionSetInput.shape.completed_at.default(null),
  timer_started_at: sessionSetInput.shape.timer_started_at.default(null),
  target: wireTarget.default(null),
});
// A set never moves to another exercise.
const patchSessionSet = z
  .strictObject({
    ...sessionSetInput.omit({ session_exercise_id: true, target: true }).shape,
    target: wireTarget,
  })
  .partial();

function setRowAsInput(row: SessionSetRow): SessionSetInput {
  return {
    session_exercise_id: row.sessionExerciseId,
    position: row.position,
    kind: z.enum(sessionSetInput.shape.kind.options).parse(row.kind),
    weight_kg: row.weightKg,
    reps: row.reps,
    duration_s: row.durationS,
    distance_m: row.distanceM,
    floors: row.floors,
    steps: row.steps,
    rpe: row.rpe === null ? null : accept(sessionSetInput.shape.rpe.safeParse(row.rpe)),
    completed_at: iso(row.completedAt),
    timer_started_at: iso(row.timerStartedAt),
    target: row.target,
  };
}

/**
 * Parse first (a malformed value is invalid data), then what the snapshot type allows: only the
 * fields it records, values on a ticked set, a target that fits.
 */
function validSet(data: SessionSetInput, exerciseType: string) {
  const type = z.enum(EXERCISE_TYPES).safeParse(exerciseType);
  if (!type.success) return invalid();
  const parsed = accept(sessionSetInput.safeParse(data));
  const typed = sessionSetSchema(type.data).safeParse(parsed);
  if (!typed.success) throw new SyncRejection("SESSION_SET_INVALID_FOR_TYPE");
  return typed.data;
}

function setColumns(values: SessionSetInput) {
  return {
    position: values.position,
    kind: values.kind,
    weightKg: values.weight_kg,
    reps: values.reps,
    durationS: values.duration_s,
    distanceM: values.distance_m,
    floors: values.floors,
    steps: values.steps,
    rpe: values.rpe,
    completedAt: date(values.completed_at),
    timerStartedAt: date(values.timer_started_at),
    target: values.target,
  };
}

const sessionSetSyncHandler: SyncTableHandler = {
  table: "session_set",
  async apply(db, userId, op) {
    const id = idOf(op.id);
    await lockUserTraining(db, userId);
    const found = await findSessionSet(db, userId, id);

    if (op.op === "DELETE") {
      const row = ownRow(found);
      if (row.deletedAt === null) {
        const at = now();
        await db
          .update(sessionSet)
          .set({ deletedAt: at, updatedAt: at })
          .where(eq(sessionSet.id, id));
      }
      return;
    }

    if (op.op === "PUT") {
      if (found.kind === "other-user") throw new SyncRejection("SYNC_ID_CONFLICT");
      const { restore, ...data } = accept(putSessionSet.safeParse(op.opData ?? {}));
      checkPut(found, restore);
      if (found.kind === "own" && found.row.sessionExerciseId !== data.session_exercise_id) {
        return invalid();
      }
      const parent = await liveSessionExercise(db, userId, data.session_exercise_id);
      if (!parent) parentMissing();
      const values = validSet(data, parent.exerciseType);
      const live = await countLiveSessionSets(db, parent.id, id);
      if (found.kind === "absent") {
        accept(newRowId.safeParse(id));
        assertRoom(live, 1, SESSION_LIMITS.setsPerExercise, "SESSION_LIMIT_REACHED");
        await db
          .insert(sessionSet)
          .values({ id, userId, sessionExerciseId: parent.id, ...setColumns(values) });
        return;
      }
      if (found.row.deletedAt !== null) {
        assertRoom(live, 1, SESSION_LIMITS.setsPerExercise, "SESSION_LIMIT_REACHED");
      }
      await db
        .update(sessionSet)
        .set({ ...setColumns(values), deletedAt: null, updatedAt: now() })
        .where(eq(sessionSet.id, id));
      return;
    }

    const row = liveRow(found);
    const patch = accept(patchSessionSet.safeParse(op.opData ?? {}));
    const parent = await liveSessionExercise(db, userId, row.sessionExerciseId);
    if (!parent) parentMissing();
    const merged = validSet({ ...setRowAsInput(row), ...patch }, parent.exerciseType);
    await db
      .update(sessionSet)
      .set({ ...setColumns(merged), updatedAt: now() })
      .where(eq(sessionSet.id, id));
  },
  purgeTombstones: async () => 0,
};

// ---- Gym equipment ----

const putEquipment = z.strictObject({
  restore: restoreMarker,
  kind: gymEquipmentInput.shape.kind,
  weight_kg: gymEquipmentInput.shape.weight_kg,
  unit: gymEquipmentInput.shape.unit,
  label: gymEquipmentInput.shape.label.default(null),
  count: gymEquipmentInput.shape.count.default(null),
  enabled: wireBoolean.default(true),
});
const patchEquipment = z
  .strictObject({ ...gymEquipmentInput.shape, enabled: wireBoolean })
  .partial();

const equipmentColumns = (values: z.infer<typeof gymEquipmentInput>) => ({
  kind: values.kind,
  weightKg: values.weight_kg,
  unit: values.unit,
  label: values.label,
  count: values.count,
  enabled: values.enabled,
});

const gymEquipmentSyncHandler: SyncTableHandler = {
  table: "gym_equipment",
  async apply(db, userId, op) {
    const id = idOf(op.id);
    await lockUserTraining(db, userId);
    const found = await findEquipment(db, userId, id);

    if (op.op === "DELETE") {
      const row = ownRow(found);
      if (row.deletedAt === null) {
        const at = now();
        await db
          .update(gymEquipment)
          .set({ deletedAt: at, updatedAt: at })
          .where(eq(gymEquipment.id, id));
      }
      return;
    }

    if (op.op === "PUT") {
      if (found.kind === "other-user") throw new SyncRejection("SYNC_ID_CONFLICT");
      const { restore, ...data } = accept(putEquipment.safeParse(op.opData ?? {}));
      checkPut(found, restore);
      const values = accept(gymEquipmentInput.safeParse(data));
      if (found.kind === "absent") {
        accept(newRowId.safeParse(id));
        await db.insert(gymEquipment).values({ id, userId, ...equipmentColumns(values) });
        return;
      }
      await db
        .update(gymEquipment)
        .set({ ...equipmentColumns(values), deletedAt: null, updatedAt: now() })
        .where(eq(gymEquipment.id, id));
      return;
    }

    const row = liveRow(found);
    const patch = accept(patchEquipment.safeParse(op.opData ?? {}));
    const merged = accept(
      gymEquipmentInput.safeParse({
        kind: row.kind,
        weight_kg: row.weightKg,
        unit: row.unit,
        label: row.label,
        count: row.count,
        enabled: row.enabled,
        ...patch,
      }),
    );
    await db
      .update(gymEquipment)
      .set({ ...equipmentColumns(merged), updatedAt: now() })
      .where(eq(gymEquipment.id, id));
  },
  purgeTombstones: async () => 0,
};

// ---- Exercise setting ----

const putSetting = z.strictObject({
  restore: restoreMarker,
  exercise_id: exerciseSettingInput.shape.exercise_id,
  bar_id: exerciseSettingInput.shape.bar_id.default(null),
  log_effort: wireBoolean.default(false),
});
// A setting belongs to one exercise for good.
const patchSetting = z
  .strictObject({ bar_id: exerciseSettingInput.shape.bar_id, log_effort: wireBoolean })
  .partial();

/** The remembered bar must be one of the writer's own bars. */
async function assertOwnBar(db: DbExecutor, userId: string, barId: string | null) {
  if (barId === null) return;
  const bar = await ownEquipment(db, userId, barId);
  if (bar?.kind !== "bar") parentMissing();
}

const exerciseSettingSyncHandler: SyncTableHandler = {
  table: "exercise_setting",
  async apply(db, userId, op) {
    const id = idOf(op.id);
    await lockUserTraining(db, userId);
    const found = await findExerciseSetting(db, userId, id);

    if (op.op === "DELETE") {
      const row = ownRow(found);
      if (row.deletedAt === null) {
        const at = now();
        await db
          .update(exerciseSetting)
          .set({ deletedAt: at, updatedAt: at })
          .where(eq(exerciseSetting.id, id));
      }
      return;
    }

    if (op.op === "PUT") {
      if (found.kind === "other-user") throw new SyncRejection("SYNC_ID_CONFLICT");
      const { restore, ...data } = accept(putSetting.safeParse(op.opData ?? {}));
      checkPut(found, restore);
      const values = accept(exerciseSettingInput.safeParse(data));
      if (found.kind === "own" && found.row.exerciseId !== values.exercise_id) return invalid();
      await exerciseVisible(db, userId, values.exercise_id);
      await assertOwnBar(db, userId, values.bar_id);
      const fields = { barId: values.bar_id, logEffort: values.log_effort, updatedAt: now() };
      // One live setting per exercise: two devices that each created one offline converge on the
      // first to arrive, the later values winning, instead of failing the unique index.
      const existing = await liveSettingFor(db, userId, values.exercise_id);
      if (existing && existing.id !== id) {
        await db.update(exerciseSetting).set(fields).where(eq(exerciseSetting.id, existing.id));
        return;
      }
      if (found.kind === "absent") {
        accept(newRowId.safeParse(id));
        await db
          .insert(exerciseSetting)
          .values({ id, userId, exerciseId: values.exercise_id, ...fields });
        return;
      }
      await db
        .update(exerciseSetting)
        .set({ ...fields, deletedAt: null })
        .where(eq(exerciseSetting.id, id));
      return;
    }

    const row = liveRow(found);
    const patch = accept(patchSetting.safeParse(op.opData ?? {}));
    if (patch.bar_id !== undefined) await assertOwnBar(db, userId, patch.bar_id);
    await db
      .update(exerciseSetting)
      .set({
        ...(patch.bar_id !== undefined ? { barId: patch.bar_id } : {}),
        ...(patch.log_effort !== undefined ? { logEffort: patch.log_effort } : {}),
        updatedAt: now(),
      })
      .where(eq(exerciseSetting.id, row.id));
  },
  purgeTombstones: async () => 0,
};

/**
 * Upload handlers of the Session tables (ADR 0037, 0038), with the same rules as the plan tables:
 * strict data, the writer's own rows, dirty-field PATCH merged onto the stored row, and DELETE as a
 * soft delete that cascades down a Session. A Session never refuses a second unfinished Session:
 * two started offline must both arrive. Sets are their own rows, so a Tick on one device cannot
 * overwrite a different set edited on another. A restore only brings back rows that fitted
 * the limits before, so it checks none for the cascade. Tombstones are not purged yet, as for plans.
 */
export const sessionSyncHandlers: readonly SyncTableHandler[] = [
  sessionSyncHandler,
  sessionExerciseSyncHandler,
  sessionSetSyncHandler,
  gymEquipmentSyncHandler,
  exerciseSettingSyncHandler,
];
