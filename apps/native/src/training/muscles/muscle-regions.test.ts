import { TARGET_MUSCLES } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { MUSCLE_REGIONS, regionRows } from "./muscle-regions";

const row = (muscle: "chest" | "lats" | "quadriceps" | "abdominals" | "triceps") => ({
  muscle,
});

describe("regionRows", () => {
  it("groups rows by region in a fixed order and keeps each region's row order", () => {
    const grouped = regionRows([
      row("quadriceps"),
      row("triceps"),
      row("chest"),
      row("lats"),
      row("abdominals"),
    ]);
    expect(grouped.map((region) => region.key)).toEqual(["push", "pull", "legs", "core"]);
    expect(grouped[0]?.rows.map((entry) => entry.muscle)).toEqual(["triceps", "chest"]);
  });

  it("leaves out a region without rows", () => {
    expect(regionRows([row("lats")]).map((region) => region.key)).toEqual(["pull"]);
    expect(regionRows([])).toEqual([]);
  });
});

describe("MUSCLE_REGIONS", () => {
  it("holds every targeted muscle in exactly one region", () => {
    const listed: string[] = MUSCLE_REGIONS.flatMap((region) => [...region.muscles]);
    expect(listed.toSorted()).toEqual([...TARGET_MUSCLES].toSorted());
  });
});
