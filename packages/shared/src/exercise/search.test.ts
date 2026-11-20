import { describe, expect, it } from "vitest";

import { detailLikePattern, detailsMatching } from "./search";

describe("detailsMatching", () => {
  it("finds details by alias or by name, case-insensitively", () => {
    expect(detailsMatching("rear")).toEqual(["rear_delts"]);
    expect(detailsMatching("Posterior")).toEqual(["rear_delts"]);
    expect(detailsMatching("iliopsoas")).toEqual(["hip_flexors"]);
    expect(detailsMatching("wrist")).toEqual(["wrist_flexors", "wrist_extensors"]);
  });

  it("matches a word anywhere in a name", () => {
    expect(detailsMatching("delt")).toEqual(["front_delts", "side_delts", "rear_delts"]);
  });

  it("takes an escaped search token", () => {
    expect(detailsMatching("rear\\_delts")).toEqual([]);
    expect(detailsMatching("%")).toEqual([]);
  });

  it("finds nothing for an empty or unrelated word", () => {
    expect(detailsMatching("")).toEqual([]);
    expect(detailsMatching("squat")).toEqual([]);
  });
});

describe("detailLikePattern", () => {
  it("quotes the slug and escapes LIKE wildcards", () => {
    expect(detailLikePattern("rear_delts")).toBe('%"rear\\_delts"%');
  });
});
