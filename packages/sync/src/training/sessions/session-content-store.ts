import { v7 as uuidv7 } from "uuid";

import {
  actualValuesSchema,
  planLeaveSuperset,
  planSupersetRepair,
  planSupersetWithNext,
  sessionExerciseInput,
  defaultPlannedSets,
  defaultRestSeconds,
  planSupersetAfterMove,
  planSupersetAfterRemoval,
  SESSION_LIMITS,
  SET_FIELDS,
  sessionSetInput,
  sessionSetSchema,
  tickValues,
  type ActualValues,
  type ExerciseType,
  type Ghosts,
  type PlannedSet,
  type SetField,
  type SupersetItem,
} from "@workspace/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { byPosition, keyAfterLast, keyForMove, keysAfterLast, keysBetween } from "../position";
import {
  applySessionSupersetChanges,
  assertSessionRoom,
  exerciseInfoOf,
  exercisesInSession,
  installIdOf,
  isRestSeconds,
  rebalanceSessionExercises,
  rebalanceSessionSets,
  requireSession,
  requireSessionExercise,
  sessionExerciseListOf,
  sessionSetListOf,
  sessionSupersetRowsOf,
  setsInExercise,
  writeRest,
  type RestTimes,
  type SessionExerciseRow,
  type SessionSetRow,
} from "./session-common";
import { clearRestIn } from "./session-store";
import {
  changedFields,
  marked,
  nowIso,
  ownerOf,
  write,
  type Tx,
  type TrainingDatabase,
  type TrainingPreferences,
  DEFAULT_PREFERENCES,
} from "../store-common";
import { exerciseSetting, session, sessionExercise, sessionSet } from "../tables";

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

const exercisePatchSchema = z
  .strictObject({
    note: sessionExerciseInput.shape.note,
    rest_seconds: sessionExerciseInput.shape.rest_seconds,
    log_effort: sessionExerciseInput.shape.log_effort,
  })
  .partial();
/** What the user edits on a Session exercise: the pinned note, the rest, the effort column. */
export type SessionExercisePatch = z.infer<typeof exercisePatchSchema>;

/**
 * Changes only the fields that differ: the exercise's note, its rest (`null` or 0 is off) and
 * whether the effort column shows. A rest edit repairs supersets (only the last member holds it).
 * Returns whether it wrote.
 */
export async function updateSessionExercise(
  database: TrainingDatabase,
  id: string,
  patch: SessionExercisePatch,
  expectedInstallId?: string,
): Promise<boolean> {
  const fields = exercisePatchSchema.parse(patch);
  return write(database, expectedInstallId, async (tx) => {
    const [current] = await tx
      .select()
      .from(sessionExercise)
      .where(eq(sessionExercise.id, id))
      .limit(1);
    if (!current) return false;
    const changes = changedFields(current, fields);
    if (Object.keys(changes).length === 0) return false;
    await tx.update(sessionExercise).set(changes).where(eq(sessionExercise.id, id));
    if ("rest_seconds" in changes) {
      await applySessionSupersetChanges(
        tx,
        planSupersetRepair(await sessionSupersetRowsOf(tx, current.session_id)),
      );
    }
    return true;
  });
}

/**
 * "Superset with next": the exercise and the one after it share a group, as in the editor. Rest
 * stays on the last member. Returns whether it wrote.
 */
export function supersetSessionWithNext(
  database: TrainingDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const current = await requireSessionExercise(tx, id);
    const rows = await sessionSupersetRowsOf(tx, current.session_id);
    const changes = planSupersetWithNext(rows, id, uuidv7());
    await applySessionSupersetChanges(tx, changes);
    return changes.length > 0;
  });
}

/**
 * "Remove from superset": the exercise leaves its group, which is cleared when one member is
 * left; whoever ends up alone or last keeps the group's rest. Returns whether it wrote.
 */
export function leaveSessionSuperset(
  database: TrainingDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const current = await requireSessionExercise(tx, id);
    const rows = await sessionSupersetRowsOf(tx, current.session_id);
    const changes = planLeaveSuperset(rows, id);
    await applySessionSupersetChanges(tx, changes);
    return changes.length > 0;
  });
}

/** What a remove took out, so the caller can offer Undo. */
export type RemovedSessionExercise = {
  exercise: SessionExerciseRow;
  sets: SessionSetRow[];
  siblings: SupersetItem[];
  removalChanges: ReturnType<typeof planSupersetAfterRemoval>;
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
    return {
      removalChanges: planSupersetAfterRemoval(rows, id),
      exercise: current,
      sets,
      siblings: rows.filter(
        (row) =>
          row.id !== id &&
          current.superset_group !== null &&
          row.superset_group === current.superset_group,
      ),
    };
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
      generated_warmup: false,
      created_at: nowIso(),
      restore: null,
    };
    checkedSet(row, parent.exercise_type);
    await tx.insert(sessionSet).values(row);
    return row.id;
  });
}

/** A warm-up nobody has touched: unticked, no value typed, no timer. Generated ramps replace these. */
function isUntouchedWarmup(row: SessionSetRow): boolean {
  return (
    row.kind === "warmup" &&
    row.completed_at === null &&
    row.timer_started_at === null &&
    [row.weight_kg, row.reps, row.duration_s, row.distance_m, row.floors, row.steps, row.rpe].every(
      (value) => value === null,
    )
  );
}

const sameTarget = (a: PlannedSet | null, b: PlannedSet) =>
  a !== null &&
  a.kind === b.kind &&
  a.weight_kg === b.weight_kg &&
  a.reps_min === b.reps_min &&
  a.reps_max === b.reps_max;

const LOAD_EPSILON = 0.0005;
/** The load a kept warm-up stands for: what was typed or ticked, else its planned load. */
const loadOfWarmup = (row: SessionSetRow): number | null =>
  row.weight_kg ?? row.target?.weight_kg ?? null;

type RampSlot =
  | { kind: "keep"; row: SessionSetRow }
  | { kind: "generate"; row: SessionSetRow | null; step: PlannedSet | null };

/**
 * How a ramp lands on the warm-ups already there, slot by slot. The n-th step of the ramp goes
 * to the n-th leading warm-up; a warm-up the user touched keeps its slot and its load, and the
 * generated steps around it must stay strictly between the kept loads before and after them, so
 * the sequence still ascends. A step that cannot fit is dropped rather than moved.
 */
function planRampSlots(lead: readonly SessionSetRow[], ramp: readonly PlannedSet[]): RampSlot[] {
  const slots: RampSlot[] = Array.from({ length: Math.max(ramp.length, lead.length) }, (_, i) => {
    const row = lead[i] ?? null;
    return row !== null && !isUntouchedWarmup(row)
      ? { kind: "keep" as const, row }
      : { kind: "generate" as const, row, step: ramp[i] ?? null };
  });
  const kept = slots.map((slot) => (slot.kind === "keep" ? loadOfWarmup(slot.row) : null));
  let lower: number | null = null;
  for (const [index, slot] of slots.entries()) {
    const own = kept[index] ?? null;
    if (slot.kind === "keep") {
      if (own !== null) lower = own;
      continue;
    }
    const upper = kept.slice(index + 1).find((load) => load !== null) ?? null;
    const weight = slot.step?.weight_kg ?? null;
    const fits =
      weight !== null &&
      (lower === null || weight > lower + LOAD_EPSILON) &&
      (upper === null || weight < upper - LOAD_EPSILON);
    if (!fits) slot.step = null;
    else lower = weight;
  }
  return slots;
}

/**
 * Puts a generated warm-up ramp at the start of an exercise's sets, reconciled slot by slot with
 * the warm-ups already there (see `planRampSlots`). Untouched warm-ups are rewritten in place (so
 * their ids survive) or removed; a warm-up that was ticked, typed into or timed is never changed
 * and bounds the generated steps around it. New rows sit after the last leading warm-up and
 * before the first other set, as warm-up rows with the step as their target (Ghost values), no
 * actual values and the generated mark. Never goes past the 20 sets an exercise may hold.
 *
 * With `options.auto` it is the automatic ramp and rechecks, inside the transaction, what the
 * screen decided from a snapshot: this device owns the unfinished Session, nothing of the
 * exercise is ticked, and Auto warm-ups is still on; otherwise it writes nothing. `options.key`
 * is the ramp's inputs; it is stored with the exercise, and an automatic call whose key is the
 * stored one writes nothing, so a warm-up the user deleted stays deleted. Returns whether it wrote.
 */
export function replaceWarmups(
  database: TrainingDatabase,
  sessionExerciseId: string,
  ramp: readonly PlannedSet[],
  expectedInstallId?: string,
  options: { key?: string | null; auto?: boolean } = {},
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const userId = await ownerOf(tx);
    const parent = await requireSessionExercise(tx, sessionExerciseId);
    const rows = (
      await tx
        .select()
        .from(sessionSet)
        .where(eq(sessionSet.session_exercise_id, sessionExerciseId))
    ).sort(byPosition);
    if (options.auto) {
      const owner = await requireSession(tx, parent.session_id);
      const [setting] = await tx
        .select({ auto: exerciseSetting.auto_warmups })
        .from(exerciseSetting)
        .where(eq(exerciseSetting.exercise_id, parent.exercise_id))
        .limit(1);
      if (
        owner.finished_at !== null ||
        owner.device_id !== (await installIdOf(tx)) ||
        rows.some((row) => row.completed_at !== null) ||
        !setting?.auto ||
        (options.key !== undefined && parent.warmup_key === options.key)
      ) {
        return false;
      }
    }
    const firstOther = rows.findIndex((row) => row.kind !== "warmup");
    const lead = firstOther < 0 ? rows : rows.slice(0, firstOther);
    const others = firstOther < 0 ? [] : rows.slice(firstOther);
    const slots = planRampSlots(lead, ramp);

    const survivors = slots.filter(
      (slot) => slot.kind === "keep" || (slot.row !== null && slot.step !== null),
    ).length;
    let room = Math.max(0, SESSION_LIMITS.setsPerExercise - survivors - others.length);
    let wrote = false;
    const fresh: PlannedSet[] = [];
    for (const slot of slots) {
      if (slot.kind === "keep") continue;
      if (slot.row === null) {
        if (slot.step !== null && room > 0) {
          fresh.push(slot.step);
          room -= 1;
        }
      } else if (slot.step === null) {
        await tx.delete(sessionSet).where(eq(sessionSet.id, slot.row.id));
        wrote = true;
      } else if (!sameTarget(slot.row.target, slot.step) || !slot.row.generated_warmup) {
        checkedSet(slot.row, parent.exercise_type, { target: slot.step });
        await tx
          .update(sessionSet)
          .set({ target: slot.step, generated_warmup: true })
          .where(eq(sessionSet.id, slot.row.id));
        wrote = true;
      }
    }
    if (fresh.length > 0) {
      const live = [
        ...slots.flatMap((slot) =>
          slot.kind === "keep" || (slot.row !== null && slot.step !== null) ? [slot.row] : [],
        ),
        ...others,
      ].filter((row) => row !== null);
      const positions = new Map(
        (await rebalanceSessionSets(tx, live)).map((item) => [item.id, item.position]),
      );
      const before = slots
        .flatMap((slot) =>
          slot.kind === "keep" || (slot.row !== null && slot.step !== null) ? [slot.row] : [],
        )
        .filter((row) => row !== null)
        .at(-1);
      const after = others[0];
      const keys = keysBetween(
        before ? (positions.get(before.id) ?? before.position) : null,
        after ? (positions.get(after.id) ?? after.position) : null,
        fresh.length,
      );
      for (const [index, target] of fresh.entries()) {
        const row = {
          id: uuidv7(),
          user_id: userId,
          session_exercise_id: sessionExerciseId,
          position: keys[index] ?? keyAfterLast(live),
          kind: "warmup" as const,
          weight_kg: null,
          reps: null,
          duration_s: null,
          distance_m: null,
          floors: null,
          steps: null,
          rpe: null,
          completed_at: null,
          timer_started_at: null,
          target,
          generated_warmup: true,
          created_at: nowIso(),
          restore: null,
        };
        checkedSet(row, parent.exercise_type);
        await tx.insert(sessionSet).values(row);
      }
      wrote = true;
    }
    if (options.key !== undefined && parent.warmup_key !== options.key) {
      await tx
        .update(sessionExercise)
        .set({ warmup_key: options.key })
        .where(eq(sessionExercise.id, sessionExerciseId));
      wrote = true;
    }
    return wrote;
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
    const owner = await requireSession(tx, parent.session_id);
    const filled = tickValues({ ...current, ...changes }, {}, SET_FIELDS[parent.exercise_type]);
    await tx
      .update(sessionSet)
      .set({
        ...changes,
        ...(current.generated_warmup ? { generated_warmup: false } : {}),
        ...(owner.finished_at !== null && current.completed_at === null && filled.ok
          ? { completed_at: nowIso() }
          : {}),
      })
      .where(eq(sessionSet.id, id));
    return true;
  });
}

export type TickResult =
  // `rest` is there when the tick also started a Rest.
  | { ok: true; wrote: boolean; values: Partial<ActualValues>; rest?: RestTimes }
  | { ok: false; missing: SetField[] };

/**
 * Ticks a set: empty cells adopt their Ghost value and `completed_at` is set, in one write of one
 * row in one transaction, so it cannot overwrite another set. A set missing a required value with
 * no Ghost for it is refused with the list of those fields, and nothing is written. Ticking a
 * ticked set writes nothing. A running timer on the set stops.
 * `restSeconds` (1 to 600) also starts the Rest after it in the same transaction, so a tick is one
 * local change for the screens that watch the Session rather than two. An automatic countdown
 * tick uses its original expiry and never starts a rest that has already elapsed.
 */
export function tickSet(
  database: TrainingDatabase,
  id: string,
  ghosts: Ghosts,
  expectedInstallId?: string,
  restSeconds?: number | null,
  expiresAt?: number,
): Promise<TickResult> {
  if (restSeconds != null && !isRestSeconds(restSeconds)) {
    return Promise.reject(new Error("Rest is 1 to 600 seconds"));
  }
  return write(database, expectedInstallId, async (tx): Promise<TickResult> => {
    const [current] = await tx.select().from(sessionSet).where(eq(sessionSet.id, id)).limit(1);
    if (!current) throw new Error("The set is gone");
    if (current.completed_at !== null) return { ok: true, wrote: false, values: {} };
    const now = Date.now();
    const duration = current.duration_s ?? current.target?.duration_s;
    if (expiresAt !== undefined) {
      const startedAt = Date.parse(current.timer_started_at ?? "");
      if (duration == null || startedAt + duration * 1000 !== expiresAt || expiresAt > now) {
        return { ok: true, wrote: false, values: {} };
      }
    }
    const completedAt = expiresAt ?? now;
    const parent = await requireSessionExercise(tx, current.session_exercise_id);
    const result = tickValues(current, ghosts, SET_FIELDS[parent.exercise_type]);
    if (!result.ok) {
      // A countdown with a missing field keeps its elapsed duration and stops in the same write.
      if (expiresAt !== undefined && duration != null) {
        await tx
          .update(sessionSet)
          .set({ duration_s: duration, timer_started_at: null })
          .where(eq(sessionSet.id, id));
      }
      return result;
    }
    const changes = {
      ...result.values,
      completed_at: new Date(completedAt).toISOString(),
      ...(current.timer_started_at === null ? {} : { timer_started_at: null }),
      ...(current.generated_warmup ? { generated_warmup: false } : {}),
    };
    checkedSet(current, parent.exercise_type, changes);
    await tx.update(sessionSet).set(changes).where(eq(sessionSet.id, id));
    if (restSeconds == null || completedAt + restSeconds * 1000 <= now) {
      return { ok: true, wrote: true, values: result.values };
    }
    if (expiresAt !== undefined) {
      const owner = await requireSession(tx, parent.session_id);
      if (owner.rest_started_at && Date.parse(owner.rest_started_at) > expiresAt) {
        return { ok: true, wrote: true, values: result.values };
      }
    }
    const rest = await writeRest(tx, parent.session_id, id, restSeconds, completedAt);
    return { ok: true, wrote: true, values: result.values, rest };
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

/** A removed set with the exercise's ramp key at the time, which Undo compares with the current one. */
export type RemovedSet = SessionSetRow & { rampKey?: string | null };

/** Removes a set (ticked or not). Returns it for Undo, or null if it is gone. */
export function removeSet(
  database: TrainingDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<RemovedSet | null> {
  return write(database, expectedInstallId, async (tx) => {
    const [current] = await tx.select().from(sessionSet).where(eq(sessionSet.id, id)).limit(1);
    if (!current) return null;
    const parent = await requireSessionExercise(tx, current.session_exercise_id);
    await clearRestStartedBy(tx, parent.session_id, id);
    await tx.delete(sessionSet).where(eq(sessionSet.id, id));
    return { ...current, rampKey: parent.warmup_key };
  });
}

async function clearRestStartedBy(tx: Tx, sessionId: string, setId: string) {
  const [owner] = await tx.select().from(session).where(eq(session.id, sessionId)).limit(1);
  if (owner?.rest_set_id === setId) await clearRestIn(tx, sessionId);
}

/**
 * Restores a saved set without overwriting a live row or recreating its missing parent. A
 * generated warm-up is not restored once the ramp was rebuilt since (a different key) or another
 * generated warm-up with the same target filled its slot, so Undo cannot duplicate a step.
 */
export function restoreSet(
  database: TrainingDatabase,
  removed: RemovedSet,
  expectedInstallId?: string,
): Promise<boolean> {
  const { rampKey, ...row } = removed;
  return write(database, expectedInstallId, async (tx) => {
    const [existing] = await tx.select().from(sessionSet).where(eq(sessionSet.id, row.id)).limit(1);
    const [parent] = await tx
      .select()
      .from(sessionExercise)
      .where(eq(sessionExercise.id, row.session_exercise_id))
      .limit(1);
    if (existing || !parent) return false;
    if (row.generated_warmup) {
      const siblings = await tx
        .select()
        .from(sessionSet)
        .where(eq(sessionSet.session_exercise_id, parent.id));
      const rebuilt = rampKey !== undefined && rampKey !== parent.warmup_key;
      const filled = siblings.some(
        (sibling) =>
          sibling.generated_warmup && row.target !== null && sameTarget(sibling.target, row.target),
      );
      if (rebuilt || filled) return false;
    }
    assertSessionRoom(await setsInExercise(tx, parent.id), 1, "setsPerExercise");
    await tx.insert(sessionSet).values(marked(row));
    return true;
  });
}

/** Restores the exercise and all saved sets atomically with their original ids and positions. */
export function restoreSessionExercise(
  database: TrainingDatabase,
  removed: RemovedSessionExercise,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(sessionExercise)
      .where(eq(sessionExercise.id, removed.exercise.id))
      .limit(1);
    const [parent] = await tx
      .select()
      .from(session)
      .where(eq(session.id, removed.exercise.session_id))
      .limit(1);
    if (existing || !parent) return false;
    assertSessionRoom(await exercisesInSession(tx, parent.id), 1, "exercisesPerSession");
    await tx.insert(sessionExercise).values(marked(removed.exercise));
    if (removed.sets.length > 0) await tx.insert(sessionSet).values(removed.sets.map(marked));
    const expected = removed.removalChanges;
    for (const sibling of removed.siblings) {
      const [live] = await tx
        .select()
        .from(sessionExercise)
        .where(eq(sessionExercise.id, sibling.id))
        .limit(1);
      const change = expected.find((row) => row.id === sibling.id);
      if (
        live &&
        live.superset_group ===
          (change?.superset_group === undefined ? sibling.superset_group : change.superset_group) &&
        live.rest_seconds ===
          (change?.rest_seconds === undefined ? sibling.rest_seconds : change.rest_seconds)
      ) {
        await applySessionSupersetChanges(tx, [sibling]);
      }
    }
    return true;
  });
}
