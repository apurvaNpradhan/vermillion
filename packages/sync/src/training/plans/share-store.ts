import {
  CUSTOM_EXERCISE_LIMIT,
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
  plannedSetKeys,
  plannedSetSchema,
  sessionPlannedSets,
  SET_KINDS,
  SYNC_LIMITS,
  type PlannedSet,
  type ShareExercise,
  type ShareExerciseSource,
  type ShareProgram,
  type ShareProgramSource,
  type ShareSnapshot,
  type ShareWorkout,
  type ShareWorkoutSource,
} from "@workspace/shared";
import { and, count, isNotNull, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { exercise } from "../../exercise/index";
import { keysAfterLast, keysBetween } from "../position";
import { program, programSlot, workout, workoutExercise } from "../tables";
import {
  assertRoom,
  liveWorkouts,
  livePrograms,
  nowIso,
  ownerOf,
  slotsIn,
  write,
  type Tx,
  type TrainingDatabase,
} from "../store-common";

// ---- Reading a snapshot source from the local database ----

const exerciseRow = z.object({
  exercise_id: z.string(),
  user_id: z.string().nullable(),
  title: z.string(),
  equipment: z.enum(EQUIPMENT),
  exercise_type: z.enum(EXERCISE_TYPES),
  primary_muscle: z.enum(MUSCLE_GROUPS),
  secondary_muscles: z
    .string()
    .nullable()
    .transform((text) =>
      z
        .array(z.enum(MUSCLE_GROUPS))
        .catch([])
        .parse(JSON.parse(text ?? "[]")),
    ),
});

function exerciseSource(row: z.infer<typeof exerciseRow>): ShareExerciseSource {
  return {
    id: row.exercise_id,
    custom: row.user_id !== null,
    title: row.title,
    equipment: row.equipment,
    exerciseType: row.exercise_type,
    primaryMuscle: row.primary_muscle,
    secondaryMuscles: row.secondary_muscles,
  };
}

const EXERCISE_COLUMNS = `e.id AS exercise_id, e.user_id, e.title, e.equipment, e.exercise_type,
  e.primary_muscle, e.secondary_muscles`;

const planRow = exerciseRow.extend({
  rest_seconds: z.number().nullable(),
  superset_group: z.string().nullable(),
  sets: z.string().transform((text) => z.array(plannedSetSchema).catch([]).parse(JSON.parse(text))),
});

const workoutRow = z.object({
  id: z.string(),
  title: z.string().nullable(),
});

/** The Workouts with these ids as share sources, in the order asked; one that is gone is left out. */
async function readWorkoutSources(
  database: TrainingDatabase,
  ids: readonly string[],
): Promise<Map<string, ShareWorkoutSource>> {
  const found = new Map<string, ShareWorkoutSource>();
  for (const id of new Set(ids)) {
    const head = await database.getOptional<object>("SELECT id, title FROM workout WHERE id = ?", [
      id,
    ]);
    if (!head) continue;
    const parsedHead = workoutRow.parse(head);
    const rows = z.array(planRow).parse(
      await database.getAll(
        `SELECT ${EXERCISE_COLUMNS}, we.rest_seconds, we.superset_group, we.sets
         FROM workout_exercise we JOIN exercise e ON e.id = we.exercise_id
         WHERE we.workout_id = ? ORDER BY we.position, we.id`,
        [id],
      ),
    );
    found.set(id, {
      id,
      title: parsedHead.title,
      exercises: rows.map((row) => ({
        exercise: exerciseSource(row),
        restSeconds: row.rest_seconds,
        supersetGroup: row.superset_group,
        sets: row.sets,
      })),
    });
  }
  return found;
}

/** A Workout ready for `serializeWorkout`; null when it is gone. */
export async function readWorkoutShareSource(
  database: TrainingDatabase,
  id: string,
): Promise<ShareWorkoutSource | null> {
  return (await readWorkoutSources(database, [id])).get(id) ?? null;
}

const programRow = z.object({
  title: z.string(),
  description: z.string().nullable(),
  planned_weeks: z.number().nullable(),
  sessions_per_week: z.number().nullable(),
});

/** A Program and every Workout its Rotation uses, ready for `serializeProgram`; null when gone. */
export async function readProgramShareSource(
  database: TrainingDatabase,
  id: string,
): Promise<ShareProgramSource | null> {
  const head = await database.getOptional<object>(
    "SELECT title, description, planned_weeks, sessions_per_week FROM program WHERE id = ?",
    [id],
  );
  if (!head) return null;
  const parsed = programRow.parse(head);
  const slots = z
    .array(z.object({ workout_id: z.string().nullable() }))
    .parse(
      await database.getAll(
        "SELECT workout_id FROM program_slot WHERE program_id = ? ORDER BY position, id",
        [id],
      ),
    );
  const workouts = await readWorkoutSources(
    database,
    slots.flatMap((slot) => (slot.workout_id === null ? [] : [slot.workout_id])),
  );
  return {
    title: parsed.title,
    description: parsed.description,
    plannedWeeks: parsed.planned_weeks,
    sessionsPerWeek: parsed.sessions_per_week,
    workouts: [...workouts.values()],
    // A Slot whose Workout is not synced yet is left out rather than shared as Rest.
    rotation: slots.flatMap((slot) =>
      slot.workout_id === null ? [null] : workouts.has(slot.workout_id) ? [slot.workout_id] : [],
    ),
  };
}

const sessionHead = z.object({ title: z.string() });
const sessionExerciseRow = exerciseRow.extend({
  session_exercise_id: z.string(),
  rest_seconds: z.number().nullable(),
  superset_group: z.string().nullable(),
});
const loggedSetRow = z.object({
  kind: z.enum(SET_KINDS),
  weight_kg: z.number().nullable(),
  reps: z.number().nullable(),
  duration_s: z.number().nullable(),
  distance_m: z.number().nullable(),
  floors: z.number().nullable(),
  steps: z.number().nullable(),
  rpe: z.number().nullable(),
});

/**
 * A finished Session as a Workout template: each exercise's completed non-warm-up sets become its
 * Planned sets (reps and weight as targets). Notes, photos, times and the Session's own ids are
 * not read (and no snapshot carries a note). Null when the Session is gone.
 */
export async function readSessionShareSource(
  database: TrainingDatabase,
  sessionId: string,
): Promise<ShareWorkoutSource | null> {
  const head = await database.getOptional<object>(
    "SELECT title FROM training_session WHERE id = ?",
    [sessionId],
  );
  if (!head) return null;
  const exercises = z.array(sessionExerciseRow).parse(
    await database.getAll(
      `SELECT ${EXERCISE_COLUMNS}, se.id AS session_exercise_id, se.rest_seconds, se.superset_group
       FROM session_exercise se JOIN exercise e ON e.id = se.exercise_id
       WHERE se.session_id = ? ORDER BY se.position, se.id`,
      [sessionId],
    ),
  );
  const entries: ShareWorkoutSource["exercises"][number][] = [];
  for (const row of exercises) {
    const logged = z.array(loggedSetRow).parse(
      await database.getAll(
        `SELECT kind, weight_kg, reps, duration_s, distance_m, floors, steps, rpe
         FROM session_set WHERE session_exercise_id = ? AND completed_at IS NOT NULL
         ORDER BY position, id`,
        [row.session_exercise_id],
      ),
    );
    const sets = sessionPlannedSets(
      row.exercise_type,
      logged.filter((set) => set.kind !== "warmup"),
    );
    if (sets.length === 0) continue;
    entries.push({
      exercise: exerciseSource(row),
      restSeconds: row.rest_seconds,
      supersetGroup: row.superset_group,
      sets,
    });
  }
  return {
    id: sessionId,
    title: sessionHead.parse(head).title,
    exercises: entries,
  };
}

// ---- Importing a snapshot ----

/** How one exercise of a snapshot lands: an existing exercise, or a new Custom exercise. */
export type ExerciseMatch =
  | { kind: "catalog"; id: string }
  | { kind: "existing-custom"; id: string }
  | { kind: "new" };

const titleKey = (ref: { name: string; equipment: string; exerciseType: string }) =>
  `${ref.name.trim().toLowerCase()}|${ref.equipment}|${ref.exerciseType}`;

const refKey = (ref: ShareExercise) =>
  titleKey({ name: ref.name, equipment: ref.equipment, exerciseType: ref.exercise_type });

const exerciseKey = (ref: ShareExercise) => ref.catalog_id ?? `custom:${refKey(ref)}`;

/** Every exercise a snapshot names, once each (by catalog id, or by name, equipment and type). */
export function snapshotExercises(snapshot: ShareSnapshot): ShareExercise[] {
  const workouts: ShareWorkout[] =
    snapshot.format === "sigil.program/v1" ? snapshot.program.workouts : [snapshot.workout];
  const seen = new Map<string, ShareExercise>();
  for (const entry of workouts.flatMap((item) => item.exercises)) {
    const ref = entry.exercise;
    seen.set(exerciseKey(ref), ref);
  }
  return [...seen.values()];
}

type LibraryRow = {
  id: string;
  title: string;
  equipment: string;
  exercise_type: string;
  user_id: string | null;
  retired_at: string | null;
};

/**
 * Matches each exercise of a snapshot against this device's library. A catalog id this device
 * knows wins; otherwise a Custom exercise of the same name, equipment and type is reused (importing
 * twice does not duplicate); otherwise a new Custom exercise will be made.
 */
function matchLibrary(
  refs: readonly ShareExercise[],
  library: readonly LibraryRow[],
): Map<string, ExerciseMatch> {
  const catalog = new Set<string>();
  const custom = new Map<string, string>();
  for (const row of library) {
    if (row.user_id === null) catalog.add(row.id);
    else if (row.retired_at === null) {
      custom.set(
        titleKey({ name: row.title, equipment: row.equipment, exerciseType: row.exercise_type }),
        row.id,
      );
    }
  }
  const matches = new Map<string, ExerciseMatch>();
  for (const ref of refs) {
    const existing = custom.get(refKey(ref));
    matches.set(
      exerciseKey(ref),
      ref.catalog_id && catalog.has(ref.catalog_id)
        ? { kind: "catalog", id: ref.catalog_id }
        : existing
          ? { kind: "existing-custom", id: existing }
          : { kind: "new" },
    );
  }
  return matches;
}

/** What importing would do to the exercise library, for the preview. */
export type ImportExercisePreview = { exercise: ShareExercise; match: ExerciseMatch };

const libraryRow = z.object({
  id: z.string(),
  title: z.string(),
  equipment: z.string(),
  exercise_type: z.string(),
  user_id: z.string().nullable(),
  retired_at: z.string().nullable(),
});

export async function previewImportExercises(
  database: TrainingDatabase,
  snapshot: ShareSnapshot,
): Promise<ImportExercisePreview[]> {
  const library = z
    .array(libraryRow)
    .parse(
      await database.getAll(
        "SELECT id, title, equipment, exercise_type, user_id, retired_at FROM exercise",
      ),
    );
  const refs = snapshotExercises(snapshot);
  const matches = matchLibrary(refs, library);
  return refs.map((ref) => ({
    exercise: ref,
    match: matches.get(exerciseKey(ref)) ?? { kind: "new" },
  }));
}

/** Keeps only the fields the exercise's type records, so a snapshot cannot write a stray field. */
function allowedSets(ref: ShareExercise, sets: readonly PlannedSet[]): PlannedSet[] {
  const allowed: ReadonlySet<string> = new Set(plannedSetKeys(ref.exercise_type));
  return sets.map((set) =>
    plannedSetSchema.parse(
      Object.fromEntries(Object.entries(set).filter(([key]) => key === "kind" || allowed.has(key))),
    ),
  );
}

/** Creates these Custom exercises (one write each) and returns their ids by exercise key. */
async function createExercises(
  tx: Tx,
  userId: string,
  refs: readonly ShareExercise[],
): Promise<Map<string, string>> {
  const created = new Map<string, string>();
  for (const ref of refs) {
    const id = uuidv7();
    await tx.insert(exercise).values({
      id,
      user_id: userId,
      title: ref.name,
      primary_muscle: ref.primary_muscle,
      secondary_muscles: ref.secondary_muscles.filter((muscle) => muscle !== ref.primary_muscle),
      primary_detail: [],
      secondary_detail: [],
      equipment: ref.equipment,
      exercise_type: ref.exercise_type,
      is_full_bodyweight: false,
      instructions: null,
      created_at: nowIso(),
    });
    created.set(exerciseKey(ref), id);
  }
  return created;
}

async function insertWorkout(
  tx: Tx,
  userId: string,
  programId: string | null,
  content: ShareWorkout,
  exerciseIds: ReadonlyMap<string, string>,
): Promise<string> {
  const id = uuidv7();
  const created = nowIso();
  await tx.insert(workout).values({
    id,
    user_id: userId,
    program_id: programId,
    title: content.title,
    note: null,
    created_at: created,
  });
  const groups = new Map<number, string>();
  const sizes = new Map<number, number>();
  for (const entry of content.exercises) {
    if (entry.superset !== null) sizes.set(entry.superset, (sizes.get(entry.superset) ?? 0) + 1);
  }
  const keys = keysAfterLast([], content.exercises.length);
  for (const [at, entry] of content.exercises.entries()) {
    const exerciseId = exerciseIds.get(exerciseKey(entry.exercise));
    if (!exerciseId) throw new Error("An exercise of the plan could not be matched");
    let group: string | null = null;
    if (entry.superset !== null && (sizes.get(entry.superset) ?? 0) > 1) {
      group = groups.get(entry.superset) ?? uuidv7();
      groups.set(entry.superset, group);
    }
    await tx.insert(workoutExercise).values({
      id: uuidv7(),
      user_id: userId,
      workout_id: id,
      exercise_id: exerciseId,
      position: keys[at] ?? "a0",
      rest_seconds: entry.rest_seconds,
      note: null,
      superset_group: group,
      sets: allowedSets(entry.exercise, entry.sets),
      created_at: created,
    });
  }
  return id;
}

/** What one import writes to a device: a standalone Workout, or a Program, its Workouts and Rotation. */
export type ImportedPlan = { kind: "program" | "workout"; id: string; createdExercises: number };

/** Writes per upload transaction; the connector refuses more than `SYNC_LIMITS.maxOps`. */
const EXERCISES_PER_TRANSACTION = SYNC_LIMITS.maxOps;

function chunked<Item>(items: readonly Item[], size: number): Item[][] {
  const chunks: Item[][] = [];
  for (let at = 0; at < items.length; at += size) chunks.push(items.slice(at, at + size));
  return chunks;
}

/**
 * Adds a snapshot to this device as new rows: a standalone Workout, or a Program with its Workouts
 * and Rotation. Exercises map by catalog id; the rest become Custom exercises (reusing one of the
 * same name, equipment and type). Nothing already here is changed, and open Program runs are left
 * alone.
 *
 * A whole Program is more writes than one upload transaction may hold (the connector refuses
 * more than 100 operations), so it is written in steps, each its own transaction and each valid
 * on its own: the Custom exercises, then the Program, then one transaction per Workout, then the
 * Rotation. A failure part-way leaves a Program with fewer Workouts and no Rotation, never a row
 * that points at something missing; the Custom exercises made are reused by a retry.
 */
export async function importSnapshot(
  database: TrainingDatabase,
  snapshot: ShareSnapshot,
  expectedInstallId?: string,
): Promise<ImportedPlan> {
  const step = <T>(run: (tx: Tx) => Promise<T>) =>
    write(database, expectedInstallId, (tx) => run(tx), { reconcileRuns: false });

  // Step 0: decide and check everything before the first write.
  const plan = await step(async (tx) => {
    const userId = await ownerOf(tx);
    const refs = snapshotExercises(snapshot);
    const matches = matchLibrary(
      refs,
      await tx
        .select({
          id: exercise.id,
          title: exercise.title,
          equipment: exercise.equipment,
          exercise_type: exercise.exercise_type,
          user_id: exercise.user_id,
          retired_at: exercise.retired_at,
        })
        .from(exercise),
    );
    const missing = refs.filter((ref) => matches.get(exerciseKey(ref))?.kind === "new");
    if (missing.length > 0) {
      const [live] = await tx
        .select({ total: count() })
        .from(exercise)
        .where(and(isNotNull(exercise.user_id), isNull(exercise.retired_at)));
      if ((live?.total ?? 0) + missing.length > CUSTOM_EXERCISE_LIMIT) {
        throw new Error("Too many custom exercises: archive some first");
      }
    }
    if (snapshot.format === "sigil.workout/v1") {
      assertRoom(await liveWorkouts(tx), 1, "liveWorkouts");
    } else {
      assertRoom(await livePrograms(tx), 1, "livePrograms");
      assertRoom(await liveWorkouts(tx), snapshot.program.workouts.length, "liveWorkouts");
    }
    return { userId, matches, missing };
  });

  // Step 1: the Custom exercises, in transactions of at most the operation budget.
  const exerciseIds = new Map<string, string>();
  for (const [key, match] of plan.matches) {
    if (match.kind !== "new") exerciseIds.set(key, match.id);
  }
  for (const group of chunked(plan.missing, EXERCISES_PER_TRANSACTION)) {
    const made = await step((tx) => createExercises(tx, plan.userId, group));
    for (const [key, id] of made) exerciseIds.set(key, id);
  }
  const createdExercises = plan.missing.length;

  if (snapshot.format === "sigil.workout/v1") {
    const id = await step((tx) =>
      insertWorkout(tx, plan.userId, null, snapshot.workout, exerciseIds),
    );
    return { kind: "workout", id, createdExercises };
  }

  const content: ShareProgram = snapshot.program;
  // Step 2: the Program alone, so each Workout can point at it.
  const programId = uuidv7();
  await step(async (tx) => {
    await tx.insert(program).values({
      id: programId,
      user_id: plan.userId,
      title: content.title,
      description: content.description,
      planned_weeks: content.planned_weeks,
      sessions_per_week: content.sessions_per_week,
      cover_media_id: null,
      created_at: nowIso(),
    });
  });
  // Step 3: one transaction per Workout (one write for it, one per exercise).
  const workoutIds: string[] = [];
  for (const item of content.workouts) {
    workoutIds.push(
      await step((tx) => insertWorkout(tx, plan.userId, programId, item, exerciseIds)),
    );
  }
  // Step 4: the Rotation, which points only at Workouts that now exist.
  await step(async (tx) => {
    assertRoom(await slotsIn(tx, programId), content.rotation.length, "slotsPerProgram");
    const positions = keysBetween(null, null, content.rotation.length);
    for (const [at, index] of content.rotation.entries()) {
      await tx.insert(programSlot).values({
        id: uuidv7(),
        user_id: plan.userId,
        program_id: programId,
        workout_id: index === null ? null : (workoutIds[index] ?? null),
        position: positions[at] ?? "a0",
        created_at: nowIso(),
      });
    }
  });
  return { kind: "program", id: programId, createdExercises };
}
