import { v7 as uuidv7 } from "uuid";

import {
  sessionInput,
  sessionStartAllowed,
  sessionTimesConsistent,
  type PlannedSet,
} from "@workspace/shared";
import { asc, eq, inArray } from "drizzle-orm";

import { keysAfterLast } from "./position";
import {
  assertSessionRoom,
  exerciseInfoOf,
  installIdOf,
  isRestSeconds,
  requireSession,
  writeRest,
  type DeletedSession,
  type RestTimes,
} from "./session-common";
import { marked, nowIso, ownerOf, write, type Tx, type TrainingDatabase } from "./store-common";
import {
  exerciseSetting,
  session,
  sessionExercise,
  sessionSet,
  workout,
  workoutExercise,
} from "./tables";

/** The Workout a Session starts from, or none; `derivedTitle` names a Session with no title of its own. */
export type SessionSource = {
  workoutId: string | null;
  /**
   * The title when the Workout has none (it is derived) or there is no Workout, already
   * translated by the caller. The Session stays "derived" until the user renames it.
   */
  derivedTitle: string;
};

/**
 * Copies a Workout into a new Session: its exercises with a snapshot of each title and type, its
 * sets as unticked Logged sets carrying the Planned set as their target. The Workout's title is
 * a snapshot too. Everything is written with this device as the owner.
 */
async function createSessionIn(
  tx: Tx,
  source: SessionSource,
  fields: { id: string; startedAt: string; finishedAt: string | null; durationS: number | null },
) {
  const userId = await ownerOf(tx);
  const deviceId = await installIdOf(tx);
  const [plan] =
    source.workoutId === null
      ? []
      : await tx.select().from(workout).where(eq(workout.id, source.workoutId)).limit(1);
  if (source.workoutId !== null && !plan) throw new Error("The workout is gone");
  const planned = plan
    ? await tx
        .select()
        .from(workoutExercise)
        .where(eq(workoutExercise.workout_id, plan.id))
        .orderBy(asc(workoutExercise.position), asc(workoutExercise.id))
    : [];
  assertSessionRoom(0, planned.length, "exercisesPerSession");

  const title = plan?.title ?? source.derivedTitle;
  const parsed = sessionInput.parse({
    workout_id: plan?.id ?? null,
    program_id: plan?.program_id ?? null,
    run_id: null,
    slot_id: null,
    cycle: null,
    title,
    title_derived: plan?.title == null,
    note: null,
    started_at: fields.startedAt,
    finished_at: fields.finishedAt,
    duration_s: fields.durationS,
    device_id: deviceId,
    rest_set_id: null,
    rest_started_at: null,
    rest_ends_at: null,
  });
  await tx
    .insert(session)
    .values({ id: fields.id, user_id: userId, created_at: nowIso(), ...parsed });

  for (const entry of planned) {
    const info = await exerciseInfoOf(tx, entry.exercise_id);
    const [setting] = await tx
      .select({ log_effort: exerciseSetting.log_effort })
      .from(exerciseSetting)
      .where(eq(exerciseSetting.exercise_id, entry.exercise_id))
      .limit(1);
    const sessionExerciseId = uuidv7();
    assertSessionRoom(0, entry.sets.length, "setsPerExercise");
    await tx.insert(sessionExercise).values({
      id: sessionExerciseId,
      user_id: userId,
      session_id: fields.id,
      exercise_id: entry.exercise_id,
      exercise_title: info.title,
      exercise_type: info.exercise_type,
      source_workout_exercise_id: entry.id,
      position: entry.position,
      rest_seconds: entry.rest_seconds,
      note: entry.note,
      superset_group: entry.superset_group,
      // The effort column shows when the plan has an effort target or the user turned it on.
      log_effort: setting?.log_effort === true || entry.sets.some(hasEffortTarget),
      created_at: nowIso(),
    });
    const keys = keysAfterLast([], entry.sets.length);
    for (const [index, target] of entry.sets.entries()) {
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
}

/** A fresh Session id (UUIDv7, as the server requires); pass it to {@link startSession} to make starting idempotent. */
export const newSessionId = (): string => uuidv7();

const hasEffortTarget = (set: PlannedSet) => set.effort_min !== undefined;

/**
 * Starts a Session from a Workout (or empty, with `workoutId: null`) on this device, with every
 * set unticked. Passing the id of an existing Session returns it unchanged, so starting is
 * idempotent. A second unfinished Session is never refused: the user is asked what to do with it
 * (ADR 0038). Returns the Session id.
 */
export function startSession(
  database: TrainingDatabase,
  source: SessionSource,
  options: { id?: string } = {},
  expectedInstallId?: string,
): Promise<string> {
  return write(database, expectedInstallId, async (tx) => {
    const id = options.id ?? uuidv7();
    const [existing] = await tx.select({ id: session.id }).from(session).where(eq(session.id, id));
    if (existing) return id;
    const startedAt = nowIso();
    await createSessionIn(tx, source, { id, startedAt, finishedAt: null, durationS: null });
    return id;
  });
}

/**
 * Logs a past workout: a finished Session started at `startedAt` (within the last 10 years, not
 * in the future), copied from a Workout or empty, with no timers. Its sets start unticked for
 * the user to fill in; `durationSeconds` is the user's duration, if known. Returns the Session id.
 */
export function logPastSession(
  database: TrainingDatabase,
  source: SessionSource,
  when: { startedAt: string; durationSeconds?: number | null },
  expectedInstallId?: string,
): Promise<string> {
  const durationS = when.durationSeconds ?? null;
  return write(database, expectedInstallId, async (tx) => {
    if (!sessionStartAllowed(when.startedAt)) {
      throw new Error("A past workout starts within the last 10 years and not in the future");
    }
    const id = uuidv7();
    const end = new Date(Date.parse(when.startedAt) + (durationS ?? 0) * 1000).toISOString();
    await createSessionIn(tx, source, {
      id,
      startedAt: new Date(when.startedAt).toISOString(),
      finishedAt: end,
      durationS,
    });
    return id;
  });
}

/** What the user edits on the Finish summary. */
export type FinishInput = {
  title?: string;
  note?: string | null;
  startedAt?: string;
  /** Overrides the clock duration. */
  durationSeconds?: number | null;
  /** When it ended; the clock now unless given (a forgotten Session finishes at its last tick). */
  finishedAt?: string;
};

export type FinishResult = {
  /** False when the Session was finished before: nothing was written. */
  finished: boolean;
  droppedSets: number;
  droppedExercises: number;
};

/**
 * Finishes a Session: unticked sets are dropped, and so are exercises left with no set, then
 * the summary's edits are written and any running Rest is cleared. Finishing again is a no-op.
 */
export function finishSession(
  database: TrainingDatabase,
  id: string,
  input: FinishInput = {},
  expectedInstallId?: string,
): Promise<FinishResult> {
  return write(database, expectedInstallId, async (tx) => {
    const current = await requireSession(tx, id);
    if (current.finished_at !== null)
      return { finished: false, droppedSets: 0, droppedExercises: 0 };

    const startedAt = input.startedAt ?? current.started_at;
    if (input.startedAt !== undefined && !sessionStartAllowed(input.startedAt)) {
      throw new Error("A workout starts within the last 10 years and not in the future");
    }
    const finishedAt = input.finishedAt ?? nowIso();
    const edited = input.title !== undefined && input.title !== current.title;
    const parsed = sessionInput.parse({
      workout_id: current.workout_id,
      program_id: current.program_id,
      run_id: current.run_id,
      slot_id: current.slot_id,
      cycle: current.cycle,
      title: input.title ?? current.title,
      title_derived: edited ? false : current.title_derived,
      note: input.note === undefined ? current.note : input.note,
      started_at: startedAt,
      finished_at: finishedAt,
      duration_s: input.durationSeconds === undefined ? current.duration_s : input.durationSeconds,
      device_id: current.device_id,
      rest_set_id: null,
      rest_started_at: null,
      rest_ends_at: null,
    });
    if (!sessionTimesConsistent(parsed)) throw new Error("A workout cannot end before it starts");

    const exercises = await tx
      .select({ id: sessionExercise.id })
      .from(sessionExercise)
      .where(eq(sessionExercise.session_id, id));
    const sets = exercises.length
      ? await tx
          .select({
            id: sessionSet.id,
            exercise: sessionSet.session_exercise_id,
            completed_at: sessionSet.completed_at,
          })
          .from(sessionSet)
          .where(
            inArray(
              sessionSet.session_exercise_id,
              exercises.map((entry) => entry.id),
            ),
          )
      : [];
    const unticked = sets.filter((set) => set.completed_at === null).map((set) => set.id);
    if (unticked.length > 0) await tx.delete(sessionSet).where(inArray(sessionSet.id, unticked));
    const kept = new Set(
      sets.filter((set) => set.completed_at !== null).map((set) => set.exercise),
    );
    const empty = exercises.filter((entry) => !kept.has(entry.id)).map((entry) => entry.id);
    if (empty.length > 0)
      await tx.delete(sessionExercise).where(inArray(sessionExercise.id, empty));

    await tx.update(session).set(parsed).where(eq(session.id, id));
    return { finished: true, droppedSets: unticked.length, droppedExercises: empty.length };
  });
}

/**
 * Renames a Session that still has a derived title (it has not been renamed by the user); the
 * title stays derived. Returns whether it wrote. A renamed Session is left alone.
 */
export function setDerivedTitle(
  database: TrainingDatabase,
  id: string,
  title: string,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const parsed = sessionInput.shape.title.parse(title);
    const current = await requireSession(tx, id);
    if (!current.title_derived || current.title === parsed) return false;
    await tx.update(session).set({ title: parsed }).where(eq(session.id, id));
    return true;
  });
}

/**
 * Discards a Session: it and its exercises and sets leave this device, and the server soft-deletes
 * them. Returns what was removed for Undo, or null if it is gone.
 */
export function discardSession(
  database: TrainingDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<DeletedSession | null> {
  return write(database, expectedInstallId, async (tx) => {
    const [current] = await tx.select().from(session).where(eq(session.id, id)).limit(1);
    if (!current) return null;
    const exercises = await tx
      .select()
      .from(sessionExercise)
      .where(eq(sessionExercise.session_id, id));
    const sets = exercises.length
      ? await tx
          .select()
          .from(sessionSet)
          .where(
            inArray(
              sessionSet.session_exercise_id,
              exercises.map((entry) => entry.id),
            ),
          )
      : [];
    if (sets.length > 0) {
      await tx.delete(sessionSet).where(
        inArray(
          sessionSet.id,
          sets.map((set) => set.id),
        ),
      );
    }
    await tx.delete(sessionExercise).where(eq(sessionExercise.session_id, id));
    await tx.delete(session).where(eq(session.id, id));
    return { session: current, exercises, sets };
  });
}

/** Undo of {@link discardSession}: the same ids and content. False if the Session is back already. */
export function restoreSession(
  database: TrainingDatabase,
  deleted: DeletedSession,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const [existing] = await tx
      .select({ id: session.id })
      .from(session)
      .where(eq(session.id, deleted.session.id))
      .limit(1);
    if (existing) return false;
    await tx.insert(session).values(marked(deleted.session));
    if (deleted.exercises.length > 0) {
      await tx.insert(sessionExercise).values(deleted.exercises.map(marked));
    }
    if (deleted.sets.length > 0) await tx.insert(sessionSet).values(deleted.sets.map(marked));
    return true;
  });
}

/**
 * Take over: this device becomes the one that owns the Session. Returns false if it already is
 * (or the Session is gone). The former device reads the new id from the stream.
 */
export function takeOver(
  database: TrainingDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const [current] = await tx
      .select({ device_id: session.device_id })
      .from(session)
      .where(eq(session.id, id))
      .limit(1);
    const deviceId = await installIdOf(tx);
    if (!current || current.device_id === deviceId) return false;
    await tx.update(session).set({ device_id: deviceId }).where(eq(session.id, id));
    return true;
  });
}

// ---- Rest (ADR 0037): absolute times tied to the set that started them ----

/**
 * Starts the Rest after a set, replacing a running one: the Session records the set and the
 * absolute start and end, so the countdown survives the app being killed. `seconds` is 1 to 600.
 */
export function startRest(
  database: TrainingDatabase,
  sessionId: string,
  setId: string,
  seconds: number,
  expectedInstallId?: string,
): Promise<RestTimes> {
  if (!isRestSeconds(seconds)) return Promise.reject(new Error("Rest is 1 to 600 seconds"));
  return write(database, expectedInstallId, async (tx) => {
    await requireSession(tx, sessionId);
    const [row] = await tx
      .select({ id: sessionSet.id })
      .from(sessionSet)
      .innerJoin(sessionExercise, eq(sessionSet.session_exercise_id, sessionExercise.id))
      .where(eq(sessionSet.id, setId))
      .limit(1);
    if (!row) throw new Error("The set is gone from the session");
    return writeRest(tx, sessionId, setId, seconds);
  });
}

/**
 * Moves the end of the running Rest by `deltaSeconds` (−15, +15). A Rest pushed to or past now
 * is cleared. Returns the new times, or null when no Rest is running.
 */
export function adjustRest(
  database: TrainingDatabase,
  sessionId: string,
  deltaSeconds: number,
  expectedInstallId?: string,
): Promise<RestTimes | null> {
  return write(database, expectedInstallId, async (tx) => {
    const current = await requireSession(tx, sessionId);
    if (current.rest_started_at === null || current.rest_ends_at === null) return null;
    const end = Date.parse(current.rest_ends_at) + deltaSeconds * 1000;
    if (end <= Date.now()) {
      await clearRestIn(tx, sessionId);
      return null;
    }
    const endsAt = new Date(end).toISOString();
    await tx.update(session).set({ rest_ends_at: endsAt }).where(eq(session.id, sessionId));
    return { startedAt: current.rest_started_at, endsAt };
  });
}

export async function clearRestIn(tx: Tx, sessionId: string) {
  await tx
    .update(session)
    .set({ rest_set_id: null, rest_started_at: null, rest_ends_at: null })
    .where(eq(session.id, sessionId));
}

/** Skips the Rest. Returns whether there was one. */
export function clearRest(
  database: TrainingDatabase,
  sessionId: string,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const current = await requireSession(tx, sessionId);
    if (current.rest_started_at === null && current.rest_set_id === null) return false;
    await clearRestIn(tx, sessionId);
    return true;
  });
}
