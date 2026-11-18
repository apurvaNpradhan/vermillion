import { describe, expect, it } from "vitest";

import { POP_SCALE, shouldPop } from "./pop-math";

describe("shouldPop", () => {
  it("does not play on the first render, even when already on", () => {
    expect(shouldPop(null, true)).toBe(false);
    expect(shouldPop(null, false)).toBe(false);
  });

  it("plays when the flag turns on", () => {
    expect(shouldPop(false, true)).toBe(true);
  });

  it("stays quiet when it turns off or does not change", () => {
    expect(shouldPop(true, false)).toBe(false);
    expect(shouldPop(true, true)).toBe(false);
    expect(shouldPop(false, false)).toBe(false);
  });

  it("peaks only a little above rest", () => {
    expect(POP_SCALE).toBeGreaterThan(1);
    expect(POP_SCALE).toBeLessThan(1.25);
  });
});
