import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PowerSyncDatabase } from "@powersync/node";
import type { ExerciseType } from "@workspace/shared";

import { claimDeviceOwner } from "../../platform/device-owner";
import { ensureInstallId } from "../../platform/install-meta";
import { powerSyncSchema } from "../../platform/schema";
import { addExercises, createWorkout, updateWorkoutExercise } from "../store";

/**
 * A real PowerSync database (the production schema, views and local indexes on SQLite) filled with
 * a lifter's finished history, for measuring what the live Session screen reads when it opens.
 * Rows go in through the views, as sync would write them; ids and times are deterministic.
 */

const OWNER = "owner";
const DAY = 86_400_000;

type Template = { title: string; lifts: readonly string[] };

const POOL: readonly { title: string; muscle: string; equipment: string; type: ExerciseType }[] = [
  { title: "Bench press", muscle: "chest", equipment: "barbell", type: "weight_reps" },
  { title: "Incline press", muscle: "chest", equipment: "dumbbell", type: "weight_reps" },
  { title: "Overhead press", muscle: "shoulders", equipment: "barbell", type: "weight_reps" },
  { title: "Lateral raise", muscle: "shoulders", equipment: "dumbbell", type: "weight_reps" },
  { title: "Triceps pushdown", muscle: "triceps", equipment: "cable", type: "weight_reps" },
  { title: "Barbell row", muscle: "lats", equipment: "barbell", type: "weight_reps" },
  { title: "Lat pulldown", muscle: "lats", equipment: "cable", type: "weight_reps" },
  { title: "Face pull", muscle: "shoulders", equipment: "cable", type: "weight_reps" },
  { title: "Curl", muscle: "biceps", equipment: "dumbbell", type: "weight_reps" },
  { title: "Squat", muscle: "quadriceps", equipment: "barbell", type: "weight_reps" },
  { title: "Romanian deadlift", muscle: "hamstrings", equipment: "barbell", type: "weight_reps" },
  { title: "Leg press", muscle: "quadriceps", equipment: "machine", type: "weight_reps" },
  { title: "Leg curl", muscle: "hamstrings", equipment: "machine", type: "weight_reps" },
  { title: "Calf raise", muscle: "calves", equipment: "machine", type: "weight_reps" },
  { title: "Plank", muscle: "abdominals", equipment: "none", type: "duration" },
  { title: "Pull-up", muscle: "lats", equipment: "none", type: "bodyweight_weighted_reps" },
  { title: "Dip", muscle: "triceps", equipment: "none", type: "bodyweight_weighted_reps" },
  { title: "Hip thrust", muscle: "glutes", equipment: "barbell", type: "weight_reps" },
  { title: "Lunge", muscle: "quadriceps", equipment: "dumbbell", type: "weight_reps" },
  { title: "Cable fly", muscle: "chest", equipment: "cable", type: "weight_reps" },
  { title: "Shrug", muscle: "traps", equipment: "dumbbell", type: "weight_reps" },
  { title: "Hammer curl", muscle: "biceps", equipment: "dumbbell", type: "weight_reps" },
  { title: "Back extension", muscle: "lower_back", equipment: "machine", type: "weight_reps" },
  { title: "Crunch", muscle: "abdominals", equipment: "none", type: "bodyweight_reps" },
];

export const exerciseId = (index: number) =>
  `0192f0a0-0000-7000-8000-${String(index + 1).padStart(12, "0")}`;

const UPPER_A: Template = { title: "Upper A", lifts: [0, 5, 2, 6, 4, 8].map(exerciseId) };

/** Four days a week, five to six lifts each, drawn from the pool. */
const TEMPLATES: readonly Template[] = [
  UPPER_A,
  { title: "Lower A", lifts: [9, 10, 11, 12, 13, 14].map(exerciseId) },
  { title: "Upper B", lifts: [1, 15, 3, 19, 16, 21].map(exerciseId) },
  { title: "Lower B", lifts: [17, 18, 10, 22, 13].map(exerciseId) },
];

/** Small deterministic generator so every run reads the same history. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

const uuid = (kind: number, n: number) =>
  `0192f${kind.toString(16)}00-${(n >> 16).toString(16).padStart(4, "0")}-7000-8000-${(n & 0xffff).toString(16).padStart(12, "0")}`;

export type History = {
  /** The Session count actually written. */
  sessions: number;
  sets: number;
};

export type HistoryOptions = {
  /** Finished Sessions to write (four a week going back). */
  sessions: number;
};

export async function createHistoryDatabase() {
  const directory = mkdtempSync(join(tmpdir(), "vermillion-session-open-"));
  const database = new PowerSyncDatabase({
    schema: powerSyncSchema,
    database: { dbFilename: "open.db", dbLocation: directory },
  });
  await database.init();
  await claimDeviceOwner(database, OWNER);
  const installId = await ensureInstallId(database);
  await database.writeTransaction(async (tx) => {
    for (const [index, entry] of POOL.entries()) {
      await tx.execute(
        `INSERT INTO exercise (id, user_id, title, primary_muscle, secondary_muscles, equipment,
           exercise_type, is_full_bodyweight, created_at) VALUES (?, NULL, ?, ?, '[]', ?, ?, 0, 'now')`,
        [exerciseId(index), entry.title, entry.muscle, entry.equipment, entry.type],
      );
    }
    // A saved setting for half the lifts, and a gym with a kit and two caps.
    for (const index of [0, 2, 5, 9, 10, 17]) {
      await tx.execute(
        `INSERT INTO exercise_setting (id, user_id, exercise_id, bar_id, unit, log_effort,
           progression_per_set, auto_warmups, created_at) VALUES (?, ?, ?, NULL, 'kg', 0, 0, 1, 'now')`,
        [uuid(5, index), OWNER, exerciseId(index)],
      );
    }
    await tx.execute(
      `INSERT INTO gym (id, user_id, name, created_at) VALUES (?, ?, 'My gym', 'now')`,
      [uuid(6, 1), OWNER],
    );
    for (let n = 0; n < 12; n++) {
      await tx.execute(
        `INSERT INTO gym_equipment (id, user_id, gym_id, kind, weight_kg, unit, count, enabled, created_at)
           VALUES (?, ?, ?, 'plate', ?, 'kg', 4, 1, 'now')`,
        [uuid(7, n), OWNER, uuid(6, 1), 1.25 * (n + 1)],
      );
    }
    for (const index of [0, 9]) {
      await tx.execute(
        `INSERT INTO gym_exercise_setting (id, user_id, gym_id, exercise_id, load_ranges, created_at)
           VALUES (?, ?, ?, ?, '[{"max":200}]', 'now')`,
        [uuid(8, index), OWNER, uuid(6, 1), exerciseId(index)],
      );
    }
  });
  return {
    database,
    installId,
    owner: OWNER,
    async close() {
      await database.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export type HistoryDatabase = Awaited<ReturnType<typeof createHistoryDatabase>>;

/** Writes `sessions` finished Sessions, newest yesterday, four a week, in one transaction. */
export async function seedHistory(
  { database, installId }: HistoryDatabase,
  { sessions }: HistoryOptions,
): Promise<History> {
  const next = random(7);
  let sets = 0;
  let exerciseRows = 0;
  let setRows = 0;
  await database.writeTransaction(async (tx) => {
    for (let n = 0; n < sessions; n++) {
      const template = TEMPLATES[n % TEMPLATES.length] ?? UPPER_A;
      // Oldest first, so ids and started_at agree; a session every 1.75 days.
      const startedAt = new Date(Date.now() - (sessions - n) * 1.75 * DAY).toISOString();
      const finishedAt = new Date(Date.parse(startedAt) + 3_600_000).toISOString();
      const sessionId = uuid(1, n);
      await tx.execute(
        `INSERT INTO training_session (id, user_id, title, title_derived, started_at, finished_at,
           duration_s, device_id, paused_ms, created_at) VALUES (?, ?, ?, 0, ?, ?, 3600, ?, 0, ?)`,
        [sessionId, OWNER, template.title, startedAt, finishedAt, installId, startedAt],
      );
      for (const [position, lift] of template.lifts.entries()) {
        const entryId = uuid(2, exerciseRows++);
        const index = POOL.findIndex((_, at) => exerciseId(at) === lift);
        await tx.execute(
          `INSERT INTO session_exercise (id, user_id, session_id, exercise_id, exercise_title,
             exercise_type, position, log_effort, repeated, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
          [
            entryId,
            OWNER,
            sessionId,
            lift,
            POOL[index]?.title ?? "",
            POOL[index]?.type ?? "weight_reps",
            `a${position}`,
            next() < 0.1 ? "felt heavy" : null,
            startedAt,
          ],
        );
        const count = 3 + Math.floor(next() * 3);
        for (let at = 0; at < count; at++) {
          sets += 1;
          await tx.execute(
            `INSERT INTO session_set (id, user_id, session_exercise_id, position, kind, weight_kg,
               reps, completed_at, generated_warmup, target, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?)`,
            [
              uuid(3, setRows++),
              OWNER,
              entryId,
              `a${at}`,
              at === 0 && next() < 0.3 ? "warmup" : "working",
              40 + Math.round(next() * 60),
              5 + Math.floor(next() * 8),
              startedAt,
              startedAt,
            ],
          );
        }
      }
    }
  });
  return { sessions, sets };
}

/** A Workout of the first template's six lifts, made with the real store. */
export async function makeWorkout({ database }: HistoryDatabase) {
  const lifts = UPPER_A.lifts;
  const workoutId = await createWorkout(database, { title: "Upper A" });
  const entries = await addExercises(database, workoutId, [...lifts]);
  for (const entry of entries) {
    await updateWorkoutExercise(database, entry, {
      sets: [
        { kind: "working", reps_min: 5, reps_max: 8, weight_kg: 60 },
        { kind: "working", reps_min: 5, reps_max: 8, weight_kg: 60 },
        { kind: "working", reps_min: 5, reps_max: 8, weight_kg: 60 },
      ],
    });
  }
  return { workoutId, lifts };
}
