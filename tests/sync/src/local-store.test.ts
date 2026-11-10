import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PowerSyncDatabase } from "@powersync/node";
import type { CustomExerciseInput } from "@workspace/shared";
import {
  DEFAULT_LIBRARY_FILTERS,
  addExercises,
  addSlot,
  archiveExercise,
  claimDeviceOwner,
  createCustomExercise,
  createProgram,
  createWorkout,
  deleteProgram,
  powerSyncSchema,
  updateCustomExercise,
  updateWorkoutExercise,
  watchExercise,
  watchExerciseLibrary,
  type ExerciseDetail,
  type LibraryPage,
} from "@workspace/sync";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The exercise store on real PowerSync (Node SQLite), no services: what Drizzle writes must land
// in the CRUD upload queue exactly as raw SQL did, and live reads must follow only `exercise`.

let directory = "";
let database: PowerSyncDatabase;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "vermillion-local-store-"));
  database = new PowerSyncDatabase({
    schema: powerSyncSchema,
    database: { dbFilename: "store.db", dbLocation: directory },
  });
  await database.init();
  await claimDeviceOwner(database, "owner");
});

afterEach(async () => {
  await database.close();
  rmSync(directory, { recursive: true, force: true });
});

const input = (title: string): CustomExerciseInput => ({
  title,
  primary_muscle: "chest",
  secondary_muscles: ["triceps"],
  equipment: "dumbbell",
  exercise_type: "weight_reps",
  is_full_bodyweight: false,
  instructions: "text",
});

describe("Drizzle writes reach the upload queue", () => {
  it("queues a PUT with every column and a PATCH with only the changed ones", async () => {
    const id = await createCustomExercise(database, input("First"));
    expect(await updateCustomExercise(database, id, { title: "First" })).toBe(false);
    expect(await updateCustomExercise(database, id, { instructions: "changed" })).toBe(true);
    expect(await archiveExercise(database, id)).toBe(true);

    const entries = (await database.getCrudBatch(10))?.crud ?? [];
    expect(entries.map((entry) => [entry.op, entry.table, entry.id])).toEqual([
      ["PUT", "exercise", id],
      ["PATCH", "exercise", id],
      ["PATCH", "exercise", id],
    ]);
    expect(entries[0]?.opData).toMatchObject({
      user_id: "owner",
      title: "First",
      primary_muscle: "chest",
      secondary_muscles: '["triceps"]',
      instructions: "text",
    });
    expect(Object.keys(entries[1]?.opData ?? {})).toEqual(["instructions"]);
    expect(entries[1]?.opData?.["instructions"]).toBe("changed");
    // Archiving is a PATCH of `retired_at`: nothing is ever deleted.
    expect(Object.keys(entries[2]?.opData ?? {})).toEqual(["retired_at"]);
    expect((await database.getUploadQueueStats()).count).toBe(3);

    // A raw INSERT produces the same PUT payload (PowerSync leaves NULL columns out).
    const columns = Object.keys(entries[0]?.opData ?? {}).sort();
    await database.execute(
      `INSERT INTO exercise (id, user_id, title, primary_muscle, secondary_muscles, equipment,
         exercise_type, is_full_bodyweight, rank, instructions, created_at)
       VALUES (?, 'owner', 'Raw', 'chest', '["triceps"]', 'dumbbell', 'weight_reps', 0, 0, 'text', ?)`,
      ["raw", new Date().toISOString()],
    );
    const raw = (await database.getCrudBatch(10))?.crud.at(-1);
    expect(Object.keys(raw?.opData ?? {}).sort()).toEqual(columns);
  });

  it("queues nothing for a no-op update or a write that fails validation", async () => {
    const id = await createCustomExercise(database, input("Same"));
    const before = (await database.getUploadQueueStats()).count;
    await updateCustomExercise(database, id, { title: "Same" });
    await expect(updateCustomExercise(database, id, { title: "" })).rejects.toThrow();
    expect((await database.getUploadQueueStats()).count).toBe(before);
  });

  it("commits a create as one transaction", async () => {
    await createCustomExercise(database, input("One"));
    const tx = await database.getNextCrudTransaction();
    expect(tx?.crud).toHaveLength(1);
  });
});

describe("live reads", () => {
  it("lists A-Z in a window, follows writes to exercise and stops when told", async () => {
    const pages: LibraryPage[] = [];
    const errors: Error[] = [];
    for (const title of ["b", "c", "d"]) await createCustomExercise(database, input(title));
    const stop = watchExerciseLibrary(database, DEFAULT_LIBRARY_FILTERS, 2, {
      onPage: (page) => pages.push(page),
      onError: (error) => errors.push(error),
    });
    await vi.waitFor(() => expect(pages).toHaveLength(1));
    expect(pages[0]?.rows.map((row) => row.title)).toEqual(["b", "c"]);
    expect(pages[0]?.hasMore).toBe(true);

    const id = await createCustomExercise(database, input("a"));
    await vi.waitFor(() => expect(pages.at(-1)?.rows[0]?.title).toBe("a"));

    // A write to another table does not re-run the exercise query.
    const seen = pages.length;
    await claimDeviceOwner(database, "someone-else");
    await database.execute("INSERT INTO install_meta (id, install_id, created_at) VALUES (?,?,?)", [
      "x",
      "y",
      "z",
    ]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(pages).toHaveLength(seen);

    stop();
    await archiveExercise(database, id);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(pages).toHaveLength(seen);
    expect(errors).toEqual([]);
  });

  it("watches one exercise: null until it exists, then its changes and archive", async () => {
    const seen: Array<ExerciseDetail | null> = [];
    const stop = watchExercise(database, "01900000-0000-7000-8000-000000000001", {
      onExercise: (exercise) => seen.push(exercise),
      onError: () => undefined,
    });
    await vi.waitFor(() => expect(seen.at(-1)).toBeNull());
    stop();

    const id = await createCustomExercise(database, input("Mine"));
    const watched: Array<ExerciseDetail | null> = [];
    const stopMine = watchExercise(database, id, {
      onExercise: (exercise) => watched.push(exercise),
      onError: () => undefined,
    });
    await vi.waitFor(() => expect(watched.at(-1)?.title).toBe("Mine"));
    await updateCustomExercise(database, id, { title: "Renamed" });
    await vi.waitFor(() => expect(watched.at(-1)?.title).toBe("Renamed"));
    await archiveExercise(database, id);
    await vi.waitFor(() => expect(watched.at(-1)?.isArchived).toBe(true));
    stopMine();
  });

  it("reports an error instead of a page when a stored row is malformed", async () => {
    await database.execute(
      "INSERT INTO exercise (id, user_id, title, primary_muscle, equipment, created_at) VALUES (?,?,?,?,?,?)",
      ["n1", "owner", null, "chest", "dumbbell", "t"],
    );
    const errors: Error[] = [];
    const stop = watchExerciseLibrary(database, DEFAULT_LIBRARY_FILTERS, 5, {
      onPage: () => undefined,
      onError: (e) => errors.push(e),
    });
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    stop();
  });
});

const PRESS = "0192f0a0-0000-7000-8000-0000000000aa";

describe("training store writes reach the upload queue", () => {
  it("queues PUTs with sets as JSON text, a PATCH of one field and the deletes parent first", async () => {
    await database.execute(
      `INSERT INTO exercise (id, user_id, title, primary_muscle, secondary_muscles, equipment,
         exercise_type, is_full_bodyweight, rank, created_at)
       VALUES ('0192f0a0-0000-7000-8000-0000000000aa', NULL, 'Press', 'chest', '["triceps"]', 'barbell', 'weight_reps', 0, 0, ?)`,
      [new Date().toISOString()],
    );
    const programId = await createProgram(database, {
      title: "Plan",
      description: null,
      planned_weeks: null,
    });
    const workoutId = await createWorkout(database, { program_id: programId });
    const [row] = await addExercises(database, workoutId, [PRESS]);
    await addSlot(database, programId, workoutId);
    await updateWorkoutExercise(database, row ?? "", { note: "Cue" });
    await deleteProgram(database, programId);

    const entries = (await database.getCrudBatch(50))?.crud ?? [];
    expect(entries.map((entry) => `${entry.op} ${entry.table}`)).toEqual([
      "PUT exercise",
      "PUT program",
      "PUT workout",
      "PUT workout_exercise",
      "PUT program_slot",
      "PATCH workout_exercise",
      "DELETE program",
      "DELETE program_slot",
      "DELETE workout_exercise",
      "DELETE workout",
    ]);
    const put = entries[3]?.opData;
    expect(put).toMatchObject({ workout_id: workoutId, exercise_id: PRESS, rest_seconds: 180 });
    expect(JSON.parse(String(put?.["sets"]))).toHaveLength(3);
    expect(Object.keys(entries[5]?.opData ?? {})).toEqual(["note"]);
    expect(await database.getAll("SELECT id FROM workout_exercise")).toEqual([]);
  });
});
