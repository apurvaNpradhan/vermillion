import { v7 as uuidv7 } from "uuid";

import { EFFORT_STEPS, plannedSetSchema, sessionInput, type PlannedSet } from "@workspace/shared";
import { asc, eq } from "drizzle-orm";

import { activeGymIdOf } from "../gyms/gym-store";
import { keysAfterLast } from "../position";
import { nowIso, ownerOf, write, type Tx, type TrainingDatabase } from "../store-common";
import { session, sessionExercise, sessionSet } from "../tables";
import {
  assertSessionRoom,
  exerciseInfoOf,
  installIdOf,
  requireSession,
  type SessionSetRow,
} from "./session-common";

const isEffortStep = (value: number): value is (typeof EFFORT_STEPS)[number] =>
  EFFORT_STEPS.some((step) => step === value);

/**
 * What a finished set becomes as the next time's plan: its kind with the weight, reps, effort,
 * duration, distance, floors and steps it recorded. Empty or out-of-range values are dropped, so
 * the result always passes the Planned set schema.
 */
export function plannedFromLogged(row: SessionSetRow): PlannedSet {
  const target: PlannedSet = { kind: row.kind };
  if (row.weight_kg !== null && row.weight_kg >= 0) target.weight_kg = row.weight_kg;
  if (row.reps !== null && row.reps >= 1) {
    target.reps_min = row.reps;
    target.reps_max = row.reps;
  }
  if (row.rpe !== null && isEffortStep(row.rpe)) {
    target.effort_min = row.rpe;
    target.effort_max = row.rpe;
  }
  if (row.duration_s !== null && row.duration_s >= 1) target.duration_s = row.duration_s;
  if (row.distance_m !== null && row.distance_m >= 0) target.distance_m = row.distance_m;
  if (row.floors !== null && row.floors >= 1) target.floors = row.floors;
  if (row.steps !== null && row.steps >= 1) target.steps = row.steps;
  return plannedSetSchema.parse(target);
}

/**
 * Perform again: a new unfinished Session that is an exact copy of a finished one, with its
 * exercises in order, supersets, set kinds and rest per exercise. Every set is unticked and
 * carries what was logged last time as its target, so the progression hints still apply on top.
 * It is not linked to a Workout or a Program run (the original may be long gone), and the
 * exercise notes stay behind: they show as "Last time" instead. Idempotent on `options.id`.
 * Returns the new Session id.
 */
export function performAgain(
  database: TrainingDatabase,
  sourceSessionId: string,
  derivedTitle: string,
  options: { id?: string } = {},
  expectedInstallId?: string,
): Promise<string> {
  return write(database, expectedInstallId, (tx) =>
    performAgainIn(tx, sourceSessionId, derivedTitle, options.id ?? uuidv7()),
  );
}

/** {@link performAgain} inside a transaction the caller owns: validates the source, then copies it. */
export async function performAgainIn(
  tx: Tx,
  sourceSessionId: string,
  derivedTitle: string,
  id: string,
): Promise<string> {
  const [existing] = await tx.select({ id: session.id }).from(session).where(eq(session.id, id));
  if (existing) return id;
  const source = await requireSession(tx, sourceSessionId);
  if (source.finished_at === null) throw new Error("Only a finished session can be repeated");
  await copyInto(tx, source, id, derivedTitle);
  return id;
}

async function copyInto(
  tx: Tx,
  source: typeof session.$inferSelect,
  id: string,
  derivedTitle: string,
) {
  const userId = await ownerOf(tx);
  const deviceId = await installIdOf(tx);
  const exercises = await tx
    .select()
    .from(sessionExercise)
    .where(eq(sessionExercise.session_id, source.id))
    .orderBy(asc(sessionExercise.position), asc(sessionExercise.id));
  assertSessionRoom(0, exercises.length, "exercisesPerSession");
  const parsed = sessionInput.parse({
    workout_id: null,
    program_id: null,
    run_id: null,
    slot_id: null,
    gym_id: await activeGymIdOf(tx),
    cycle: null,
    title: source.title_derived ? derivedTitle : source.title,
    title_derived: source.title_derived,
    note: null,
    started_at: nowIso(),
    finished_at: null,
    duration_s: null,
    device_id: deviceId,
    rest_set_id: null,
    rest_started_at: null,
    rest_ends_at: null,
    paused_at: null,
    paused_ms: 0,
  });
  await tx
    .insert(session)
    .values({ id, user_id: userId, workout_structure: null, created_at: nowIso(), ...parsed });

  // Superset groups are labels: each copy gets fresh ones, so the sessions never share a group.
  const groups = new Map<string, string>();
  for (const entry of exercises) {
    const info = await exerciseInfoOf(tx, entry.exercise_id);
    const sets = await tx
      .select()
      .from(sessionSet)
      .where(eq(sessionSet.session_exercise_id, entry.id))
      .orderBy(asc(sessionSet.position), asc(sessionSet.id));
    assertSessionRoom(0, sets.length, "setsPerExercise");
    let group: string | null = null;
    if (entry.superset_group !== null) {
      group = groups.get(entry.superset_group) ?? uuidv7();
      groups.set(entry.superset_group, group);
    }
    const newExerciseId = uuidv7();
    await tx.insert(sessionExercise).values({
      id: newExerciseId,
      user_id: userId,
      session_id: id,
      exercise_id: entry.exercise_id,
      exercise_title: info.title,
      exercise_type: info.exercise_type,
      source_workout_exercise_id: null,
      position: entry.position,
      rest_seconds: entry.rest_seconds,
      note: null,
      superset_group: group,
      log_effort: entry.log_effort,
      // Keeps an auto warm-up ramp from being generated a second time over the copied warm-ups.
      warmup_key: entry.warmup_key,
      repeated: true,
      created_at: nowIso(),
    });
    const keys = keysAfterLast([], sets.length);
    for (const [index, row] of sets.entries()) {
      await tx.insert(sessionSet).values({
        id: uuidv7(),
        user_id: userId,
        session_exercise_id: newExerciseId,
        position: keys[index] ?? "a0",
        kind: row.kind,
        target: plannedFromLogged(row),
        generated_warmup: false,
        created_at: nowIso(),
      });
    }
  }
}
