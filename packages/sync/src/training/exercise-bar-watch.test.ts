import { describe, expect, it } from "vitest";

import { createFakeDatabase } from "../platform/fake-database";
import type { TrainingDatabase } from "./store";
import { watchExerciseBar } from "./watch";

/**
 * A database whose watch runs the statement on the fake's real SQLite with exactly the parameters
 * the caller gave, so a statement and its parameters that disagree throw, as they do on device.
 */
function runningWatches() {
  const fake = createFakeDatabase();
  const calls: { sql: string; params: readonly string[] }[] = [];
  const database = {
    watchWithCallback: (
      sql: string,
      params: string[],
      handler: {
        onResult: (result: {
          array: Record<string, string | number | null | bigint | Uint8Array>[];
        }) => void;
      },
    ) => {
      calls.push({ sql, params });
      handler.onResult({ array: fake.sqlite.prepare(sql).all(...params) });
    },
  };
  // Safety: the watch calls only `watchWithCallback`, which the object above implements.
  return { fake, calls, training: database as never as TrainingDatabase };
}

describe("watchExerciseBar", () => {
  it("binds exactly its one placeholder and reports the remembered bar", () => {
    const { fake, calls, training } = runningWatches();
    fake.sqlite
      .prepare("INSERT INTO exercise_setting (id, exercise_id, bar_id) VALUES ('s', 'e1', 'b1')")
      .run();
    const seen: (string | null)[] = [];
    watchExerciseBar(training, "e1", { onBar: (id) => seen.push(id), onError: () => undefined });
    expect(calls[0]?.params).toEqual(["e1"]);
    expect(seen).toEqual(["b1"]);
  });
  it("reports no bar for an exercise without a setting", () => {
    const { training } = runningWatches();
    const seen: (string | null)[] = [];
    watchExerciseBar(training, "none", { onBar: (id) => seen.push(id), onError: () => undefined });
    expect(seen).toEqual([null]);
  });
});
