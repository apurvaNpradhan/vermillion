import { v7 as uuidv7 } from "uuid";

import {
  actualValuesSchema,
  defaultPlannedSets,
  defaultRestSeconds,
  planSupersetAfterMove,
  planSupersetAfterRemoval,
  SET_FIELDS,
  sessionSetInput,
  sessionSetSchema,
  tickValues,
  type ActualValues,
  type ExerciseType,
  type Ghosts,
  type PlannedSet,
  type SetField,
} from "@workspace/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { keyAfterLast, keyForMove, keysAfterLast } from "./position";
import {
  applySessionSupersetChanges,
  assertSessionRoom,
  exerciseInfoOf,
  exercisesInSession,
  rebalanceSessionExercises,
  rebalanceSessionSets,
  requireSession,
  requireSessionExercise,
  sessionExerciseListOf,
  sessionSetListOf,
  sessionSupersetRowsOf,
  setsInExercise,
  type SessionExerciseRow,
  type SessionSetRow,
} from "./session-common";
import { clearRestIn } from "./session-store";
import {
  changedFields,
  nowIso,
  ownerOf,
  write,
  type Tx,
  type TrainingDatabase,
  type TrainingPreferences,
  DEFAULT_PREFERENCES,
} from "./store-common";
import { session, sessionExercise, sessionSet } from "./tables";

/** The rest a Session exercise starts with, as the editor gives it (the preference, raised for barbell lifts). */
function restFor(
  info: Awaited<ReturnType<typeof exerciseInfoOf>>,
  preferences: TrainingPreferences,
) {
  return defaultRestSeconds(info.exercise_type, preferences.defaultRestSeconds, {
    equipment: info.equipment,
    secondaryMuscles: info.secondary_muscles,
  });
}

async function insertDefaultSets(
  tx: Tx,
  userId: string,
  sessionExerciseId: string,
  targets: readonly PlannedSet[],
) {
  const keys = keysAfterLast([], targets.length);
  for (const [index, target] of targets.entries()) {
    await tx.insert(sessionSet).values({
      id: uuidv7(),
      user_id: userId,
      session_exercise_id: sessionExerciseId,
      position: keys[index] ?? "a0",
      kind: target.kind,
      target,
      created_at: nowIso(),
    });
  }
}

// ---- Exercises of a Session ----

/**
 * Appends exercises to a Session in the given order, each with the editor's defaults of its type
 * (3 working sets as targets, rest from the preference). Returns the new Session exercise ids.
 */
export function addSessionExercises(
  database: TrainingDatabase,
  sessionId: string,
  exerciseIds: readonly string[],
  preferences: TrainingPreferences = DEFAULT_PREFERENCES,
  expectedInstallId?: string,
): Promise<string[]> {
  return write(database, expectedInstallId, async (tx) => {
    const userId = await ownerOf(tx);
    await requireSession(tx, sessionId);
    assertSessionRoom(
      await exercisesInSession(tx, sessionId),
      exerciseIds.length,
      "exercisesPerSession",
    );
    const items = await rebalanceSessionExercises(tx, await sessionExerciseListOf(tx, sessionId));
    const keys = keysAfterLast(items, exerciseIds.length);
    const ids: string[] = [];
    for (const [index, exerciseId] of exerciseIds.entries()) {
      const info = await exerciseInfoOf(tx, exerciseId);
      const id = uuidv7();
      await tx.insert(sessionExercise).values({
        id,
        user_id: userId,
        session_id: sessionId,
        exercise_id: exerciseId,
        exercise_title: info.title,
        exercise_type: info.exercise_type,
        source_workout_exercise_id: null,
        position: keys[index] ?? keyAfterLast(items),
        rest_seconds: restFor(info, preferences),
        note: null,
        superset_group: null,
        log_effort: false,
        created_at: nowIso(),
      });
      await insertDefaultSets(tx, userId, id, defaultPlannedSets(info.exercise_type));
      ids.push(id);
    }
    return ids;
  });
}

/**
 * Swaps the exercise of a Session exercise. The same type keeps its sets, rest and note; another
 * type drops the sets (their values cannot carry over) for that type's defaults and takes its
 * default rest, keeping the note. Previous and Ghost values then come from the new exercise's own
 * history. False if it is the same exercise.
 */
export function replaceSessionExercise(
  database: TrainingDatabase,
  id: string,
  exerciseId: string,
  preferences: TrainingPreferences = DEFAULT_PREFERENCES,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const userId = await ownerOf(tx);
    const current = await requireSessionExercise(tx, id);
    if (current.exercise_id === exerciseId) return false;
    const after = await exerciseInfoOf(tx, exerciseId);
    const kept = current.exercise_type === after.exercise_type;
    await tx
      .update(sessionExercise)
      .set({
        exercise_id: exerciseId,
        exercise_title: after.title,
        exercise_type: after.exercise_type,
        ...(kept ? {} : { rest_seconds: restFor(after, preferences) }),
      })
      .where(eq(sessionExercise.id, id));
    if (!kept) {
      await tx.delete(sessionSet).where(eq(sessionSet.session_exercise_id, id));
      await insertDefaultSets(tx, userId, id, defaultPlannedSets(after.exercise_type));
    }
    return true;
  });
}

/** Moves a Session exercise to just before `beforeId` (`null` = the end). Rewrites one row. */
export function moveSessionExercise(
  database: TrainingDatabase,
  id: string,
  beforeId: string | null,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const current = await requireSessionExercise(tx, id);
    const items = await rebalanceSessionExercises(
      tx,
      await sessionExerciseListOf(tx, current.session_id),
    );
    if (beforeId === id) return false;
    const position = keyForMove(items, id, beforeId);
    const rowsBefore = await sessionSupersetRowsOf(tx, current.session_id);
    await tx.update(sessionExercise).set({ position }).where(eq(sessionExercise.id, id));
    // A member dragged out of its run leaves the group; a row dropped inside one joins it.
    const rowsAfter = await sessionSupersetRowsOf(tx, current.session_id);
    await applySessionSupersetChanges(tx, planSupersetAfterMove(rowsBefore, rowsAfter, id));
    return true;
  });
}

/** What a remove took out, so the caller can offer Undo. */
export type RemovedSessionExercise = {
  exercise: SessionExerciseRow;
  sets: SessionSetRow[];
};

/**
 * Removes an exercise and its sets from the Session (ticked ones too). A Rest started by one of
 * them is cleared. Returns what was removed, or null if it is gone.
 */
export function removeSessionExercise(
  database: TrainingDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<RemovedSessionExercise | null> {
  return write(database, expectedInstallId, async (tx) => {
    const [current] = await tx
      .select()
      .from(sessionExercise)
      .where(eq(sessionExercise.id, id))
      .limit(1);
    if (!current) return null;
    const sets = await tx.select().from(sessionSet).where(eq(sessionSet.session_exercise_id, id));
    const rows = await sessionSupersetRowsOf(tx, current.session_id);
    const [owner] = await tx
      .select()
      .from(session)
      .where(eq(session.id, current.session_id))
      .limit(1);
    if (owner?.rest_set_id && sets.some((set) => set.id === owner.rest_set_id)) {
      await clearRestIn(tx, current.session_id);
    }
    await tx.delete(sessionSet).where(eq(sessionSet.session_exercise_id, id));
    await tx.delete(sessionExercise).where(eq(sessionExercise.id, id));
    // A group left with one member is cleared; the group's rest passes to its new last member.
    await applySessionSupersetChanges(tx, planSupersetAfterRemoval(rows, id));
    return { exercise: current, sets };
  });
}

// ---- Logged sets ----

const setPatchSchema = z
  .strictObject({
    kind: sessionSetInput.shape.kind,
    timer_started_at: sessionSetInput.shape.timer_started_at,
    ...actualValuesSchema.shape,
  })
  .partial();
/** What the user edits on a set: kind, actual values, the timer start. Ticking has its own call. */
export type SetPatch = z.infer<typeof setPatchSchema>;

/** The checked shape of a set row of `type`, for the rules of {@link sessionSetSchema}. */
function checkedSet(row: SessionSetRow, type: ExerciseType, changes: Partial<SessionSetRow> = {}) {
  const merged = { ...row, ...changes };
  return sessionSetSchema(type).parse({
    session_exercise_id: merged.session_exercise_id,
    position: merged.position,
    kind: merged.kind,
    weight_kg: merged.weight_kg,
    reps: merged.reps,
    duration_s: merged.duration_s,
    distance_m: merged.distance_m,
    floors: merged.floors,
    steps: merged.steps,
    rpe: merged.rpe,
    completed_at: merged.completed_at,
    timer_started_at: merged.timer_started_at,
    target: merged.target,
  });
}

/**
 * Appends a set to a Session exercise (20 at most). It starts empty and unticked, with the given
 * kind (`working` by default), values and target; only what the exercise type records is allowed.
 * Returns the new set id.
 */
export async function addSet(
  database: TrainingDatabase,
  sessionExerciseId: string,
  input: SetPatch & { target?: PlannedSet | null } = {},
  expectedInstallId?: string,
): Promise<string> {
  const { target, ...patch } = input;
  const fields = setPatchSchema.parse(patch);
  return write(database, expectedInstallId, async (tx) => {
    const userId = await ownerOf(tx);
    const parent = await requireSessionExercise(tx, sessionExerciseId);
    assertSessionRoom(await setsInExercise(tx, sessionExerciseId), 1, "setsPerExercise");
    const items = await rebalanceSessionSets(tx, await sessionSetListOf(tx, sessionExerciseId));
    const row = {
      id: uuidv7(),
      user_id: userId,
      session_exercise_id: sessionExerciseId,
      position: keyAfterLast(items),
      kind: fields.kind ?? "working",
      weight_kg: fields.weight_kg ?? null,
      reps: fields.reps ?? null,
      duration_s: fields.duration_s ?? null,
      distance_m: fields.distance_m ?? null,
      floors: fields.floors ?? null,
      steps: fields.steps ?? null,
      rpe: fields.rpe ?? null,
      completed_at: null,
      timer_started_at: fields.timer_started_at ?? null,
      target: target ?? null,
      created_at: nowIso(),
      restore: null,
    };
    checkedSet(row, parent.exercise_type);
    await tx.insert(sessionSet).values(row);
    return row.id;
  });
}

/**
 * Changes only the fields that differ from the stored set: its kind, actual values or timer
 * start. A ticked set must keep a value for every field its type records. Returns whether it wrote.
 */
export async function updateSet(
  database: TrainingDatabase,
  id: string,
  patch: SetPatch,
  expectedInstallId?: string,
): Promise<boolean> {
  const fields = setPatchSchema.parse(patch);
  return write(database, expectedInstallId, async (tx) => {
    const [current] = await tx.select().from(sessionSet).where(eq(sessionSet.id, id)).limit(1);
    if (!current) return false;
    const changes = changedFields(current, fields);
    if (Object.keys(changes).length === 0) return false;
    const parent = await requireSessionExercise(tx, current.session_exercise_id);
    checkedSet(current, parent.exercise_type, changes);
    await tx.update(sessionSet).set(changes).where(eq(sessionSet.id, id));
    return true;
  });
}

export type TickResult =
  | { ok: true; wrote: boolean; values: Partial<ActualValues> }
  | { ok: false; missing: SetField[] };

/**
 * Ticks a set: empty cells adopt their Ghost value and `completed_at` is set, in one write of one
 * row in one transaction, so it cannot overwrite another set. A set missing a required value with
 * no Ghost for it is refused with the list of those fields, and nothing is written. Ticking a
 * ticked set writes nothing. A running timer on the set stops.
 */
export function tickSet(
  database: TrainingDatabase,
  id: string,
  ghosts: Ghosts,
  expectedInstallId?: string,
): Promise<TickResult> {
  return write(database, expectedInstallId, async (tx): Promise<TickResult> => {
    const [current] = await tx.select().from(sessionSet).where(eq(sessionSet.id, id)).limit(1);
    if (!current) throw new Error("The set is gone");
    if (current.completed_at !== null) return { ok: true, wrote: false, values: {} };
    const parent = await requireSessionExercise(tx, current.session_exercise_id);
    const result = tickValues(current, ghosts, SET_FIELDS[parent.exercise_type]);
    if (!result.ok) return result;
    const changes = {
      ...result.values,
      completed_at: nowIso(),
      ...(current.timer_started_at === null ? {} : { timer_started_at: null }),
    };
    checkedSet(current, parent.exercise_type, changes);
    await tx.update(sessionSet).set(changes).where(eq(sessionSet.id, id));
    return { ok: true, wrote: true, values: result.values };
  });
}

/**
 * Unticks a set, keeping its values. Unticking the set that started the running Rest cancels it.
 * Returns whether it wrote.
 */
export function untickSet(
  database: TrainingDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const [current] = await tx.select().from(sessionSet).where(eq(sessionSet.id, id)).limit(1);
    if (!current || current.completed_at === null) return false;
    const parent = await requireSessionExercise(tx, current.session_exercise_id);
    await tx.update(sessionSet).set({ completed_at: null }).where(eq(sessionSet.id, id));
    await clearRestStartedBy(tx, parent.session_id, id);
    return true;
  });
}

/** Removes a set (ticked or not). Returns it for Undo, or null if it is gone. */
export function removeSet(
  database: TrainingDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<SessionSetRow | null> {
  return write(database, expectedInstallId, async (tx) => {
    const [current] = await tx.select().from(sessionSet).where(eq(sessionSet.id, id)).limit(1);
    if (!current) return null;
    const parent = await requireSessionExercise(tx, current.session_exercise_id);
    await clearRestStartedBy(tx, parent.session_id, id);
    await tx.delete(sessionSet).where(eq(sessionSet.id, id));
    return current;
  });
}

async function clearRestStartedBy(tx: Tx, sessionId: string, setId: string) {
  const [owner] = await tx.select().from(session).where(eq(session.id, sessionId)).limit(1);
  if (owner?.rest_set_id === setId) await clearRestIn(tx, sessionId);
}
