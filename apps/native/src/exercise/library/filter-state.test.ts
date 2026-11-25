import { DEFAULT_LIBRARY_FILTERS } from "@workspace/sync";
import { describe, expect, it } from "vitest";

import { chunked, toggled, withoutFacets } from "./filter-state";

describe("filter state", () => {
  it("toggles a value in and out, keeping the order", () => {
    expect(toggled(["chest"], "lats")).toEqual(["chest", "lats"]);
    expect(toggled(["chest", "lats"], "chest")).toEqual(["lats"]);
    expect(toggled([], "chest")).toEqual(["chest"]);
  });

  it("clears the facets and keeps the search and picker order", () => {
    const cleared = withoutFacets({
      search: "bench",
      muscles: ["chest"],
      includeSecondary: true,
      primaryDetail: "upper_chest",
      pinnedOnly: true,
      pinnedFirst: true,
      equipment: ["barbell"],
      lacking: ["cable"],
      show: "custom",
      sort: "popular",
    });
    expect(cleared).toEqual({
      ...DEFAULT_LIBRARY_FILTERS,
      search: "bench",
      pinnedFirst: true,
    });
  });

  it("chunks into rows, the last one possibly short", () => {
    expect(chunked([1, 2, 3, 4, 5], 3)).toEqual([
      [1, 2, 3],
      [4, 5],
    ]);
    expect(chunked([], 3)).toEqual([]);
  });
});
