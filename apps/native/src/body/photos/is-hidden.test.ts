import { describe, expect, it } from "vitest";
import { isHidden } from "./is-hidden";

describe("private photo visibility", () => {
  it("requires an explicit reveal while hiding is on", () => {
    expect(isHidden(true, false)).toBe(true);
    expect(isHidden(true, true)).toBe(false);
    expect(isHidden(false, false)).toBe(false);
    expect(isHidden(false, true)).toBe(false);
  });
});
