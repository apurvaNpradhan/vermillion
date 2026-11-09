import { describe, expect, it } from "vitest";

import { createFakeDatabase } from "../platform/fake-database";
import { retiredExerciseIds } from "./retired";
import type { ExerciseDatabase } from "./store";

describe("retiredExerciseIds", () => {
  it("returns only the archived ones among the asked ids", async () => {
    const fake = createFakeDatabase();
    // Safety: the fake implements the database methods the query calls.
    const database = fake.database as never as ExerciseDatabase;
    const insert = fake.sqlite.prepare(
      "INSERT INTO exercise (id, title, retired_at) VALUES (?, 't', ?)",
    );
    insert.run("live", null);
    insert.run("gone", "2026-01-01T00:00:00Z");
    insert.run("other", "2026-01-01T00:00:00Z");
    expect(await retiredExerciseIds(database, ["live", "gone", "missing"])).toEqual(
      new Set(["gone"]),
    );
    expect(await retiredExerciseIds(database, [])).toEqual(new Set());
  });
});
