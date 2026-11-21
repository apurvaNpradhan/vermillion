import type { PlannedImportSession } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { readMatchingLibrary } from "../../exercise/matching-library";
import {
  importSessionBatch,
  newImportBatchId,
  readKnownSessions,
  undoImportChunk,
} from "./import-store";
import { PLANK, SQUAT, setupSessions } from "./session-fixtures";

const day = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

function planned(
  startedAt: string,
  overrides: Partial<PlannedImportSession> = {},
): PlannedImportSession {
  return {
    key: startedAt,
    title: "Push Day",
    note: "Shoulder tight",
    startedAt,
    durationS: 3600,
    exercises: [
      {
        exerciseId: SQUAT,
        title: "Squat",
        type: "weight_reps",
        note: null,
        supersetKey: "s",
        logEffort: true,
        sets: [
          { kind: "warmup", weightKg: 40, reps: 8, durationS: null, distanceM: null, rpe: null },
          { kind: "working", weightKg: 100, reps: 5, durationS: null, distanceM: null, rpe: 8 },
        ],
      },
      {
        exerciseId: PLANK,
        title: "Plank",
        type: "duration",
        note: "Slow",
        supersetKey: "s",
        logEffort: false,
        sets: [
          {
            kind: "working",
            weightKg: null,
            reps: null,
            durationS: 60,
            distanceM: null,
            rpe: null,
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe("importSessionBatch", () => {
  it("writes finished Sessions with their exercises and ticked sets, tagged with the batch", async () => {
    const s = await setupSessions();
    const batch = newImportBatchId();
    const started = day(10);
    const result = await importSessionBatch(s.training, batch, [planned(started)]);
    expect(result).toEqual({ sessions: 1, sets: 3 });

    const [row] = s.all("training_session");
    expect(row).toMatchObject({
      user_id: "owner",
      import_batch_id: batch,
      title: "Push Day",
      title_derived: 0,
      note: "Shoulder tight",
      started_at: started,
      finished_at: new Date(Date.parse(started) + 3_600_000).toISOString(),
      duration_s: 3600,
      workout_id: null,
      program_id: null,
      run_id: null,
      slot_id: null,
      cycle: null,
      rest_set_id: null,
      device_id: s.installId,
    });
    const exercises = s.exercises(String(row?.["id"]));
    expect(exercises.map((item) => item["exercise_title"])).toEqual(["Squat", "Plank"]);
    expect(exercises[0]).toMatchObject({
      log_effort: 1,
      exercise_type: "weight_reps",
      user_id: "owner",
    });
    expect(exercises[0]?.["superset_group"]).toBe(exercises[1]?.["superset_group"]);
    expect(exercises[0]?.["superset_group"]).not.toBeNull();
    const sets = s.sets(String(exercises[0]?.["id"]));
    expect(sets.map((item) => item["kind"])).toEqual(["warmup", "working"]);
    expect(sets[1]).toMatchObject({ weight_kg: 100, reps: 5, rpe: 8 });
    expect(sets.every((item) => item["completed_at"] !== null)).toBe(true);
    expect(s.all("program_run")).toHaveLength(0);
  });

  it("writes whole Sessions or none: an invalid one rolls the batch back", async () => {
    const s = await setupSessions();
    const batch = newImportBatchId();
    await expect(
      importSessionBatch(s.training, batch, [planned(day(5)), planned("2001-01-01T00:00:00.000Z")]),
    ).rejects.toThrow("10 years");
    expect(s.all("training_session")).toHaveLength(0);
    expect(s.all("session_exercise")).toHaveLength(0);
    expect(s.all("session_set")).toHaveLength(0);
  });

  it("refuses to write for a device account that changed", async () => {
    const s = await setupSessions();
    await expect(
      importSessionBatch(s.training, newImportBatchId(), [planned(day(2))], "someone-else"),
    ).rejects.toThrow("account changed");
    expect(s.all("training_session")).toHaveLength(0);
  });
});

describe("readKnownSessions", () => {
  it("lists finished Sessions in the window with their exercise ids", async () => {
    const s = await setupSessions();
    const started = day(3);
    await importSessionBatch(s.training, newImportBatchId(), [planned(started), planned(day(40))]);
    const known = await readKnownSessions(s.training, { from: day(10), to: day(0) });
    expect(known).toHaveLength(1);
    expect(known[0]?.startedAt).toBe(started);
    expect([...(known[0]?.exerciseIds ?? [])].sort()).toEqual([PLANK, SQUAT].sort());
  });
});

describe("undoImportChunk", () => {
  it("deletes exactly the Sessions of the batch, in chunks", async () => {
    const s = await setupSessions();
    const mine = newImportBatchId();
    const other = newImportBatchId();
    await importSessionBatch(s.training, mine, [planned(day(1)), planned(day(2)), planned(day(3))]);
    await importSessionBatch(s.training, other, [planned(day(4))]);

    const first = await undoImportChunk(s.training, mine, 2);
    expect(first).toEqual({ deleted: 2, remaining: 1 });
    const second = await undoImportChunk(s.training, mine, 2);
    expect(second).toEqual({ deleted: 1, remaining: 0 });

    const left = s.all("training_session");
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ import_batch_id: other });
    expect(s.all("session_exercise")).toHaveLength(2);
    expect(s.all("session_set")).toHaveLength(3);
  });
});

describe("readMatchingLibrary", () => {
  it("lists live catalog and own exercises, leaving out archived ones", async () => {
    const s = await setupSessions();
    s.sqlite
      .prepare(
        `INSERT INTO exercise (id, user_id, title, primary_muscle, secondary_muscles, equipment,
           exercise_type, is_full_bodyweight, retired_at, created_at)
         VALUES (?, ?, ?, 'other', '[]', 'none', 'duration', 0, ?, 'now')`,
      )
      .run("0192f0a0-0000-7000-8000-0000000000aa", "owner", "Old thing", "2026-01-01");
    const library = await readMatchingLibrary(s.training);
    expect(library.map((item) => item.title).sort()).toEqual([
      "Assisted dip",
      "Curl",
      "Plank",
      "Push-up",
      "Squat",
    ]);
    expect(library.find((item) => item.title === "Plank")).toMatchObject({
      custom: false,
      exerciseType: "duration",
    });
  });
});
