import { describe, expect, it } from "vitest";

import { createFakeDatabase } from "../platform/fake-database";
import { watchExerciseMuscles, type ExerciseMuscles } from "./muscles";
import type { ExerciseDatabase } from "./store";

describe("watchExerciseMuscles", () => {
  it("reads every exercise, not just the first 200 ids", () => {
    const fake = createFakeDatabase();
    const insert = fake.sqlite.prepare(
      `INSERT INTO exercise (id, user_id, title, primary_muscle, secondary_muscles, equipment,
         exercise_type, is_full_bodyweight, rank, retired_at, created_at)
       VALUES (?, NULL, ?, 'chest', '[]', 'none', 'weight_reps', 0, 0, NULL, 'now')`,
    );
    const ids = Array.from({ length: 450 }, (_, index) => `ex-${index}`);
    for (const id of ids) insert.run(id, id);
    // Runs each batch's query on the real SQLite, as the device's watch would.
    const pending: (() => void)[] = [];
    const database: Pick<ExerciseDatabase, "watchWithCallback"> = {
      watchWithCallback: (sql, params = [], handler) => {
        pending.push(() => {
          const array = fake.sqlite.prepare(sql).all(...params);
          handler?.onResult?.(Object.assign([...array], { array }));
        });
      },
    };
    const results: ExerciseMuscles[][] = [];
    const stop = watchExerciseMuscles(database, [...ids, ids[0] ?? ""], {
      onRows: (rows) => results.push(rows),
      onError: (error) => {
        throw error;
      },
    });
    try {
      expect(pending).toHaveLength(3);
      pending[2]?.();
      pending[0]?.();
      expect(results).toHaveLength(0);
      pending[1]?.();
      expect(results[0]?.map((row) => row.id).sort()).toEqual([...ids].sort());
      stop();
      pending[0]?.();
      expect(results).toHaveLength(1);
    } finally {
      stop();
      fake.sqlite.close();
    }
  });
});
