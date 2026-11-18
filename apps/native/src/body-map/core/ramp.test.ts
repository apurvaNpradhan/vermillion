import { describe, expect, it } from "vitest";

import { nativeColors, nativeVariantNames } from "@workspace/ui/tokens/brand";

import { contrastBetween, intensityTints, MIN_RAMP_CONTRAST, mixHex, rampFloor } from "./ramp";

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

describe("contrastBetween", () => {
  it("is the WCAG ratio", () => {
    expect(contrastBetween("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastBetween("#777777", "#777777")).toBe(1);
  });
});

describe("the ramp in every Nord variant", () => {
  const groups = ["chest", "lats", "biceps"] as const;
  it.each(nativeVariantNames)(
    "keeps every trained region 3:1 from the silhouette: %s",
    (variant) => {
      const colors = nativeColors[variant];
      const silhouette = colors["surface-control"];
      // The faintest muscle that still has sets, up to the most worked one.
      const tints = intensityTints(
        { chest: 0.01, lats: 0.5, biceps: 1 },
        silhouette,
        colors.identity,
      );
      for (const group of groups) {
        const tint = tints[group];
        expect(tint, group).toBeDefined();
        expect(
          contrastBetween(tint ?? silhouette, silhouette),
          `${variant} ${group}`,
        ).toBeGreaterThanOrEqual(MIN_RAMP_CONTRAST);
      }
      expect(tints.biceps).toBe(colors.identity.toLowerCase());
    },
  );
  it.each(nativeVariantNames)("steps up from the first tint to the accent: %s", (variant) => {
    const colors = nativeColors[variant];
    const floor = rampFloor(colors["surface-control"], colors.identity);
    expect(floor).toBeGreaterThan(0);
    expect(floor).toBeLessThan(1);
    const tints = intensityTints(
      { chest: 0.2, lats: 0.6 },
      colors["surface-control"],
      colors.identity,
    );
    expect(tints.chest).not.toBe(tints.lats);
  });
});
