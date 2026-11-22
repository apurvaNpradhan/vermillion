import { describe, expect, it } from "vitest";

import { nativeColors, nativeVariantNames } from "./brand";
import {
  CARD_BACKGROUNDS,
  GLOW_ALPHA,
  PHOTO_SCRIM_ALPHA,
  cardPalette,
  mixHex,
  type CardPaletteKind,
} from "./share-card";

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

const kinds: CardPaletteKind[] = [...CARD_BACKGROUNDS, "sticker"];
const cases = nativeVariantNames.flatMap((appearance) =>
  kinds.map((kind) => ({ appearance, kind, name: `${appearance} ${kind}` })),
);

describe("share card palettes", () => {
  it.each(cases)("keeps all card text AA on $name", ({ appearance, kind }) => {
    const c = cardPalette(appearance, kind);
    for (const role of ["text", "textSecondary", "textMuted"] as const) {
      expect(contrast(c[role], c.ground), `${role} on ground`).toBeGreaterThanOrEqual(4.5);
    }
    // The graphic marks need 3:1.
    expect(contrast(c.accent, c.ground), "accent on ground").toBeGreaterThanOrEqual(3);
  });

  it.each(cases.filter((entry) => entry.kind === "theme"))(
    "keeps text AA under the accent glow on $name",
    ({ appearance }) => {
      const c = cardPalette(appearance, "theme");
      const lit = mixHex(c.ground, c.glow ?? c.ground, GLOW_ALPHA);
      for (const role of ["text", "textSecondary", "textMuted"] as const) {
        expect(contrast(c[role], lit), `${role} on the glow`).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("keeps the thumbnail plate readable behind its letter", () => {
    for (const { appearance, kind } of cases) {
      const c = cardPalette(appearance, kind);
      expect(contrast(c.textSecondary, c.plate), `${appearance} ${kind}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses the fixed palette whatever the appearance for Light, Dark, Photo and Sticker", () => {
    for (const kind of ["light", "dark", "photo", "sticker"] as const) {
      expect(cardPalette("light", kind)).toEqual(cardPalette("dark", kind));
      expect(cardPalette("contrast-dark", kind)).toEqual(cardPalette("dark", kind));
    }
    expect(cardPalette("dark", "light").fill).toBe(nativeColors.light.canvas);
    expect(cardPalette("light", "dark").fill).toBe(nativeColors.dark.canvas);
  });

  it("protects top headings, exercise rows, stats and footer over a white photo", () => {
    // CardCanvas applies this same opacity at every y, including Summary/Muscles headings.
    const c = cardPalette("dark", "photo");
    for (const y of [168, 461, 998, 1752, 1836]) {
      const ground = mixHex("#ffffff", c.scrim ?? c.ground, PHOTO_SCRIM_ALPHA);
      for (const ink of [c.text, c.textSecondary, c.textMuted]) {
        expect(contrast(ink, ground), `text at y=${y}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("blends hex colours", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#102030", "#102030", 0.7)).toBe("#102030");
  });
});
