import { sessionMediaCleanupQueue } from "./session-media-cleanup";
import { sessionPhotoSyncHandler } from "./photo-sync";
import { checkSessionRun } from "./run-sync";
import type { DbExecutor } from "@workspace/db";
import {
  EXERCISE_TYPES,
  PAUSE_AUTO_RESUME_MS,
  exerciseSettingInput,
  gymEquipmentInput,
  importDigestSchema,
  plannedSetSchema,
  SESSION_LIMITS,
  SYNC_LIMITS,
  sessionExerciseInput,
  sessionInput,
  sessionSetInput,
  sessionSetSchema,
  sessionStartAllowed,
  sessionTimesConsistent,
  settleFinishedPause,
  shiftForPause,
  type SessionInput,
  type SessionSetInput,
} from "@workspace/shared";
import { and, eq, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import { z } from "zod";

import { SyncRejection, type SyncTableHandler } from "../platform/sync/handler";
import {
  deleteSessionCascade,
  importedSessionUnchanged,
  deleteSessionExerciseCascade,
  restoreSessionCascade,
  restoreSessionExerciseCascade,
} from "./operations/session-cascade";
import { ensureDefaultGym, resolveSessionGym } from "./operations/gyms";
import {
  countLiveSessionExercises,
  countLiveSessionSets,
  findEquipment,
  findExerciseSetting,
  findSession,
  findSessionExercise,
  findSessionSet,
  liveGym,
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
const wireWarmupKey = z.string().max(500).nullable();
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

/** The gym a Session writes: its own live gym, no gym for a deleted or unknown one. */
async function sessionGym(db: DbExecutor, userId: string, gymId: string | null) {
  const resolved = await resolveSessionGym(db, userId, gymId);
  if (resolved === "refuse") throw new SyncRejection("SESSION_PARENT_NOT_FOUND");
  return resolved.gymId;
}

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
  workout_structure: z.string().max(SYNC_LIMITS.maxValueBytes).nullable().optional(),
  import_batch_id: z.uuid().nullable().optional(),
  import_fingerprint: importDigestSchema.nullable().optional(),
  import_content: importDigestSchema.nullable().optional(),
  import_undo: z.null().optional(),
  program_id: sessionInput.shape.program_id.default(null),
  run_id: sessionInput.shape.run_id.default(null),
  slot_id: sessionInput.shape.slot_id.default(null),
  gym_id: sessionInput.shape.gym_id.default(null),
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
  // Older apps do not send the pause: a Session they write is running.
  paused_at: sessionInput.shape.paused_at.default(null),
  paused_ms: sessionInput.shape.paused_ms.default(0),
});
const undoImport = z.strictObject({
  import_undo: z
    .string()
    .transform((request) => request.split(":"))
    .pipe(z.tuple([z.uuid(), z.uuid()])),
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
    gym_id: row.gymId,
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
    paused_at: iso(row.pausedAt),
    paused_ms: row.pausedMs,
  };
}

function sessionColumns(values: SessionInput) {
  return {
    workoutId: values.workout_id,
    programId: values.program_id,
    runId: values.run_id,
    slotId: values.slot_id,
    gymId: values.gym_id,
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
    pausedAt: date(values.paused_at),
    pausedMs: values.paused_ms,
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

async function shiftRunningTimers(db: DbExecutor, id: string, pausedAt: Date, spanMs: number) {
  if (spanMs === 0) return;
  await db
    .update(sessionSet)
    .set({
      timerStartedAt: sql`${sessionSet.timerStartedAt} + ${spanMs}::bigint * interval '1 millisecond'`,
      updatedAt: now(),
    })
    .from(sessionExercise)
    .where(
      and(
        eq(sessionSet.sessionExerciseId, sessionExercise.id),
        eq(sessionExercise.sessionId, id),
        isNull(sessionExercise.deletedAt),
        isNull(sessionSet.deletedAt),
        isNull(sessionSet.completedAt),
        lte(sessionSet.timerStartedAt, pausedAt),
      ),
    );
}

function sameInstant(a: string | null, b: string | null) {
  return a === b || (a !== null && b !== null && Date.parse(a) === Date.parse(b));
}

const sessionSyncHandler: SyncTableHandler = {
  table: "training_session",
  async apply(db, userId, op, jobs) {
    const id = idOf(op.id);
    await lockUserTraining(db, userId);
    const found = await findSession(db, userId, id);

    const undo = op.op === "PATCH" ? undoImport.safeParse(op.opData) : null;
    if (op.op === "DELETE" || undo?.success) {
      const row = ownRow(found);
      if (row.deletedAt === null) {
        if (
          undo?.success &&
          (row.importBatchId !== undo.data.import_undo[0] ||
            !row.importContent ||
            !(await importedSessionUnchanged(db, id, row.importContent)))
        )
          throw new SyncRejection("SYNC_CONSTRAINT_VIOLATION");
        await deleteSessionCascade(db, id, now());
        await jobs.enqueue(
          sessionMediaCleanupQueue,
          { userId, sessionId: id },
          { startAfterSeconds: 60 },
        );
      }
      return;
    }

    if (op.op === "PUT") {
      if (found.kind === "other-user") throw new SyncRejection("SYNC_ID_CONFLICT");
      const {
        restore,
        workout_structure,
        import_batch_id,
        import_fingerprint,
        import_content,
        import_undo: _undo,
        ...data
      } = accept(putSession.safeParse(op.opData ?? {}));
      if (
        Boolean(import_fingerprint) !== Boolean(import_content) ||
        (import_fingerprint && (!import_batch_id || data.finished_at === null))
      )
        invalid();
      checkPut(found, restore);
      const values = settleFinishedPause(
        accept(
          sessionInput.safeParse({
            ...data,
            // A restore queued by an older app omits both pause columns.
            paused_at:
              op.opData?.paused_at === undefined && found.kind === "own"
                ? iso(found.row.pausedAt)
                : data.paused_at,
            paused_ms:
              op.opData?.paused_ms === undefined && found.kind === "own"
                ? found.row.pausedMs
                : data.paused_ms,
          }),
        ),
      );
      await checkSessionRun(db, userId, values);
      values.gym_id = await sessionGym(db, userId, values.gym_id);
      if (found.kind === "absent") {
        accept(newRowId.safeParse(id));
        checkSessionTimes(values, null);
        await db.insert(session).values({
          id,
          userId,
          workoutStructure: workout_structure ?? null,
          importBatchId: import_batch_id ?? null,
          importFingerprint: import_fingerprint ?? null,
          importContent: import_content ?? null,
          ...sessionColumns(values),
        });
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
    const expected = op.expect?.paused_at;
    const samePause = expected !== undefined && sameInstant(expected, before.paused_at);
    const finishing = patch.finished_at != null && expected !== undefined;
    if (finishing && before.finished_at !== null) return;
    const incomingPauseMs = patch.paused_ms ?? op.expect?.paused_ms ?? 0;
    if (patch.finished_at != null) {
      if (before.finished_at === null && !samePause) {
        // A stale finisher cannot clear a newer pause or overwrite accumulated time.
        patch.paused_at = before.paused_at;
        patch.paused_ms = before.paused_ms;
      } else if (patch.paused_ms !== undefined && expected !== undefined) {
        patch.paused_ms = Math.min(
          Number.MAX_SAFE_INTEGER,
          before.paused_ms + Math.max(0, patch.paused_ms - (op.expect?.paused_ms ?? 0)),
        );
      }
    } else if (patch.paused_at === null && expected != null) {
      // These Rest times were shifted from the device's snapshot. Shift the current Rest instead.
      delete patch.rest_started_at;
      delete patch.rest_ends_at;
      if (samePause && row.pausedAt !== null && before.finished_at === null) {
        const spanMs = Math.min(
          PAUSE_AUTO_RESUME_MS,
          Math.max(0, (patch.paused_ms ?? 0) - (op.expect?.paused_ms ?? 0)),
        );
        patch.paused_ms = Math.min(Number.MAX_SAFE_INTEGER, before.paused_ms + spanMs);
        if (before.rest_started_at !== null && before.rest_ends_at !== null) {
          const rest = shiftForPause(
            { startedAt: before.rest_started_at, endsAt: before.rest_ends_at },
            row.pausedAt.getTime(),
            spanMs,
          );
          patch.rest_started_at = rest.startedAt;
          patch.rest_ends_at = rest.endsAt;
        }
        await shiftRunningTimers(db, id, row.pausedAt, spanMs);
      } else {
        delete patch.paused_at;
        delete patch.paused_ms;
      }
    } else if (patch.paused_at != null && expected === null) {
      // Concurrent pause presses keep the pause already accepted by the server.
      if (before.paused_at !== null || before.finished_at !== null) delete patch.paused_at;
      else if (Date.parse(patch.paused_at) < row.startedAt.getTime()) {
        patch.paused_at = before.started_at;
      }
    }
    if (patch.paused_ms !== undefined)
      patch.paused_ms = Math.max(before.paused_ms, patch.paused_ms);
    if (
      before.finished_at === null &&
      patch.finished_at === undefined &&
      patch.started_at !== undefined
    ) {
      const pausedAt = patch.paused_at === undefined ? before.paused_at : patch.paused_at;
      const start = new Date(patch.started_at);
      // A tick or pause from a different install can have arrived after the edit was queued.
      const [earlierSet] = await db
        .select({ id: sessionSet.id })
        .from(sessionSet)
        .innerJoin(sessionExercise, eq(sessionSet.sessionExerciseId, sessionExercise.id))
        .where(
          and(
            eq(sessionExercise.sessionId, id),
            isNull(sessionExercise.deletedAt),
            isNull(sessionSet.deletedAt),
            lt(sessionSet.completedAt, start),
          ),
        )
        .limit(1);
      if (earlierSet || (pausedAt !== null && start.getTime() > Date.parse(pausedAt))) {
        delete patch.started_at;
      }
    }
    // Older builds and stale finishers may leave the server's pause open.
    const merged = settleFinishedPause(accept(sessionInput.safeParse({ ...before, ...patch })));
    if (finishing && merged.finished_at !== null && merged.duration_s !== null) {
      const base = Date.parse(merged.started_at) + merged.duration_s * 1000;
      // Keep an explicit duration and its synthetic end in step after reconciling the pause.
      if (Date.parse(merged.finished_at) === base + incomingPauseMs) {
        const end = new Date(base + merged.paused_ms);
        if (!Number.isNaN(end.getTime()) && end.getUTCFullYear() <= 9999)
          merged.finished_at = end.toISOString();
      }
    }
    await checkSessionRun(db, userId, merged);
    if (patch.gym_id !== undefined) merged.gym_id = await sessionGym(db, userId, merged.gym_id);
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
  warmup_key: wireWarmupKey.optional(),
  repeated: wireBoolean.optional(),
  workout_swap_fragment: wireBoolean.nullable().optional(),
});
// An exercise never moves to another Session.
const patchSessionExercise = z
  .strictObject({
    ...sessionExerciseInput.omit({ session_id: true }).shape,
    log_effort: wireBoolean,
    warmup_key: wireWarmupKey,
    workout_swap_fragment: wireBoolean.nullable(),
  })
  .partial();

// The training advisory lock serializes this check with set completion on another device.
async function assertExerciseHasNoCompletedSets(db: DbExecutor, id: string) {
  const [completed] = await db
    .select({ id: sessionSet.id })
    .from(sessionSet)
    .where(
      and(
        eq(sessionSet.sessionExerciseId, id),
        isNull(sessionSet.deletedAt),
        isNotNull(sessionSet.completedAt),
      ),
    )
    .limit(1);
  if (completed) throw new SyncRejection("SYNC_CONSTRAINT_VIOLATION");
}

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
      const {
        restore,
        warmup_key: warmupKey,
        repeated,
        workout_swap_fragment: workoutSwapFragment,
        ...data
      } = accept(putSessionExercise.safeParse(op.opData ?? {}));
      checkPut(found, restore);
      const values = accept(sessionExerciseInput.safeParse(data));
      const extra = {
        ...(warmupKey === undefined ? {} : { warmupKey }),
        // Set when the exercise is created and never edited, so a PUT that omits it keeps it.
        ...(repeated === undefined ? {} : { repeated }),
        ...(workoutSwapFragment === undefined ? {} : { workoutSwapFragment }),
      };
      if (found.kind === "own" && found.row.sessionId !== values.session_id) return invalid();
      if (!(await liveSession(db, userId, values.session_id))) parentMissing();
      await exerciseVisible(db, userId, values.exercise_id);
      const live = await countLiveSessionExercises(db, values.session_id, id);
      if (found.kind === "absent") {
        accept(newRowId.safeParse(id));
        assertRoom(live, 1, SESSION_LIMITS.exercisesPerSession, "SESSION_LIMIT_REACHED");
        await db
          .insert(sessionExercise)
          .values({ id, userId, sessionId: values.session_id, ...columns(values), ...extra });
        return;
      }
      if (found.row.exerciseId !== values.exercise_id) {
        await assertExerciseHasNoCompletedSets(db, id);
      }
      const deletedAt = found.row.deletedAt;
      if (deletedAt !== null) {
        assertRoom(live, 1, SESSION_LIMITS.exercisesPerSession, "SESSION_LIMIT_REACHED");
        await restoreSessionExerciseCascade(db, id, deletedAt, now());
      }
      await db
        .update(sessionExercise)
        .set({ ...columns(values), ...extra, updatedAt: now() })
        .where(eq(sessionExercise.id, id));
      return;
    }

    const row = liveRow(found);
    const {
      warmup_key: warmupKey,
      workout_swap_fragment: workoutSwapFragment,
      ...patch
    } = accept(patchSessionExercise.safeParse(op.opData ?? {}));
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
    if (patch.exercise_id !== undefined && patch.exercise_id !== row.exerciseId) {
      await assertExerciseHasNoCompletedSets(db, id);
    }
    await db
      .update(sessionExercise)
      .set({
        ...columns(merged),
        ...(warmupKey === undefined ? {} : { warmupKey }),
        ...(workoutSwapFragment === undefined ? {} : { workoutSwapFragment }),
        updatedAt: now(),
      })
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
  generated_warmup: wireBoolean.optional(),
});
// A set never moves to another exercise.
const patchSessionSet = z
  .strictObject({
    ...sessionSetInput.omit({ session_exercise_id: true, target: true }).shape,
    target: wireTarget,
    generated_warmup: wireBoolean,
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
      // The writer last saw this set unticked (or at some time); another device completing it
      // since must not be erased by a queued swap or delete. Roll the whole transaction back.
      const known = op.expect?.completed_at;
      if (known !== undefined && row.deletedAt === null) {
        const stored = row.completedAt?.getTime() ?? null;
        const expected = known === null ? null : Date.parse(known);
        if (stored !== expected) throw new SyncRejection("SYNC_CONSTRAINT_VIOLATION");
      }
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
      const {
        restore,
        generated_warmup: generated,
        ...data
      } = accept(putSessionSet.safeParse(op.opData ?? {}));
      const marked = generated === undefined ? {} : { generatedWarmup: generated };
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
          .values({ id, userId, sessionExerciseId: parent.id, ...setColumns(values), ...marked });
        return;
      }
      if (found.row.deletedAt !== null) {
        assertRoom(live, 1, SESSION_LIMITS.setsPerExercise, "SESSION_LIMIT_REACHED");
      }
      await db
        .update(sessionSet)
        .set({ ...setColumns(values), ...marked, deletedAt: null, updatedAt: now() })
        .where(eq(sessionSet.id, id));
      return;
    }

    const row = liveRow(found);
    const { generated_warmup: generated, ...patch } = accept(
      patchSessionSet.safeParse(op.opData ?? {}),
    );
    const parent = await liveSessionExercise(db, userId, row.sessionExerciseId);
    if (!parent) parentMissing();
    const merged = validSet({ ...setRowAsInput(row), ...patch }, parent.exerciseType);
    await db
      .update(sessionSet)
      .set({
        ...setColumns(merged),
        ...(generated === undefined ? {} : { generatedWarmup: generated }),
        updatedAt: now(),
      })
      .where(eq(sessionSet.id, id));
  },
  purgeTombstones: async () => 0,
};

// ---- Gym equipment ----

const putEquipment = z.strictObject({
  restore: restoreMarker,
  seed: newRowId.optional(),
  // Rows written before gyms existed carry none: they belong to the default gym.
  gym_id: z.uuid().nullable().optional(),
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
      const { restore, seed, gym_id, ...data } = accept(putEquipment.safeParse(op.opData ?? {}));
      const values = accept(gymEquipmentInput.safeParse(data));
      if (seed) {
        if (restore) invalid();
        if (found.kind !== "absent") return;
        // The seed transaction writes its anchor first. Under the user lock, only the first kit
        // to reach an empty inventory inserts its anchor and the rest of its rows.
        if (id === seed) {
          const [existing] = await db
            .select({ id: gymEquipment.id })
            .from(gymEquipment)
            .where(and(eq(gymEquipment.userId, userId), isNull(gymEquipment.deletedAt)))
            .limit(1);
          if (existing) return;
        } else {
          const anchor = await findEquipment(db, userId, seed);
          if (anchor.kind !== "own" || anchor.row.deletedAt !== null) return;
        }
      }
      checkPut(found, restore);
      if (gym_id && !(await liveGym(db, userId, gym_id))) parentMissing();
      if (found.kind === "absent") {
        accept(newRowId.safeParse(id));
        const gymId = gym_id ?? (await ensureDefaultGym(db, userId));
        await db.insert(gymEquipment).values({ id, userId, gymId, ...equipmentColumns(values) });
        return;
      }
      await db
        .update(gymEquipment)
        .set({
          ...equipmentColumns(values),
          ...(gym_id ? { gymId: gym_id } : {}),
          deletedAt: null,
          updatedAt: now(),
        })
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
  progression_per_set: wireBoolean.optional(),
  auto_warmups: wireBoolean.optional(),
  // Unwrap the default: an omitted note must stay omitted, not become null and erase the value.
  note: exerciseSettingInput.shape.note.unwrap().optional(),
});
// A setting belongs to one exercise for good.
const patchSetting = z
  .strictObject({
    bar_id: exerciseSettingInput.shape.bar_id,
    log_effort: wireBoolean,
    progression_per_set: wireBoolean,
    auto_warmups: wireBoolean,
    note: exerciseSettingInput.shape.note.unwrap(),
  })
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
      const fields = {
        barId: values.bar_id,
        logEffort: values.log_effort,
        ...(data.progression_per_set !== undefined
          ? { progressionPerSet: values.progression_per_set }
          : {}),
        ...(data.auto_warmups !== undefined ? { autoWarmups: values.auto_warmups } : {}),
        ...(data.note !== undefined ? { note: values.note } : {}),
        updatedAt: now(),
      };
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
        ...(patch.progression_per_set !== undefined
          ? { progressionPerSet: patch.progression_per_set }
          : {}),
        ...(patch.auto_warmups !== undefined ? { autoWarmups: patch.auto_warmups } : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
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
  sessionPhotoSyncHandler,
  sessionExerciseSyncHandler,
  sessionSetSyncHandler,
  gymEquipmentSyncHandler,
  exerciseSettingSyncHandler,
];
