import { v7 as uuidv7 } from "uuid";

import {
  REST_SECONDS_MAX,
  applyPhase,
  resolveExerciseUnit,
  cycleState,
  finishClock,
  mainEntryOf,
  phaseFor,
  hasLoad,
  sessionInput,
  snapshotOf,
  sessionStartAllowed,
  sessionTimesConsistent,
  workoutStructureKey,
  type PlannedSet,
  type RunSlot,
} from "@workspace/shared";
import { asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { program, programRun, programSlot, programSlotSkip } from "../tables";
import { unskipSlotIn } from "../plans/skip-store";
import { hasCountedSetSql } from "../plans/run-store";
import { readInsertedDeloads, readPhasePlan } from "../plans/phase-plan";
import { lastBaselineLoadKg, phaseLoadsIn } from "./phase-inputs";
import { activeGymIdOf } from "../gyms/gym-store";
import { keysAfterLast } from "../position";
import { performAgainIn } from "./session-again-store";
import {
  assertSessionRoom,
  exerciseInfoOf,
  installIdOf,
  isRestSeconds,
  requireSession,
  requireSessionExercise,
  writeRest,
  type DeletedSession,
  type RestTimes,
} from "./session-common";
import { marked, nowIso, ownerOf, write, type Tx, type TrainingDatabase } from "../store-common";
import {
  exerciseSetting,
  session,
  sessionExercise,
  sessionSet,
  sessionPhoto,
  workout,
  workoutExercise,
} from "../tables";

/** Store the load cut on the exact entry so duplicate lifts and concurrent edits stay independent. */
export function setStallDeload(
  db: TrainingDatabase,
  entryId: string,
  applied: boolean,
  writeScope?: string,
) {
  return write(db, writeScope, async (tx) => {
    const entry = await requireSessionExercise(tx, entryId);
    const current = await requireSession(tx, entry.session_id);
    if (current.finished_at !== null || current.device_id !== (await installIdOf(tx))) return false;
    await tx
      .update(sessionExercise)
      .set({ stall_deload: applied })
      .where(eq(sessionExercise.id, entryId));
    return true;
  });
}

/** The Workout a Session starts from, or none; `derivedTitle` names a Session with no title of its own. */
export type SessionSource = {
  workoutId: string | null;
  day?: RunSlot;
  /**
   * The title when the Workout has none (it is derived) or there is no Workout, already
   * translated by the caller. The Session stays "derived" until the user renames it.
   */
  derivedTitle: string;
  /** The user's time zone, for the Run's calendar week (and so the phase); UTC when absent. */
  timeZone?: string;
};

/**
 * Copies a Workout into a new Session: its exercises with a snapshot of each title and type, its
 * sets as unticked Logged sets carrying the Planned set as their target. The Workout's title is
 * a snapshot too. Everything is written with this device as the owner.
 */
async function createSessionIn(
  tx: Tx,
  source: SessionSource,
  fields: {
    id: string;
    startedAt: string;
    finishedAt: string | null;
    durationS: number | null;
    /** A past workout: it joins the run only if it does not predate the run's own history. */
    backfill?: boolean;
  },
  activeRun: typeof programRun.$inferSelect | null,
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

  const matching = activeRun && plan?.program_id === activeRun.program_id ? activeRun : null;
  const runSessions = matching
    ? await tx
        .select({
          id: session.id,
          workoutId: session.workout_id,
          slotId: session.slot_id,
          cycle: session.cycle,
          startedAt: session.started_at,
          finishedAt: session.finished_at,
          hasCountedSet: sql.raw(hasCountedSetSql).mapWith(Boolean),
        })
        .from(session)
        .where(eq(session.run_id, matching.id))
    : [];
  // A backfill joins the run unless it starts before the run's first Session (or, with none
  // yet, more than a day before the run was activated): that workout belongs to an earlier
  // period. Sessions outside the run never matter.
  const firstStart = runSessions.map((item) => item.startedAt).sort()[0];
  const runStart =
    firstStart ??
    (matching ? new Date(Date.parse(matching.activated_at) - 86_400_000).toISOString() : null);
  const active =
    matching && !(fields.backfill && runStart !== null && fields.startedAt < runStart)
      ? matching
      : null;
  const slots = active
    ? await tx
        .select()
        .from(programSlot)
        .where(eq(programSlot.program_id, active.program_id))
        .orderBy(asc(programSlot.position), asc(programSlot.id))
    : [];
  // Out of order is fine: the cycle and slot come from the run's Sessions up to this start.
  const history = active ? runSessions.filter((item) => item.startedAt <= fields.startedAt) : [];
  const skips = active
    ? await tx
        .select({ slotId: programSlotSkip.slot_id, cycle: programSlotSkip.cycle })
        .from(programSlotSkip)
        .where(eq(programSlotSkip.run_id, active.id))
    : [];
  const progress = cycleState(
    slots.map((s) => ({ id: s.id, workoutId: s.workout_id })),
    history,
    skips,
  );
  const day = source.day;
  let slot = slots.find((s) => s.workout_id === plan?.id && !progress.trained.has(s.id));
  if (day) {
    slot = slots.find((s) => s.id === day.slotId && s.workout_id === plan?.id);
    const skipped = skips.some((s) => s.slotId === day.slotId && s.cycle === day.cycle);
    // A skip may have completed the displayed cycle while the conflict sheet was open.
    // The selected day can still start if its skip is present and there is no later counted session.
    if (
      !slot ||
      !active ||
      day.runId !== active.id ||
      day.cycle < progress.latestCountedCycle ||
      (day.cycle !== progress.cycle && !(skipped && day.cycle < progress.cycle))
    )
      throw new Error("The selected day is no longer available");
    if (skipped) await unskipSlotIn(tx, day);
  }
  if (active && (!active.started_at || fields.startedAt < active.started_at))
    await tx
      .update(programRun)
      .set({ started_at: fields.startedAt })
      .where(eq(programRun.id, active.id));
  const title = plan?.title ?? source.derivedTitle;
  // The phase of the Run week this Session starts in; its targets are adjusted as it is copied.
  const [phasePlan] =
    active && plan?.program_id
      ? await tx
          .select({ phase_plan: program.phase_plan })
          .from(program)
          .where(eq(program.id, plan.program_id))
          .limit(1)
      : [];
  const runStartedAt =
    active && active.started_at && active.started_at < fields.startedAt
      ? active.started_at
      : fields.startedAt;
  const phase =
    active && phasePlan
      ? phaseFor(
          readPhasePlan(phasePlan.phase_plan),
          {
            started_at: runStartedAt,
            inserted_deloads: readInsertedDeloads(active.inserted_deloads),
          },
          new Date(fields.startedAt),
          source.timeZone ?? "UTC",
        )
      : null;
  const gymId = await activeGymIdOf(tx);
  // The loads a phase lowers or seeds are the Session gym's, in the user's unit.
  const loads = phase ? await phaseLoadsIn(tx, gymId) : null;
  const mainEntryId = mainEntryOf(
    planned.map((entry) => entry.id),
    plan?.main_entry_id,
  );
  const parsed = sessionInput.parse({
    workout_id: plan?.id ?? null,
    program_id: plan?.program_id ?? null,
    run_id: active?.id ?? null,
    slot_id: slot?.id ?? null,
    gym_id: gymId,
    phase: phase?.phase ?? null,
    phase_modifiers: phase ? snapshotOf(phase) : null,
    cycle: active ? (day?.cycle ?? progress.cycle) : null,
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
    paused_at: null,
    paused_ms: 0,
  });
  await tx.insert(session).values({
    id: fields.id,
    user_id: userId,
    workout_structure: plan
      ? workoutStructureKey(
          planned.map((entry) => ({
            id: entry.id,
            exerciseId: entry.exercise_id,
            sets: entry.sets,
          })),
        )
      : null,
    created_at: nowIso(),
    ...parsed,
  });

  for (const entry of planned) {
    const info = await exerciseInfoOf(tx, entry.exercise_id);
    const [setting] = await tx
      .select({ log_effort: exerciseSetting.log_effort, unit: exerciseSetting.unit })
      .from(exerciseSetting)
      .where(eq(exerciseSetting.exercise_id, entry.exercise_id))
      .orderBy(asc(exerciseSetting.id))
      .limit(1);
    const sessionExerciseId = uuidv7();
    // Phases adjust the targets as the Session copies them; the Workout stays as planned.
    const isMainLift = entry.id === mainEntryId;
    const sets =
      phase && loads
        ? applyPhase(entry.sets, phase.phase, {
            isMainLift,
            type: info.exercise_type,
            equipment: info.equipment,
            unit: resolveExerciseUnit(loads.unit, setting?.unit),
            grid: loads.gridFor(entry.exercise_id, info.equipment, setting?.unit),
            modifiers: phase.modifiers,
            testTop: phase.testTop,
            // A Test week's top set starts from what the lifter last did, not the stale plan.
            testLoadKg:
              phase.phase === "test" && isMainLift && hasLoad(info.exercise_type)
                ? await lastBaselineLoadKg(tx, entry.exercise_id)
                : null,
          })
        : entry.sets;
    assertSessionRoom(0, sets.length, "setsPerExercise");
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
      log_effort: setting?.log_effort === true || sets.some(hasEffortTarget),
      created_at: nowIso(),
    });
    const keys = keysAfterLast([], sets.length);
    for (const [index, target] of sets.entries()) {
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
  return write(database, expectedInstallId, async (tx, active) => {
    const id = options.id ?? uuidv7();
    const [existing] = await tx.select({ id: session.id }).from(session).where(eq(session.id, id));
    if (existing) return id;
    const startedAt = nowIso();
    await createSessionIn(tx, source, { id, startedAt, finishedAt: null, durationS: null }, active);
    return id;
  });
}

/** What starts a Session: a Workout (or nothing), or a finished Session to repeat. */
export type BeginSource = Omit<SessionSource, "derivedTitle"> | { againOf: string };

/**
 * Starts a Session in ONE transaction: the source is read, the Sessions in `discardIds` are
 * discarded, and the new Session is created, so a source that turns out to be gone rolls the
 * discard back with it. With `resumeActive`, an unfinished Session already present (even one that
 * appeared a moment ago) is returned as "resumed" instead of starting a second one. Idempotent on
 * `options.id`.
 */
export function beginSession(
  database: TrainingDatabase,
  source: BeginSource,
  derivedTitle: string,
  options: { id?: string; discardIds?: readonly string[]; resumeActive?: boolean } = {},
  expectedInstallId?: string,
): Promise<{ id: string; outcome: "started" | "resumed"; removed: DeletedSession[] }> {
  return write(database, expectedInstallId, async (tx, active) => {
    const id = options.id ?? uuidv7();
    const [existing] = await tx.select({ id: session.id }).from(session).where(eq(session.id, id));
    if (existing) return { id, outcome: "started", removed: [] };
    const removed: DeletedSession[] = [];
    for (const old of options.discardIds ?? []) {
      const deleted = await discardSessionIn(tx, old);
      if (deleted) removed.push(deleted);
    }
    if (options.resumeActive) {
      const [open] = await tx
        .select({ id: session.id })
        .from(session)
        .where(isNull(session.finished_at))
        .orderBy(desc(session.started_at), desc(session.id))
        .limit(1);
      if (open) return { id: open.id, outcome: "resumed", removed };
    }
    if ("againOf" in source) {
      await performAgainIn(tx, source.againOf, derivedTitle, id);
    } else {
      await createSessionIn(
        tx,
        { ...source, derivedTitle },
        { id, startedAt: nowIso(), finishedAt: null, durationS: null },
        active,
      );
    }
    return { id, outcome: "started", removed };
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
  return write(database, expectedInstallId, async (tx, active) => {
    if (!sessionStartAllowed(when.startedAt)) {
      throw new Error("A past workout starts within the last 10 years and not in the future");
    }
    const id = uuidv7();
    const startedAt = new Date(when.startedAt).toISOString();
    const end = new Date(Date.parse(startedAt) + (durationS ?? 0) * 1000).toISOString();
    await createSessionIn(
      tx,
      source,
      { id, startedAt, finishedAt: end, durationS, backfill: true },
      active,
    );
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
    const end = input.finishedAt ?? nowIso();
    const pausedMs = finishClock(
      { startedAt, pausedAt: current.paused_at, pausedMs: current.paused_ms ?? 0 },
      Date.parse(end),
    ).pausedMs;
    const finishedAt =
      input.finishedAt === undefined && input.durationSeconds != null
        ? new Date(Date.parse(startedAt) + input.durationSeconds * 1000 + pausedMs).toISOString()
        : end;
    const edited = input.title !== undefined && input.title !== current.title;
    const parsed = sessionInput.parse({
      workout_id: current.workout_id,
      program_id: current.program_id,
      run_id: current.run_id,
      slot_id: current.slot_id,
      gym_id: current.gym_id,
      phase: current.phase,
      phase_modifiers: current.phase_modifiers,
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
      // Finishing while paused resumes at the finish: the open pause counts as paused.
      paused_at: null,
      paused_ms: pausedMs,
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
  return write(database, expectedInstallId, (tx) => discardSessionIn(tx, id));
}

/** {@link discardSession} inside a transaction the caller owns. */
export async function discardSessionIn(tx: Tx, id: string): Promise<DeletedSession | null> {
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
  const photos = await tx
    .select({ mediaId: sessionPhoto.media_id })
    .from(sessionPhoto)
    .where(eq(sessionPhoto.session_id, id))
    .limit(4);
  await tx.delete(session).where(eq(session.id, id));
  return {
    session: current,
    exercises,
    sets,
    photoMediaIds: photos.map((photo) => photo.mediaId),
  };
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
    await tx.insert(session).values(marked({ ...deleted.session, import_undo: null }));
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
    // A paused Session's Rest is frozen at the pause: its time left is measured from there.
    const now = current.paused_at === null ? Date.now() : Date.parse(current.paused_at);
    const end = Math.min(
      Date.parse(current.rest_ends_at) + deltaSeconds * 1000,
      now + REST_SECONDS_MAX * 1000,
    );
    if (end <= now) {
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
