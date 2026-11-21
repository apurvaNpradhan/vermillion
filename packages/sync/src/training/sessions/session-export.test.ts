import { expect, it, vi } from "vitest";

import { addSessionExercises, addSet, tickSet, updateSet } from "./session-content-store";
import { SQUAT, setupSessions } from "./session-fixtures";
import { readSessionExportRows } from "./session-export";
import { finishSession, startSession } from "./session-store";

it("reads every ticked set of every finished Session, oldest first, and nothing else", async () => {
  const s = await setupSessions();
  const finished = async (startedAt: string, weights: number[]) => {
    const id = await startSession(s.training, { workoutId: null, derivedTitle: "Squats" });
    const [exercise] = await addSessionExercises(s.training, id, [SQUAT]);
    const [first] = s.sets(exercise ?? "");
    await updateSet(s.training, String(first?.["id"]), { kind: "warmup" });
    await tickSet(s.training, String(first?.["id"]), { weight: 40, reps: 10 });
    for (const weight of weights) {
      const setId = await addSet(s.training, exercise ?? "");
      await tickSet(s.training, setId, { weight, reps: 5, rpe: 8 });
    }
    // An unticked set is not exported.
    await addSet(s.training, exercise ?? "");
    await finishSession(s.training, id, {
      startedAt,
      finishedAt: new Date(Date.parse(startedAt) + 3600_000).toISOString(),
    });
  };
  await finished("2026-01-05T10:00:00.000Z", [100, 105]);
  await finished("2026-01-02T10:00:00.000Z", [90]);
  // Unfinished: left out.
  const open = await startSession(s.training, { workoutId: null, derivedTitle: "Squats" });
  await addSessionExercises(s.training, open, [SQUAT]);

  const rows = await readSessionExportRows(s.training);
  expect(rows.map((row) => [row.startedAt.slice(0, 10), row.kind, row.weightKg])).toEqual([
    ["2026-01-02", "warmup", 40],
    ["2026-01-02", "working", 90],
    ["2026-01-05", "warmup", 40],
    ["2026-01-05", "working", 100],
    ["2026-01-05", "working", 105],
  ]);
  expect(rows[1]).toMatchObject({ exercise: "Squat", reps: 5, workout: "Squats" });
});

it("reads all pages in one transaction and preserves floors and steps", async () => {
  const s = await setupSessions();
  const id = await startSession(s.training, { workoutId: null, derivedTitle: "Cardio" });
  const [exercise] = await addSessionExercises(s.training, id, [SQUAT]);
  const [first] = s.sets(exercise ?? "");
  await tickSet(s.training, String(first?.["id"]), { weight: 40, reps: 10 });
  await finishSession(s.training, id, { finishedAt: new Date().toISOString() });

  // Populate past sets at the SQLite boundary so the export has to fetch multiple pages.
  s.sqlite
    .prepare(`
    WITH RECURSIVE seq(n) AS (
      SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 2001
    )
    INSERT INTO session_set (id, session_exercise_id, position, kind, completed_at, floors, steps)
    SELECT printf('export-%04d', n), ?, 'z', 'working', '2026-01-01T10:00:00Z',
      CASE WHEN n = 2000 THEN 9 END, CASE WHEN n = 2001 THEN 200 END
    FROM seq
  `)
    .run(exercise ?? "");

  const readTransaction = vi.spyOn(s.training, "readTransaction");
  const rows = await readSessionExportRows(s.training);
  expect(readTransaction).toHaveBeenCalledTimes(1);
  expect(rows).toHaveLength(2002);
  expect(rows.at(-2)).toMatchObject({ floors: 9, steps: null });
  expect(rows.at(-1)).toMatchObject({ floors: null, steps: 200 });
});
