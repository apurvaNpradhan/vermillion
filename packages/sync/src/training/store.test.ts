import { TRAINING_LIMITS, type PlannedSet } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { claimDeviceOwner } from "../platform/device-owner";
import { createFakeDatabase } from "../platform/fake-database";
import { createMedia } from "../media/index";
import { ensureInstallId } from "../platform/install-meta";
import {
  addExercises,
  addSlot,
  copyProgram,
  copyWorkout,
  copyWorkoutIntoProgram,
  createProgram,
  createWorkout,
  deleteProgram,
  deleteWorkout,
  duplicateSlotWorkout,
  moveSlot,
  moveWorkoutExercise,
  removeFromRotation,
  removeSlot,
  removeWorkoutExercise,
  replaceExercise,
  restoreFromRotation,
  restoreProgram,
  restoreWorkout,
  restoreWorkoutExercise,
  removeFromSuperset,
  setProgramCover,
  setProgramCoverToNewMedia,
  setWorkoutCover,
  setWorkoutCoverToNewMedia,
  supersetWithNext,
  TrainingLimitError,
  updateProgram,
  updateSlot,
  updateWorkout,
  updateWorkoutExercise,
  type TrainingDatabase,
} from "./store";

const SQUAT = "0192f0a0-0000-7000-8000-000000000001";
const CURL = "0192f0a0-0000-7000-8000-000000000002";
const PLANK = "0192f0a0-0000-7000-8000-000000000003";
const GONE = "0192f0a0-0000-7000-8000-0000000000ff";
const PUSHUP = "0192f0a0-0000-7000-8000-000000000004";

async function setup() {
  const fake = createFakeDatabase();
  await claimDeviceOwner(fake.database, "owner");
  const insert = fake.sqlite.prepare(
    `INSERT INTO exercise (id, user_id, title, primary_muscle, secondary_muscles, equipment,
       exercise_type, is_full_bodyweight, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, 0, 'now')`,
  );
  insert.run(SQUAT, "Squat", "quadriceps", '["glutes"]', "barbell", "weight_reps");
  insert.run(CURL, "Curl", "biceps", "[]", "dumbbell", "weight_reps");
  insert.run(PLANK, "Plank", "abdominals", "[]", "none", "duration");
  insert.run(PUSHUP, "Push-up", "chest", "[]", "none", "reps_only");
  // Safety: the fake implements the database methods the store calls.
  const training = fake.database as never as TrainingDatabase;
  const all = (table: string) => fake.sqlite.prepare(`SELECT * FROM ${table}`).all();
  const one = (table: string, id: string) =>
    fake.sqlite.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  const ordered = (table: string, parent: string, id: string) =>
    fake.sqlite
      .prepare(`SELECT id FROM ${table} WHERE ${parent} = ? ORDER BY position, id`)
      .all(id)
      .map((row) => String(row["id"]));
  return { ...fake, training, all, one, ordered };
}

type S = Awaited<ReturnType<typeof setup>>;

const programInput = {
  title: "Push Pull Legs",
  description: null,
  planned_weeks: null,
  sessions_per_week: null,
};

describe("programs", () => {
  it("creates for the Device owner and updates only dirty fields", async () => {
    const s = await setup();
    const id = await createProgram(s.training, programInput);
    expect(s.one("program", id)).toMatchObject({
      user_id: "owner",
      title: "Push Pull Legs",
      cover_media_id: null,
    });
    expect(await updateProgram(s.training, id, { title: "Push Pull Legs" })).toBe(false);
    expect(await updateProgram(s.training, id, { planned_weeks: 8, sessions_per_week: null })).toBe(
      true,
    );
    expect(s.one("program", id)).toMatchObject({
      planned_weeks: 8,
      sessions_per_week: null,
      title: "Push Pull Legs",
    });
    await expect(
      updateProgram(s.training, id, { planned_weeks: 53, sessions_per_week: null }),
    ).rejects.toThrow();
    await expect(createProgram(s.training, { ...programInput, title: " " })).rejects.toThrow();
    expect(await updateProgram(s.training, "missing", { title: "x" })).toBe(false);
  });

  it("renames a Program whose stored phase plan this build cannot read", async () => {
    const s = await setup();
    const id = await createProgram(s.training, programInput);
    // A newer app wrote a phase this build does not know.
    s.sqlite
      .prepare("UPDATE program SET phase_plan = ? WHERE id = ?")
      .run(JSON.stringify({ pattern: ["build", "taper"], overrides: [] }), id);
    expect(await updateProgram(s.training, id, { title: "Renamed" })).toBe(true);
    expect(s.one("program", id)).toMatchObject({ title: "Renamed" });
  });

  it("refuses a missing Device owner and a stale install", async () => {
    const bare = createFakeDatabase();
    await expect(
      // Safety: the fake implements the database methods the store calls.
      createProgram(bare.database as never as TrainingDatabase, programInput),
    ).rejects.toThrow("Device owner");
    const s = await setup();
    const installId = await ensureInstallId(s.database);
    await expect(createProgram(s.training, programInput, installId)).resolves.toEqual(
      expect.any(String),
    );
    await expect(createProgram(s.training, programInput, "another")).rejects.toThrow(
      "device account changed",
    );
  });

  it("deletes the whole plan and restores it with the same ids", async () => {
    const s = await setup();
    const programId = await createProgram(s.training, programInput);
    const workoutId = await createWorkout(s.training, { program_id: programId });
    await addExercises(s.training, workoutId, [SQUAT, CURL]);
    await addSlot(s.training, programId, workoutId);
    await addSlot(s.training, programId, null);
    const before = {
      workout: s.all("workout"),
      exercise: s.all("workout_exercise"),
      slot: s.all("program_slot"),
    };

    const deleted = await deleteProgram(s.training, programId);
    expect(deleted?.workouts).toHaveLength(1);
    for (const table of ["program", "workout", "workout_exercise", "program_slot"]) {
      expect(s.all(table), table).toEqual([]);
    }
    expect(await deleteProgram(s.training, programId)).toBeNull();

    expect(deleted && (await restoreProgram(s.training, deleted))).toBe(true);
    // Same ids and content, each now carrying the explicit restore marker the upload needs.
    const marked = <Row extends object>(rows: Row[]) => rows.map((r) => ({ ...r, restore: 1 }));
    expect(s.all("workout")).toEqual(marked(before.workout));
    expect(s.all("workout_exercise")).toEqual(marked(before.exercise));
    expect(s.all("program_slot")).toEqual(marked(before.slot));
    expect(s.one("program", programId)).toMatchObject({ restore: 1 });
    expect(deleted && (await restoreProgram(s.training, deleted))).toBe(false);
  });

  it("copies a Program with new ids and a Rotation pointing at the copies", async () => {
    const s = await setup();
    const programId = await createProgram(s.training, programInput);
    const upper = await createWorkout(s.training, { program_id: programId, title: "Upper" });
    await addExercises(s.training, upper, [SQUAT]);
    await addSlot(s.training, programId, upper);
    await addSlot(s.training, programId, null);
    await addSlot(s.training, programId, upper);

    const copy = await copyProgram(s.training, programId);
    expect(copy).not.toBe(programId);
    const workouts = s.all("workout").filter((row) => row["program_id"] === copy);
    expect(workouts).toHaveLength(1);
    const copied = String(workouts[0]?.["id"]);
    expect(copied).not.toBe(upper);
    expect(s.ordered("program_slot", "program_id", copy)).toHaveLength(3);
    const slots = s
      .all("program_slot")
      .filter((row) => row["program_id"] === copy)
      .map((row) => row["workout_id"]);
    expect(slots.toSorted((a, b) => String(a).localeCompare(String(b)))).toEqual(
      [null, copied, copied].toSorted((a, b) => String(a).localeCompare(String(b))),
    );
    expect(s.all("workout_exercise").filter((row) => row["workout_id"] === copied)).toHaveLength(1);
    // The original is untouched.
    expect(s.all("workout_exercise").filter((row) => row["workout_id"] === upper)).toHaveLength(1);
  });
});

describe("workouts", () => {
  it("creates standalone or in a Program, and refuses a missing Program", async () => {
    const s = await setup();
    const alone = await createWorkout(s.training);
    expect(s.one("workout", alone)).toMatchObject({ program_id: null, title: null, note: null });
    await expect(createWorkout(s.training, { program_id: GONE })).rejects.toThrow();
    await expect(createWorkout(s.training, { title: " " })).rejects.toThrow();
  });

  it("updates only dirty fields", async () => {
    const s = await setup();
    const id = await createWorkout(s.training, { title: "Legs" });
    expect(await updateWorkout(s.training, id, { title: "Legs" })).toBe(false);
    expect(await updateWorkout(s.training, id, { note: "Slow tempo" })).toBe(true);
    expect(await updateWorkout(s.training, id, { title: null })).toBe(true);
    expect(s.one("workout", id)).toMatchObject({ title: null, note: "Slow tempo" });
  });

  it("deletes with its exercises and Slots and restores them", async () => {
    const s = await setup();
    const programId = await createProgram(s.training, programInput);
    const keep = await createWorkout(s.training, { program_id: programId });
    const doomed = await createWorkout(s.training, { program_id: programId });
    await addExercises(s.training, doomed, [SQUAT]);
    await addSlot(s.training, programId, doomed);
    await addSlot(s.training, programId, keep);

    const deleted = await deleteWorkout(s.training, doomed);
    expect(s.one("workout", doomed)).toBeUndefined();
    expect(s.all("workout_exercise")).toEqual([]);
    expect(s.all("program_slot")).toHaveLength(1);
    expect(deleted && (await restoreWorkout(s.training, deleted))).toBe(true);
    expect(s.all("workout_exercise")).toHaveLength(1);
    expect(s.all("program_slot")).toHaveLength(2);
    expect(await deleteWorkout(s.training, "missing")).toBeNull();
  });

  it("copies a Workout standalone or into a Program with new ids", async () => {
    const s = await setup();
    const programId = await createProgram(s.training, programInput);
    const source = await createWorkout(s.training, { title: "Arms", note: "Pump" });
    const [a, b] = await addExercises(s.training, source, [CURL, CURL]);
    await updateWorkoutExercise(s.training, a ?? "", {
      superset_group: "0192f0a0-0000-7000-8000-0000000000aa",
    });
    await updateWorkoutExercise(s.training, b ?? "", {
      superset_group: "0192f0a0-0000-7000-8000-0000000000aa",
    });

    const inProgram = await copyWorkout(s.training, source, programId);
    const standalone = await copyWorkout(s.training, source, null);
    expect(s.one("workout", inProgram)).toMatchObject({
      program_id: programId,
      title: "Arms",
      note: "Pump",
    });
    expect(s.one("workout", standalone)).toMatchObject({ program_id: null });
    const copied = s.all("workout_exercise").filter((row) => row["workout_id"] === inProgram);
    expect(copied).toHaveLength(2);
    expect(copied.map((row) => row["id"])).not.toContain(a);
    // The Superset group is new, but the two copies still share it.
    const groups = new Set(copied.map((row) => row["superset_group"]));
    expect(groups.size).toBe(1);
    expect(groups.has("0192f0a0-0000-7000-8000-0000000000aa")).toBe(false);
    await expect(copyWorkout(s.training, source, GONE)).rejects.toThrow();
  });
});

describe("workout exercises", () => {
  async function workoutWith(s: S, ...exerciseIds: string[]) {
    const workoutId = await createWorkout(s.training);
    const ids = await addExercises(s.training, workoutId, exerciseIds);
    return { workoutId, ids };
  }

  it("appends exercises in order with the defaults of their type", async () => {
    const s = await setup();
    const { workoutId, ids } = await workoutWith(s, SQUAT, CURL, PLANK);
    expect(s.ordered("workout_exercise", "workout_id", workoutId)).toEqual(ids);
    const [squat, curl, plank] = ids.map((id) => s.one("workout_exercise", id));
    expect(JSON.parse(String(squat?.["sets"]))).toEqual([
      { kind: "working", reps_min: 8, reps_max: 12 },
      { kind: "working", reps_min: 8, reps_max: 12 },
      { kind: "working", reps_min: 8, reps_max: 12 },
    ]);
    // A barbell compound lift is raised to 180 s; a curl keeps the 120 s default.
    expect(squat?.["rest_seconds"]).toBe(180);
    expect(curl?.["rest_seconds"]).toBe(120);
    expect(JSON.parse(String(plank?.["sets"]))[0]).toEqual({ kind: "working", duration_s: 30 });
    const more = await addExercises(s.training, workoutId, [PUSHUP], { defaultRestSeconds: 45 });
    expect(s.ordered("workout_exercise", "workout_id", workoutId)).toEqual([...ids, ...more]);
    expect(s.one("workout_exercise", more[0] ?? "")).toMatchObject({ rest_seconds: 45 });
    await expect(addExercises(s.training, workoutId, ["unknown"])).rejects.toThrow();
  });

  it("refuses more than 40 exercises", async () => {
    const s = await setup();
    const { workoutId } = await workoutWith(s, ...Array.from({ length: 40 }, () => CURL));
    await expect(addExercises(s.training, workoutId, [CURL])).rejects.toThrow(TrainingLimitError);
    expect(s.all("workout_exercise")).toHaveLength(TRAINING_LIMITS.exercisesPerWorkout);
  });

  it("updates dirty fields and checks the sets against the exercise type", async () => {
    const s = await setup();
    const { ids } = await workoutWith(s, CURL, PLANK);
    const [curl, plank] = ids;
    expect(await updateWorkoutExercise(s.training, curl ?? "", { rest_seconds: 120 })).toBe(false);
    expect(
      await updateWorkoutExercise(s.training, curl ?? "", { rest_seconds: null, note: "Slow" }),
    ).toBe(true);
    expect(s.one("workout_exercise", curl ?? "")).toMatchObject({
      rest_seconds: null,
      note: "Slow",
    });
    const sets: PlannedSet[] = [
      { kind: "warmup" as const, reps_min: 12, reps_max: 12, weight_kg: 10 },
      {
        kind: "working" as const,
        reps_min: 8,
        reps_max: 10,
        weight_kg: 20,
        effort_min: 8,
        effort_max: 9,
      },
    ];
    expect(await updateWorkoutExercise(s.training, curl ?? "", { sets })).toBe(true);
    expect(JSON.parse(String(s.one("workout_exercise", curl ?? "")?.["sets"]))).toEqual(sets);
    // Same sets again: nothing to write.
    expect(await updateWorkoutExercise(s.training, curl ?? "", { sets })).toBe(false);
    await expect(
      updateWorkoutExercise(s.training, plank ?? "", {
        sets: [{ kind: "working", reps_min: 5, reps_max: 5 }],
      }),
    ).rejects.toThrow();
    await expect(
      updateWorkoutExercise(s.training, curl ?? "", {
        sets: Array.from({ length: 21 }, () => ({ kind: "working" as const })),
      }),
    ).rejects.toThrow();
  });

  it("moves one row and rewrites only that row", async () => {
    const s = await setup();
    const { workoutId, ids } = await workoutWith(s, CURL, CURL, CURL, CURL);
    const [a, b, c, d] = ids as [string, string, string, string];
    const keys = () => s.all("workout_exercise").map((row) => [row["id"], row["position"]]);
    const before = keys();
    expect(await moveWorkoutExercise(s.training, d, a)).toBe(true);
    expect(s.ordered("workout_exercise", "workout_id", workoutId)).toEqual([d, a, b, c]);
    const changed = keys().filter((entry, index) => entry[1] !== before[index]?.[1]);
    expect(changed.map((entry) => entry[0])).toEqual([d]);
    expect(await moveWorkoutExercise(s.training, d, null)).toBe(true);
    expect(s.ordered("workout_exercise", "workout_id", workoutId)).toEqual([a, b, c, d]);
    expect(await moveWorkoutExercise(s.training, b, c)).toBe(true);
    expect(await moveWorkoutExercise(s.training, b, b)).toBe(false);
    expect(await moveWorkoutExercise(s.training, "missing", null)).toBe(false);
  });

  it("repairs colliding keys before a move", async () => {
    const s = await setup();
    const { workoutId, ids } = await workoutWith(s, CURL, CURL, CURL);
    const [a, b, c] = ids as [string, string, string];
    // Two devices inserted at the same spot: a and b share a key.
    const shared = s.one("workout_exercise", a)?.["position"];
    s.sqlite
      .prepare("UPDATE workout_exercise SET position = ? WHERE id = ?")
      .run(String(shared), b);
    const order = s.ordered("workout_exercise", "workout_id", workoutId);
    expect(await moveWorkoutExercise(s.training, c, order[1] ?? "")).toBe(true);
    const positions = s.all("workout_exercise").map((row) => row["position"]);
    expect(new Set(positions).size).toBe(3);
    expect(s.ordered("workout_exercise", "workout_id", workoutId)).toEqual([order[0], c, order[1]]);
  });

  it("replaces an exercise, keeping sets of the same type and resetting others", async () => {
    const s = await setup();
    const { ids } = await workoutWith(s, CURL);
    const id = ids[0] ?? "";
    const sets = [{ kind: "working" as const, reps_min: 5, reps_max: 5, weight_kg: 50 }];
    await updateWorkoutExercise(s.training, id, { sets, note: "Cue", rest_seconds: 90 });
    expect(await replaceExercise(s.training, id, SQUAT)).toBe(true);
    expect(s.one("workout_exercise", id)).toMatchObject({
      exercise_id: SQUAT,
      note: "Cue",
      rest_seconds: 90,
    });
    expect(JSON.parse(String(s.one("workout_exercise", id)?.["sets"]))).toEqual(sets);

    expect(await replaceExercise(s.training, id, PLANK, { defaultRestSeconds: 30 })).toBe(true);
    const row = s.one("workout_exercise", id);
    expect(row).toMatchObject({ exercise_id: PLANK, note: "Cue", rest_seconds: 30 });
    expect(JSON.parse(String(row?.["sets"]))).toEqual([
      { kind: "working", duration_s: 30 },
      { kind: "working", duration_s: 30 },
      { kind: "working", duration_s: 30 },
    ]);
    expect(await replaceExercise(s.training, id, PLANK)).toBe(false);
  });

  it("removes an exercise", async () => {
    const s = await setup();
    const { ids } = await workoutWith(s, CURL, PLANK);
    expect(await removeWorkoutExercise(s.training, ids[0] ?? "")).toBe(true);
    expect(await removeWorkoutExercise(s.training, ids[0] ?? "")).toBe(false);
    expect(s.all("workout_exercise")).toHaveLength(1);
  });
});

describe("supersets", () => {
  async function trio() {
    const s = await setup();
    const workoutId = await createWorkout(s.training);
    const ids = await addExercises(s.training, workoutId, [SQUAT, CURL, PLANK, PUSHUP]);
    const [a, b, c, d] = ids as [string, string, string, string];
    const fields = (id: string) => {
      const row = s.one("workout_exercise", id);
      return { group: row?.["superset_group"] ?? null, rest: row?.["rest_seconds"] ?? null };
    };
    return { s, workoutId, a, b, c, d, fields };
  }

  it("groups an exercise with the next one, rest staying on the last member", async () => {
    const { s, a, b, c, fields } = await trio();
    const bRest = fields(b).rest;
    expect(await supersetWithNext(s.training, a)).toBe(true);
    expect(fields(a).group).toEqual(fields(b).group);
    expect(fields(a).group).not.toBeNull();
    expect(fields(a).rest).toBeNull();
    expect(fields(b).rest).toBe(bRest);
    expect(fields(c).group).toBeNull();
    // Again, or for the last row, there is nothing to do.
    expect(await supersetWithNext(s.training, a)).toBe(false);
    expect(await supersetWithNext(s.training, "missing")).toBe(false);
  });

  it("joins the next exercise's group and keeps growing it", async () => {
    const { s, a, b, c, d, fields } = await trio();
    await supersetWithNext(s.training, b);
    const group = fields(b).group;
    await supersetWithNext(s.training, a);
    expect(fields(a).group).toBe(group);
    await supersetWithNext(s.training, b);
    expect(fields(d).group).toBeNull();
    await supersetWithNext(s.training, b);
    expect([a, b, c].map((id) => fields(id).group)).toEqual([group, group, group]);
    expect([a, b, c].map((id) => fields(id).rest === null)).toEqual([true, true, false]);
  });

  it("removes from a superset, clears a group of one and keeps the group's rest", async () => {
    const { s, a, b, fields } = await trio();
    await supersetWithNext(s.training, a);
    const rest = fields(b).rest;
    expect(await removeFromSuperset(s.training, a)).toBe(true);
    expect(fields(a)).toEqual({ group: null, rest });
    expect(fields(b)).toEqual({ group: null, rest });
    expect(await removeFromSuperset(s.training, a)).toBe(false);
  });

  it("removes a member dragged out of its run", async () => {
    const { s, a, b, c, d, fields } = await trio();
    await supersetWithNext(s.training, a);
    await supersetWithNext(s.training, b);
    const group = fields(a).group;
    // Drag the first member to the end: it leaves, the other two stay together.
    await moveWorkoutExercise(s.training, a, null);
    expect(fields(a).group).toBeNull();
    expect(fields(a).rest).not.toBeNull();
    expect(fields(b).group).toBe(group);
    expect(fields(c).group).toBe(group);
    // Drag one of the two away: the pair dissolves.
    await moveWorkoutExercise(s.training, c, null);
    expect(fields(b).group).toBeNull();
    expect(fields(c).group).toBeNull();
    expect(fields(d).group).toBeNull();
    expect(fields(b).rest).not.toBeNull();
  });

  it("keeps a member that moves inside its run and lets a row dropped inside join", async () => {
    const { s, a, b, c, d, fields } = await trio();
    await supersetWithNext(s.training, a);
    await supersetWithNext(s.training, b);
    const group = fields(a).group;
    await moveWorkoutExercise(s.training, a, c);
    expect(fields(a).group).toBe(group);
    await moveWorkoutExercise(s.training, d, c);
    expect(fields(d).group).toBe(group);
    expect(fields(d).rest).toBeNull();
    expect(fields(c).rest).not.toBeNull();
  });

  it("clears the partner when one member is removed, and Undo restores the row", async () => {
    const { s, workoutId, a, b, fields } = await trio();
    await supersetWithNext(s.training, a);
    const row = s.one("workout_exercise", b);
    const rest = fields(b).rest;
    expect(await removeWorkoutExercise(s.training, b)).toBe(true);
    expect(fields(a)).toEqual({ group: null, rest });
    await restoreWorkoutExercise(s.training, {
      id: b,
      workout_id: workoutId,
      exercise_id: String(row?.["exercise_id"]),
      position: String(row?.["position"]),
      rest_seconds: rest === null ? null : Number(rest),
      note: null,
      superset_group: null,
      sets: [],
    });
    expect(s.ordered("workout_exercise", "workout_id", workoutId).slice(0, 2)).toEqual([a, b]);
  });

  it("repairs a patch that sets a rest on a non-last member", async () => {
    const { s, a, fields } = await trio();
    await supersetWithNext(s.training, a);
    await updateWorkoutExercise(s.training, a, { rest_seconds: 45 });
    expect(fields(a).rest).toBeNull();
  });
});

describe("program covers", () => {
  const image = { width: 1024, height: 768, bytes: 90_000, thumbBytes: 8_000 };

  it("creates the media and the reference in one transaction, then replaces the reference", async () => {
    const s = await setup();
    const id = await createProgram(s.training, programInput);
    const first = await setProgramCoverToNewMedia(s.training, id, image);
    expect(s.one("program", id)).toMatchObject({ cover_media_id: first.mediaId });
    expect(s.one("media", first.mediaId)).toMatchObject({
      user_id: "owner",
      kind: "program_cover",
      mime: "image/jpeg",
      width: 1024,
      height: 768,
      bytes: 90_000,
      thumb_bytes: 8_000,
    });

    const second = await setProgramCoverToNewMedia(s.training, id, image);
    expect(s.one("media", first.mediaId)).toBeDefined();
    expect(s.all("media")).toHaveLength(2);
    expect(s.one("program", id)).toMatchObject({ cover_media_id: second.mediaId });
  });

  it("sets and clears a cover that exists, without deleting the media", async () => {
    const s = await setup();
    const id = await createProgram(s.training, programInput);
    const media = await createMedia(s.training, { kind: "program_cover", ...image });
    expect(await setProgramCover(s.training, id, media)).toBe(true);
    expect(s.one("program", id)).toMatchObject({ cover_media_id: media });
    expect(await setProgramCover(s.training, id, media)).toBe(true);
    expect(await setProgramCover(s.training, id, null)).toBe(true);
    expect(s.one("program", id)).toMatchObject({ cover_media_id: null });
    expect(s.one("media", media)).toBeDefined();
    expect(await setProgramCover(s.training, id, null)).toBe(true);
    expect(await setProgramCover(s.training, "missing", null)).toBe(false);
  });

  it("refuses a cover for a Program that is gone and writes nothing", async () => {
    const s = await setup();
    await expect(setProgramCoverToNewMedia(s.training, "missing", image)).rejects.toThrow("gone");
    expect(s.all("media")).toHaveLength(0);
  });

  it("refuses an image the server would refuse", async () => {
    const s = await setup();
    const id = await createProgram(s.training, programInput);
    await expect(
      setProgramCoverToNewMedia(s.training, id, { ...image, width: 4096 }),
    ).rejects.toThrow();
    await expect(
      setProgramCoverToNewMedia(s.training, id, { ...image, bytes: 20 * 1024 * 1024 }),
    ).rejects.toThrow();
    expect(s.all("media")).toHaveLength(0);
    expect(s.one("program", id)).toMatchObject({ cover_media_id: null });
  });

  it("keeps the media through delete and Undo", async () => {
    const s = await setup();
    const id = await createProgram(s.training, programInput);
    const { mediaId } = await setProgramCoverToNewMedia(s.training, id, image);
    const deleted = await deleteProgram(s.training, id);
    expect(deleted?.program.cover_media_id).toBe(mediaId);
    expect(s.one("media", mediaId)).toBeDefined();
    await restoreProgram(s.training, deleted as NonNullable<typeof deleted>);
    expect(s.one("program", id)).toMatchObject({ cover_media_id: mediaId });
    await deleteProgram(s.training, id);
    expect(s.one("media", mediaId)).toBeDefined();
  });
});

describe("workout covers", () => {
  const image = { width: 1024, height: 768, bytes: 90_000, thumbBytes: 8_000 };

  it("creates the media and the reference in one transaction, then replaces the reference", async () => {
    const s = await setup();
    const id = await createWorkout(s.training, {});
    const first = await setWorkoutCoverToNewMedia(s.training, id, image);
    expect(s.one("workout", id)).toMatchObject({ cover_media_id: first.mediaId });
    expect(s.one("media", first.mediaId)).toMatchObject({ kind: "workout_cover" });
    await setWorkoutCoverToNewMedia(s.training, id, image);
    expect(s.one("media", first.mediaId)).toBeDefined();
    expect(await setWorkoutCover(s.training, id, null)).toBe(true);
    expect(s.one("workout", id)).toMatchObject({ cover_media_id: null });
  });

  it("refuses a cover for a Workout that is gone and writes nothing", async () => {
    const s = await setup();
    await expect(setWorkoutCoverToNewMedia(s.training, "missing", image)).rejects.toThrow("gone");
    expect(s.all("media")).toHaveLength(0);
  });

  it("keeps the media through clearing both copies", async () => {
    const s = await setup();
    const id = await createWorkout(s.training, {});
    const { mediaId } = await setWorkoutCoverToNewMedia(s.training, id, image);
    const copy = await copyWorkout(s.training, id, null);
    expect(s.one("workout", copy)).toMatchObject({ cover_media_id: mediaId });
    // Clearing one keeps the media for the other.
    expect(await setWorkoutCover(s.training, id, null)).toBe(true);
    expect(s.one("media", mediaId)).toBeDefined();
    expect(await setWorkoutCover(s.training, copy, null)).toBe(true);
    expect(s.one("media", mediaId)).toBeDefined();
  });

  it("keeps the cover into and out of a Program", async () => {
    const s = await setup();
    const programId = await createProgram(s.training, programInput);
    const id = await createWorkout(s.training, {});
    const { mediaId } = await setWorkoutCoverToNewMedia(s.training, id, image);
    const { workoutId } = await copyWorkoutIntoProgram(s.training, id, programId);
    expect(s.one("workout", workoutId)).toMatchObject({ cover_media_id: mediaId });
    const out = await copyWorkout(s.training, workoutId, null);
    expect(s.one("workout", out)).toMatchObject({ cover_media_id: mediaId });
  });

  it("keeps the media after deleting both copies", async () => {
    const s = await setup();
    const id = await createWorkout(s.training, {});
    const { mediaId } = await setWorkoutCoverToNewMedia(s.training, id, image);
    const copy = await copyWorkout(s.training, id, null);
    const deleted = await deleteWorkout(s.training, id);
    expect(deleted?.workout.cover_media_id).toBe(mediaId);
    expect(s.one("workout", copy)).toMatchObject({ cover_media_id: mediaId });
    await deleteWorkout(s.training, copy);
    expect(s.one("media", mediaId)).toBeDefined();
  });
});

describe("slots", () => {
  it("appends, swaps, moves and removes", async () => {
    const s = await setup();
    const programId = await createProgram(s.training, programInput);
    const upper = await createWorkout(s.training, { program_id: programId });
    const lower = await createWorkout(s.training, { program_id: programId });
    const a = await addSlot(s.training, programId, upper);
    const b = await addSlot(s.training, programId, lower);
    const c = await addSlot(s.training, programId, null);
    expect(s.ordered("program_slot", "program_id", programId)).toEqual([a, b, c]);
    expect(await moveSlot(s.training, c, a)).toBe(true);
    expect(s.ordered("program_slot", "program_id", programId)).toEqual([c, a, b]);
    expect(await updateSlot(s.training, c, lower)).toBe(true);
    expect(await updateSlot(s.training, c, lower)).toBe(false);
    expect(s.one("program_slot", c)).toMatchObject({ workout_id: lower });
    expect(await removeSlot(s.training, a)).toBe(true);
    expect(await removeSlot(s.training, a)).toBe(false);
  });

  it("refuses a Workout of another Program or none, and more than 28 Slots", async () => {
    const s = await setup();
    const programId = await createProgram(s.training, programInput);
    const other = await createProgram(s.training, programInput);
    const foreign = await createWorkout(s.training, { program_id: other });
    const standalone = await createWorkout(s.training);
    await expect(addSlot(s.training, programId, foreign)).rejects.toThrow("does not belong");
    await expect(addSlot(s.training, programId, standalone)).rejects.toThrow("does not belong");
    await expect(addSlot(s.training, GONE, null)).rejects.toThrow();
    for (let i = 0; i < TRAINING_LIMITS.slotsPerProgram; i++)
      await addSlot(s.training, programId, null);
    await expect(addSlot(s.training, programId, null)).rejects.toThrow(TrainingLimitError);
    const slot = s.all("program_slot")[0];
    await expect(updateSlot(s.training, String(slot?.["id"]), foreign)).rejects.toThrow();
  });
});

describe("rotation", () => {
  async function rotation(s: S) {
    const programId = await createProgram(s.training, programInput);
    const upper = await createWorkout(s.training, { program_id: programId, title: "Upper" });
    await addExercises(s.training, upper, [SQUAT, CURL]);
    const lower = await createWorkout(s.training, { program_id: programId, title: "Lower" });
    const a = await addSlot(s.training, programId, upper);
    const rest = await addSlot(s.training, programId, null);
    const b = await addSlot(s.training, programId, upper);
    const c = await addSlot(s.training, programId, lower);
    return { programId, upper, lower, a, rest, b, c };
  }

  it("removes a Slot but keeps a Workout another Slot still uses", async () => {
    const s = await setup();
    const r = await rotation(s);
    const removed = await removeFromRotation(s.training, r.a);
    expect(removed?.kind).toBe("slot");
    expect(s.one("workout", r.upper)).toBeDefined();
    expect(s.one("program_slot", r.a)).toBeUndefined();
    if (!removed) throw new Error("removed");
    expect(await restoreFromRotation(s.training, removed)).toBe(true);
    expect(s.ordered("program_slot", "program_id", r.programId)).toEqual([r.a, r.rest, r.b, r.c]);
  });

  it("deletes the Workout with its last Slot, and Undo brings both back", async () => {
    const s = await setup();
    const r = await rotation(s);
    const removed = await removeFromRotation(s.training, r.c);
    expect(removed?.kind).toBe("workout");
    expect(s.one("workout", r.lower)).toBeUndefined();
    expect(s.one("program_slot", r.c)).toBeUndefined();
    if (!removed) throw new Error("removed");
    expect(await restoreFromRotation(s.training, removed)).toBe(true);
    expect(s.one("workout", r.lower)).toBeDefined();
    expect(s.one("program_slot", r.c)).toBeDefined();
    expect(await restoreFromRotation(s.training, removed)).toBe(false);
  });

  it("removes a Rest Slot and reports a missing one", async () => {
    const s = await setup();
    const r = await rotation(s);
    expect((await removeFromRotation(s.training, r.rest))?.kind).toBe("slot");
    expect(await removeFromRotation(s.training, r.rest)).toBeNull();
  });

  it("copies a Workout into a Program as a new Slot at the end, leaving the original alone", async () => {
    const s = await setup();
    const r = await rotation(s);
    const standalone = await createWorkout(s.training, { title: "Arms" });
    await addExercises(s.training, standalone, [CURL, PLANK]);
    const before = s.all("workout_exercise").filter((row) => row["workout_id"] === standalone);

    const copy = await copyWorkoutIntoProgram(s.training, standalone, r.programId);
    expect(copy.workoutId).not.toBe(standalone);
    expect(s.one("workout", copy.workoutId)).toMatchObject({
      program_id: r.programId,
      title: "Arms",
    });
    expect(s.ordered("program_slot", "program_id", r.programId).at(-1)).toBe(copy.slotId);
    expect(s.one("program_slot", copy.slotId)).toMatchObject({ workout_id: copy.workoutId });
    const copied = s.all("workout_exercise").filter((row) => row["workout_id"] === copy.workoutId);
    expect(copied.map((row) => row["exercise_id"])).toEqual([CURL, PLANK]);
    expect(copied.map((row) => row["id"])).not.toEqual(before.map((row) => row["id"]));
    // The original is unchanged and still standalone.
    expect(s.one("workout", standalone)).toMatchObject({ program_id: null, title: "Arms" });
    expect(s.all("workout_exercise").filter((row) => row["workout_id"] === standalone)).toEqual(
      before,
    );

    // One of this Program's own Workouts copies the same way; another Program's does not.
    const again = await copyWorkoutIntoProgram(s.training, r.upper, r.programId);
    expect(s.one("workout", again.workoutId)).toMatchObject({ program_id: r.programId });
    const other = await createProgram(s.training, programInput);
    await expect(copyWorkoutIntoProgram(s.training, r.upper, other)).rejects.toThrow("another");
    await expect(copyWorkoutIntoProgram(s.training, standalone, GONE)).rejects.toThrow();
  });

  it("gives a Slot its own copy while the others keep the original", async () => {
    const s = await setup();
    const r = await rotation(s);
    const result = await duplicateSlotWorkout(s.training, r.b);
    expect(result?.originalKept).toBe(true);
    expect(s.one("program_slot", r.b)).toMatchObject({ workout_id: result?.workoutId });
    expect(s.one("program_slot", r.a)).toMatchObject({ workout_id: r.upper });
    expect(s.all("workout_exercise").filter((row) => row["workout_id"] === r.upper)).toHaveLength(
      2,
    );
    expect(await duplicateSlotWorkout(s.training, r.rest)).toBeNull();
  });

  it("replaces a Workout that only this Slot used, so nothing is left without a Slot", async () => {
    const s = await setup();
    const r = await rotation(s);
    const result = await duplicateSlotWorkout(s.training, r.c);
    expect(result?.originalKept).toBe(false);
    expect(s.one("workout", r.lower)).toBeUndefined();
    expect(s.one("workout", result?.workoutId ?? "")).toBeDefined();
  });
});

describe("limits", () => {
  it("refuses a 101st Program", async () => {
    const s = await setup();
    for (let i = 0; i < TRAINING_LIMITS.livePrograms; i++)
      await createProgram(s.training, programInput);
    await expect(createProgram(s.training, programInput)).rejects.toThrow(TrainingLimitError);
  });
});
