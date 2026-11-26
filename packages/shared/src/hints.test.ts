import { describe, expect, it } from "vitest";

import { DISMISSED_HINTS_MAX, dismissHint, isHintVisible, resetHints } from "./hints";

describe("hints", () => {
  it("shows a hint until its id is dismissed", () => {
    expect(isHintVisible([], "set-row")).toBe(true);
    expect(isHintVisible(["train-strip"], "set-row")).toBe(true);
    expect(isHintVisible(["set-row"], "set-row")).toBe(false);
  });

  it("adds an id once and saves nothing when it is already there", () => {
    expect(dismissHint([], "plan-weeks")).toEqual(["plan-weeks"]);
    expect(dismissHint(["plan-weeks"], "train-strip")).toEqual(["plan-weeks", "train-strip"]);
    expect(dismissHint(["plan-weeks"], "plan-weeks")).toBeNull();
  });

  it("keeps at most the stored limit, dropping the oldest", () => {
    const full = Array.from({ length: DISMISSED_HINTS_MAX }, (_, index) => `other-${index}`);
    const next = dismissHint(full, "set-row");
    expect(next).toHaveLength(DISMISSED_HINTS_MAX);
    expect(next?.at(-1)).toBe("set-row");
    expect(next?.[0]).toBe("other-1");
  });

  it("resets only the three hint ids", () => {
    expect(resetHints(["plan-weeks", "tour", "set-row", "train-strip"])).toEqual(["tour"]);
    expect(resetHints(["tour"])).toBeNull();
    expect(resetHints([])).toBeNull();
  });
});
