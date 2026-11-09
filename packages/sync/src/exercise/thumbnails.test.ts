import { describe, expect, it } from "vitest";

import { createFakeDatabase } from "../platform/fake-database";
import { CATALOG_THUMBNAIL_SQL } from "./thumbnails";

describe("catalog thumbnail keys", () => {
  it("lists live catalog thumbnails once, skipping Custom, retired and empty ones", () => {
    const fake = createFakeDatabase();
    const insert = fake.sqlite.prepare(
      `INSERT INTO exercise (id, user_id, title, primary_muscle, secondary_muscles, equipment,
         exercise_type, is_full_bodyweight, rank, thumbnail_key, retired_at, created_at)
       VALUES (?, ?, ?, 'chest', '[]', 'none', 'weight_reps', 0, 0, ?, ?, 'now')`,
    );
    insert.run("a", null, "A", "thumbs/b.jpg", null);
    insert.run("b", null, "B", "thumbs/a.jpg", null);
    insert.run("c", null, "C", "thumbs/a.jpg", null);
    insert.run("d", null, "D", null, null);
    insert.run("e", null, "E", "", null);
    insert.run("f", null, "F", "thumbs/retired.jpg", "2026-01-01");
    insert.run("g", "u1", "G", "thumbs/custom.jpg", null);
    const keys = fake.sqlite
      .prepare(CATALOG_THUMBNAIL_SQL)
      .all()
      .map((row) => row["thumbnail_key"]);
    expect(keys).toEqual(["thumbs/a.jpg", "thumbs/b.jpg"]);
  });
});
