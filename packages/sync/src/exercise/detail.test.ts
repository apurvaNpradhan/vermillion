import { describe, expect, it } from "vitest";

import { createFakeDatabase } from "../platform/fake-database";
import { exerciseDetailQuery, swapCandidatesQuery } from "./detail";

type Seed = {
  id: string;
  title: string;
  primary: string;
  equipment: string;
  rank?: number;
  retired?: string | null;
};

const seeds: Seed[] = [
  { id: "bench", title: "Bench Press", primary: "chest", equipment: "barbell", rank: 90 },
  { id: "db", title: "Dumbbell Press", primary: "chest", equipment: "dumbbell", rank: 50 },
  { id: "fly", title: "cable fly", primary: "chest", equipment: "machine", rank: 50 },
  { id: "ab-fly", title: "Ab Fly", primary: "chest", equipment: "machine", rank: 50 },
  { id: "bench2", title: "Close Grip Bench", primary: "chest", equipment: "barbell", rank: 80 },
  { id: "old", title: "Retired Press", primary: "chest", equipment: "kettlebell", retired: "x" },
  { id: "row", title: "Row", primary: "lats", equipment: "machine", rank: 99 },
  { id: "pushup", title: "Push Up", primary: "chest", equipment: "none", rank: 70 },
];

function setup(rows: Seed[] = seeds) {
  const fake = createFakeDatabase();
  const insert = fake.sqlite.prepare(
    `INSERT INTO exercise (id, user_id, title, primary_muscle, secondary_muscles, equipment,
       exercise_type, is_full_bodyweight, rank, retired_at, created_at)
     VALUES (?, NULL, ?, ?, '["triceps"]', ?, 'weight_reps', 0, ?, ?, 'now')`,
  );
  for (const s of rows) {
    insert.run(s.id, s.title, s.primary, s.equipment, s.rank ?? 0, s.retired ?? null);
  }
  return fake.sqlite;
}

const candidates = (limit?: number) => {
  const { sql, params } = swapCandidatesQuery(
    { id: "bench", primaryMuscle: "chest", equipment: "barbell" },
    limit,
  );
  return setup()
    .prepare(sql)
    .all(...params)
    .map((row) => row["id"]);
};

describe("swap candidates", () => {
  it("lists live rows of the same primary muscle and other equipment by rank, then title", () => {
    // pushup 70, then the three rank-50 rows by title (Ab Fly, cable fly, Dumbbell Press).
    expect(candidates()).toEqual(["pushup", "ab-fly", "fly", "db"]);
  });

  it("leaves out the same equipment, retired rows, other muscles and the exercise itself", () => {
    const list = candidates();
    expect(list).not.toContain("bench");
    expect(list).not.toContain("bench2");
    expect(list).not.toContain("old");
    expect(list).not.toContain("row");
  });

  it("returns at most the limit", () => {
    expect(candidates(2)).toEqual(["pushup", "ab-fly"]);
  });

  it("returns at most 8 by default", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      id: `x${String(index).padStart(2, "0")}`,
      title: `Extra ${index}`,
      primary: "chest",
      equipment: "dumbbell",
    }));
    const { sql, params } = swapCandidatesQuery({
      id: "bench",
      primaryMuscle: "chest",
      equipment: "barbell",
    });
    expect(
      setup([...seeds, ...many])
        .prepare(sql)
        .all(...params),
    ).toHaveLength(8);
  });
});

describe("exercise detail query", () => {
  it("resolves a retired row by id", () => {
    const { sql, params } = exerciseDetailQuery("old");
    const row = setup()
      .prepare(sql)
      .get(...params);
    expect(row?.["title"]).toBe("Retired Press");
    expect(row?.["retired_at"]).toBe("x");
  });

  it("finds nothing for an unknown id", () => {
    const { sql, params } = exerciseDetailQuery("nope");
    expect(
      setup()
        .prepare(sql)
        .get(...params),
    ).toBeUndefined();
  });
});
