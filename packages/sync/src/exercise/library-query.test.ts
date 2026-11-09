import { describe, expect, it } from "vitest";

import { createFakeDatabase } from "../platform/fake-database";
import {
  DEFAULT_LIBRARY_FILTERS,
  hasActiveFilters,
  libraryCountQuery,
  libraryQuery,
  type LibraryFilters,
} from "./library-query";

type Seed = {
  id: string;
  title: string;
  primary?: string;
  secondary?: string[];
  equipment?: string;
  rank?: number;
  aka?: string | null;
  terms?: string | null;
  user?: string | null;
  retired?: string | null;
};

const seeds: Seed[] = [
  {
    id: "a1",
    title: "Bench Press",
    primary: "chest",
    secondary: ["triceps", "shoulders"],
    equipment: "barbell",
    rank: 90,
    aka: "flat press",
    terms: "pecs",
  },
  {
    id: "a2",
    title: "Incline Bench Press",
    primary: "chest",
    secondary: ["shoulders"],
    equipment: "dumbbell",
    rank: 50,
  },
  {
    id: "a3",
    title: "Triceps Pushdown",
    primary: "triceps",
    equipment: "machine",
    rank: 70,
    terms: "bench accessory",
  },
  {
    id: "a4",
    title: "Squat",
    primary: "quadriceps",
    secondary: ["glutes"],
    equipment: "barbell",
    rank: 95,
    aka: "back squat",
  },
  { id: "a5", title: "100% Effort_Row", primary: "lats", equipment: "machine", rank: 0 },
  { id: "a6", title: "Ab Wheel", primary: "abdominals", equipment: "other", rank: 10 },
  { id: "c1", title: "my bench variation", primary: "chest", equipment: "barbell", user: "u1" },
  {
    id: "c2",
    title: "Old custom",
    primary: "biceps",
    equipment: "dumbbell",
    user: "u1",
    retired: "2026-01-01",
  },
  {
    id: "r1",
    title: "Retired catalog",
    primary: "chest",
    equipment: "barbell",
    rank: 99,
    retired: "2026-01-01",
  },
];

async function setup() {
  const fake = createFakeDatabase();
  const insert = fake.sqlite.prepare(
    `INSERT INTO exercise (id, user_id, title, primary_muscle, secondary_muscles, equipment,
       exercise_type, is_full_bodyweight, rank, search_terms, aka, thumbnail_key, retired_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'weight_reps', 0, ?, ?, ?, NULL, ?, 'now')`,
  );
  for (const s of seeds) {
    insert.run(
      s.id,
      s.user ?? null,
      s.title,
      s.primary ?? "chest",
      JSON.stringify(s.secondary ?? []),
      s.equipment ?? "none",
      s.rank ?? 0,
      s.terms ?? null,
      s.aka ?? null,
      s.retired ?? null,
    );
  }
  return fake.sqlite;
}

const ids = async (filters: Partial<LibraryFilters>, limit = 50) => {
  const sqlite = await setup();
  const { sql, params } = libraryQuery({ ...DEFAULT_LIBRARY_FILTERS, ...filters }, limit);
  return sqlite
    .prepare(sql)
    .all(...params)
    .map((row) => row["id"]);
};

const total = async (filters: Partial<LibraryFilters>) => {
  const sqlite = await setup();
  const { sql, params } = libraryCountQuery({ ...DEFAULT_LIBRARY_FILTERS, ...filters });
  return sqlite.prepare(sql).get(...params)?.["total"];
};

describe("library query", () => {
  it("lists live exercises A-Z, case-insensitively, with id as the tie-break", async () => {
    expect(await ids({})).toEqual(["a5", "a6", "a1", "a2", "c1", "a4", "a3"]);
  });

  it("orders Popular by rank, then title", async () => {
    expect(await ids({ sort: "popular" })).toEqual(["a4", "a1", "a3", "a2", "a6", "a5", "c1"]);
  });

  it("AND-s search words over title, aka and search terms", async () => {
    expect(await ids({ search: "bench" })).toEqual(["a1", "a3", "a2", "c1"]);
    expect(await ids({ search: "bench press" })).toEqual(["a1", "a2"]);
    expect(await ids({ search: "flat" })).toEqual(["a1"]);
    expect(await ids({ search: "back squat" })).toEqual(["a4"]);
    expect(await ids({ search: "PECS press" })).toEqual(["a1"]);
    expect(await ids({ search: "nothing here" })).toEqual([]);
    expect(await ids({ search: "   " })).toEqual(await ids({}));
  });

  it("ranks titles that start with the search first, then rank, title, id", async () => {
    // Only a1 starts with "bench"; the rest follow by rank.
    expect(await ids({ search: "bench", sort: "popular" })).toEqual(["a1", "a3", "a2", "c1"]);
    // A search overrides the chosen sort.
    expect(await ids({ search: "bench", sort: "az" })).toEqual(
      await ids({ search: "bench", sort: "popular" }),
    );
  });

  it("takes %, _ and backslash literally", async () => {
    expect(await ids({ search: "100%" })).toEqual(["a5"]);
    expect(await ids({ search: "effort_row" })).toEqual(["a5"]);
    expect(await ids({ search: "t_row" })).toEqual(["a5"]);
    expect(await ids({ search: "100_" })).toEqual([]);
    expect(await ids({ search: "%" })).toEqual(["a5"]);
    expect(await ids({ search: "\\" })).toEqual([]);
  });

  it("never lets a value leave its placeholder", async () => {
    expect(await ids({ search: "x' OR '1'='1" })).toEqual([]);
    const { sql } = libraryQuery(
      { ...DEFAULT_LIBRARY_FILTERS, search: "'; DROP TABLE exercise;--" },
      5,
    );
    expect(sql).not.toContain("DROP");
  });

  it("filters by primary muscle (OR within the facet)", async () => {
    expect(await ids({ muscles: ["chest"] })).toEqual(["a1", "a2", "c1"]);
    expect(await ids({ muscles: ["triceps", "quadriceps"] })).toEqual(["a4", "a3"]);
  });

  it("includes secondary muscles when asked", async () => {
    expect(await ids({ muscles: ["triceps"], includeSecondary: true })).toEqual(["a1", "a3"]);
    expect(await ids({ muscles: ["triceps"], includeSecondary: false })).toEqual(["a3"]);
    expect(await ids({ muscles: ["glutes", "shoulders"], includeSecondary: true })).toEqual([
      "a1",
      "a2",
      "a4",
    ]);
  });

  it("filters by equipment", async () => {
    expect(await ids({ equipment: ["barbell"] })).toEqual(["a1", "c1", "a4"]);
    expect(await ids({ equipment: ["barbell", "other"] })).toEqual(["a6", "a1", "c1", "a4"]);
  });

  it("combines facets with AND", async () => {
    expect(await ids({ muscles: ["chest"], equipment: ["barbell"], search: "bench" })).toEqual([
      "a1",
      "c1",
    ]);
    expect(
      await ids({ muscles: ["triceps"], includeSecondary: true, equipment: ["barbell"] }),
    ).toEqual(["a1"]);
    expect(await ids({ muscles: ["chest"], equipment: ["machine"] })).toEqual([]);
  });

  it("shows Custom and archived exercises", async () => {
    expect(await ids({ show: "custom" })).toEqual(["c1"]);
    expect(await ids({ show: "archived" })).toEqual(["c2"]);
    expect(await ids({ show: "archived", search: "custom" })).toEqual(["c2"]);
    expect(await ids({ show: "custom", muscles: ["biceps"] })).toEqual([]);
  });

  it("bounds the window", async () => {
    expect(await ids({}, 3)).toEqual(["a5", "a6", "a1"]);
  });

  it("counts what the list would hold without the window", async () => {
    expect(await total({})).toBe(7);
    expect(await total({ search: "bench", muscles: ["chest"] })).toBe(3);
    expect(await total({ muscles: ["triceps"], includeSecondary: true })).toBe(2);
    expect(await total({ show: "archived" })).toBe(1);
  });

  it("reports whether a facet filter is set", () => {
    expect(hasActiveFilters(DEFAULT_LIBRARY_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_LIBRARY_FILTERS, search: "x" })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_LIBRARY_FILTERS, muscles: ["chest"] })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_LIBRARY_FILTERS, equipment: ["none"] })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_LIBRARY_FILTERS, show: "custom" })).toBe(true);
  });
});
