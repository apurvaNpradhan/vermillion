import { describe, expect, it } from "vitest";

import { intensityTints, mixHex } from "./ramp";

describe("mixHex", () => {
  it("returns the ends and the middle", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
  it("clamps the amount", () => {
    expect(mixHex("#102030", "#ffffff", 2)).toBe("#ffffff");
    expect(mixHex("#102030", "#ffffff", -1)).toBe("#102030");
  });
  it("falls back to the target for a colour it cannot read", () => {
    expect(mixHex("oklch(0.5 0 0)", "#336699", 0.5)).toBe("#336699");
  });
});

describe("intensityTints", () => {
  const tints = intensityTints({ chest: 1, lats: 0.2, biceps: 0 }, "#3b4252", "#88c0d0");
  it("reaches the accent at full intensity", () => {
    expect(tints.chest).toBe("#88c0d0");
  });
  it("starts above the surface so a muscle with sets shows", () => {
    expect(tints.lats).not.toBe("#3b4252");
    expect(tints.lats).not.toBe(tints.chest);
  });
  it("leaves groups with no intensity out", () => {
    expect(tints.biceps).toBeUndefined();
  });
});
