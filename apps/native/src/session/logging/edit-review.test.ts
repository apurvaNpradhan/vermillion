import { describe, expect, it } from "vitest";

import { reviewsEditedSet } from "./edit-review";

describe("reviewsEditedSet", () => {
  it("reviews every edit in a finished or backfilled Session", () => {
    expect(reviewsEditedSet({ sessionFinished: true, setTicked: false })).toBe(true);
    expect(reviewsEditedSet({ sessionFinished: true, setTicked: true })).toBe(true);
  });

  it("reviews an edit to a ticked set in a live Session: its tick was already checked", () => {
    expect(reviewsEditedSet({ sessionFinished: false, setTicked: true })).toBe(true);
  });

  it("leaves an unticked set in a live Session to the check on tick", () => {
    expect(reviewsEditedSet({ sessionFinished: false, setTicked: false })).toBe(false);
  });
});
