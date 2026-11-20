import { describe, expect, it } from "vitest";

import { createFakeDatabase } from "../platform/fake-database";
import { parseMuscleDetails } from "./details";
import { exerciseDetailQuery } from "./detail";
import { LIBRARY_ROW_COLUMNS } from "./library-query";

describe("parseMuscleDetails", () => {
  it("reads the JSON text of a column", () => {
    expect(parseMuscleDetails('["side_delts","rear_delts"]')).toEqual(["side_delts", "rear_delts"]);
    expect(parseMuscleDetails("[]")).toEqual([]);
    expect(parseMuscleDetails(null)).toEqual([]);
  });

  it("drops a slug this release does not know and keeps the rest", () => {
    expect(parseMuscleDetails('["side_delts","a_later_detail","tfl"]')).toEqual([
      "side_delts",
      "tfl",
    ]);
  });

  it("reads malformed text as no details instead of failing the row", () => {
    expect(parseMuscleDetails("not json")).toEqual([]);
    expect(parseMuscleDetails('{"a":1}')).toEqual([]);
    expect(parseMuscleDetails("[1,2]")).toEqual([]);
  });
});

describe("the detail columns of the local queries", () => {
  it("are read by the detail lookup and the list, as the text the stream delivers", () => {
    const fake = createFakeDatabase();
    fake.sqlite
      .prepare(
        `INSERT INTO exercise (id, user_id, title, primary_muscle, secondary_muscles,
           primary_detail, secondary_detail, equipment, exercise_type, is_full_bodyweight, rank,
           created_at)
         VALUES ('a', NULL, 'Lateral raise', 'shoulders', '["chest"]', '["side_delts","new_one"]',
           '[]', 'cable', 'weight_reps', 0, 1, 'now')`,
      )
      .run();
    const { sql, params } = exerciseDetailQuery("a");
    const [row] = fake.sqlite.prepare(sql).all(...params);
    expect(parseMuscleDetails(String(row?.["primary_detail"]))).toEqual(["side_delts"]);
    expect(parseMuscleDetails(String(row?.["secondary_detail"]))).toEqual([]);
    const [listed] = fake.sqlite.prepare(`SELECT ${LIBRARY_ROW_COLUMNS} FROM exercise`).all();
    expect(listed?.["primary_detail"]).toBe('["side_delts","new_one"]');
  });
});
