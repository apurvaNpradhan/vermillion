import { describe, expect, it } from "vitest";

import { createFakeDatabase } from "../platform/fake-database";
import { exerciseDetailQuery, swapCandidatesQuery } from "./detail";

type Seed = {
  id: string;
  title: string;
  primary: string;
  equipment: string;
  rank?: number;
  details?: string[];
  retired?: string | null;
  type?: string;
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
       exercise_type, is_full_bodyweight, rank, retired_at, primary_detail, created_at)
     VALUES (?, NULL, ?, ?, '["triceps"]', ?, ?, 0, ?, ?, ?, 'now')`,
  );
  for (const s of rows) {
    insert.run(
      s.id,
      s.title,
      s.primary,
      s.equipment,
      s.type ?? "weight_reps",
      s.rank ?? 0,
      s.retired ?? null,
      JSON.stringify(s.details ?? []),
    );
  }
  return fake.sqlite;
}

const candidates = (limit?: number) => {
  const { sql, params } = swapCandidatesQuery(
    { id: "bench", primaryMuscle: "chest", exerciseType: "weight_reps" },
    limit,
  );
  return setup()
    .prepare(sql)
    .all(...params)
    .map((row) => row["id"]);
};

describe("swap candidates", () => {
  it("lists live rows of the same primary muscle and other equipment by rank, then title", () => {
    // close grip 80, pushup 70, then the rank-50 rows by title (Ab Fly, cable fly, Dumbbell Press).
    expect(candidates()).toEqual(["bench2", "pushup", "ab-fly", "fly", "db"]);
  });

  it("offers the same equipment too, but not retired rows, other muscles or the exercise itself", () => {
    const list = candidates();
    expect(list).not.toContain("bench");
    expect(list).toContain("bench2");
    expect(list).not.toContain("old");
    expect(list).not.toContain("row");
  });

  it("returns at most the limit", () => {
    expect(candidates(2)).toEqual(["bench2", "pushup"]);
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
    });
    expect(
      setup([...seeds, ...many])
        .prepare(sql)
        .all(...params),
    ).toHaveLength(8);
  });
});

describe("swap candidates by exercise type", () => {
  const mixed: Seed[] = [
    { id: "squat", title: "Squat", primary: "quadriceps", equipment: "barbell", rank: 50 },
    { id: "press", title: "Leg Press", primary: "quadriceps", equipment: "machine", rank: 40 },
    { id: "wsit", title: "Wall Sit", primary: "quadriceps", equipment: "none", type: "duration" },
    {
      id: "pistol",
      title: "Pistol",
      primary: "quadriceps",
      equipment: "none",
      type: "bodyweight_reps",
    },
    {
      id: "wlunge",
      title: "Weighted Lunge",
      primary: "quadriceps",
      equipment: "none",
      type: "bodyweight_weighted_reps",
    },
    { id: "lunge", title: "Lunge", primary: "quadriceps", equipment: "none", type: "reps_only" },
  ];
  const listed = (exerciseType: Parameters<typeof swapCandidatesQuery>[0]["exerciseType"]) => {
    const { sql, params } = swapCandidatesQuery({
      id: "squat",
      primaryMuscle: "quadriceps",
      exerciseType,
    });
    return setup(mixed)
      .prepare(sql)
      .all(...params)
      .map((row) => row["id"]);
  };

  it("never offers a duration or bodyweight alternative for a weighted lift", () => {
    expect(listed("weight_reps")).toEqual(["press", "wlunge"]);
  });

  it("keeps bodyweight rep exercises together, and a timed one with timed ones", () => {
    expect(listed("bodyweight_reps").sort()).toEqual(["lunge", "pistol"]);
    expect(listed("duration")).toEqual(["wsit"]);
  });

  it("filters nothing when the type is not known", () => {
    expect(listed(undefined)).toHaveLength(5);
  });
});

describe("swap candidates by muscle details", () => {
  const shoulders: Seed[] = [
    {
      id: "lat-db",
      title: "Dumbbell Lateral Raise",
      primary: "shoulders",
      equipment: "dumbbell",
      rank: 10,
      details: ["side_delts"],
    },
    {
      id: "lat-cable",
      title: "Cable Lateral Raise",
      primary: "shoulders",
      equipment: "cable",
      rank: 5,
      details: ["side_delts"],
    },
    {
      id: "rear",
      title: "Rear Delt Fly",
      primary: "shoulders",
      equipment: "machine",
      rank: 90,
      details: ["rear_delts"],
    },
    {
      id: "press",
      title: "Overhead Press",
      primary: "shoulders",
      equipment: "kettlebell",
      rank: 80,
      details: ["front_delts", "side_delts"],
    },
    { id: "plain", title: "Plain", primary: "shoulders", equipment: "other", rank: 95 },
  ];
  const order = (primaryDetail: ("side_delts" | "front_delts")[]) => {
    const { sql, params } = swapCandidatesQuery({
      id: "lat-bar",
      primaryMuscle: "shoulders",
      primaryDetail,
    });
    return setup(shoulders)
      .prepare(sql)
      .all(...params)
      .map((row) => row["id"]);
  };

  it("ranks by shared primary details first, then rank", () => {
    expect(order(["side_delts"])).toEqual(["press", "lat-db", "lat-cable", "plain", "rear"]);
    expect(order(["side_delts", "front_delts"])).toEqual([
      "press",
      "lat-db",
      "lat-cable",
      "plain",
      "rear",
    ]);
  });

  it("keeps the rank order for an exercise without details", () => {
    expect(order([])).toEqual(["plain", "rear", "press", "lat-db", "lat-cable"]);
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
