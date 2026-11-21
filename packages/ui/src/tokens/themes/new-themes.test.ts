import { describe, expect, it } from "vitest";

import { themeIds, themeVariants } from "../theme-variants";

const linear = (hex: string) =>
  [1, 3, 5].map((at) => {
    const v = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number]; // SAFETY: the slice yields exactly three channels

function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = linear(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [lo, hi] = [lum(a), lum(b)].sort((x, y) => x - y) as [number, number]; // SAFETY: two items
  return (hi + 0.05) / (lo + 0.05);
}

describe("theme list", () => {
  it("offers Basalt, Graphite, Oxide, Slate, Mulberry in that order, without Olive", () => {
    expect(themeIds).toEqual(["nord", "graphite", "oxide", "slate", "mulberry"]);
  });
});

describe.each(["nord", "graphite", "oxide"] as const)("%s accent", (id) => {
  for (const scheme of ["light", "dark"] as const) {
    const c = themeVariants[`${id}-${scheme}`];
    it(`${scheme}: on-action text is at least 4.5:1 on the filled button`, () => {
      expect(contrast(c["on-action"], c.action)).toBeGreaterThanOrEqual(4.5);
    });
    it(`${scheme}: the accent mark is at least 3:1 on the canvas and surface`, () => {
      expect(contrast(c.identity, c.canvas)).toBeGreaterThanOrEqual(3);
      expect(contrast(c.identity, c.surface)).toBeGreaterThanOrEqual(3);
    });
  }
});

describe("Basalt moss", () => {
  it("keeps a dark moss button with pale lichen text in dark mode", () => {
    const c = themeVariants["nord-dark"];
    expect(c.action.toLowerCase()).toBe("#2c4231");
    expect(c["on-action"].toLowerCase()).toBe("#cfe3d2");
  });
});
