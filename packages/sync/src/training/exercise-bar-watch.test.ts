import { describe, expect, it } from "vitest";

import { createFakeDatabase } from "../platform/fake-database";
import type { TrainingDatabase } from "./store";
import { watchExerciseBar, watchExerciseRule, watchExerciseRules } from "./watch";

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

describe("watchExerciseRule and watchExerciseRules", () => {
  it("report the rule of one exercise, and every rule by exercise", () => {
    const { fake, calls, training } = runningWatches();
    const insert = fake.sqlite.prepare(
      "INSERT INTO exercise_setting (id, exercise_id, progression_rule) VALUES (?, ?, ?)",
    );
    insert.run("a", "e1", '{"id":"linear","reset_percent":15}');
    insert.run("b", "e2", '{"id":"maintain"}');
    insert.run("c", "e3", null);
    // A rule a newer build wrote reads as none.
    insert.run("d", "e4", '{"id":"waves"}');
    const one: unknown[] = [];
    watchExerciseRule(training, "e1", {
      onRule: (rule) => one.push(rule),
      onError: () => undefined,
    });
    expect(calls[0]?.params).toEqual(["e1"]);
    expect(one).toEqual([{ id: "linear", reset_percent: 15 }]);
    const none: unknown[] = [];
    watchExerciseRule(training, "e3", {
      onRule: (rule) => none.push(rule),
      onError: () => undefined,
    });
    expect(none).toEqual([null]);
    const all: (readonly [string, unknown])[][] = [];
    watchExerciseRules(training, {
      onRules: (rules) => all.push([...rules]),
      onError: () => undefined,
    });
    expect(all[0]).toEqual([
      ["e1", { id: "linear", reset_percent: 15 }],
      ["e2", { id: "maintain" }],
    ]);
  });

  it("read the first row of an exercise alike when a sync left two", () => {
    const { fake, training } = runningWatches();
    const insert = fake.sqlite.prepare(
      "INSERT INTO exercise_setting (id, exercise_id, progression_rule) VALUES (?, ?, ?)",
    );
    // e1: the first row has no rule, a later duplicate has one. e2: the reverse.
    insert.run("a1", "e1", null);
    insert.run("a2", "e1", '{"id":"linear"}');
    insert.run("b1", "e2", '{"id":"maintain"}');
    insert.run("b2", "e2", '{"id":"linear"}');
    const rules: (readonly [string, unknown])[][] = [];
    watchExerciseRules(training, {
      onRules: (found) => rules.push([...found]),
      onError: () => undefined,
    });
    expect(rules[0]).toEqual([["e2", { id: "maintain" }]]);
    for (const [exercise, expected] of [
      ["e1", null],
      ["e2", { id: "maintain" }],
    ] as const) {
      const one: unknown[] = [];
      watchExerciseRule(training, exercise, {
        onRule: (rule) => one.push(rule),
        onError: () => undefined,
      });
      expect(one).toEqual([expected]);
    }
  });
});
