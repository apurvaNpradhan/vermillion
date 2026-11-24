import { describe, expect, it } from "vitest";

import { DONE_TINT_ALPHA, withAlpha } from "./row-tint";

describe("withAlpha", () => {
  it("appends the alpha channel to a six-digit hex colour", () => {
    expect(withAlpha("#C6F135", DONE_TINT_ALPHA)).toBe("#C6F13526");
    expect(withAlpha("#000000", 0)).toBe("#00000000");
    expect(withAlpha("#FFFFFF", 1)).toBe("#FFFFFFff");
  });

  it("clamps the alpha", () => {
    expect(withAlpha("#123456", 2)).toBe("#123456ff");
    expect(withAlpha("#123456", -1)).toBe("#12345600");
  });

  it("leaves anything else alone", () => {
    expect(withAlpha(undefined, 0.5)).toBeUndefined();
    expect(withAlpha("rgb(0 0 0)", 0.5)).toBe("rgb(0 0 0)");
  });
});
