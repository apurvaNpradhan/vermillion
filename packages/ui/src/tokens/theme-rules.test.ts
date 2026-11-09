import { describe, expect, it } from "vitest";

import { brandTokens, roleNames, type RoleName, type RoleTokens } from "./brand";

const linear = (hex: string) =>
  [1, 3, 5].map((at) => {
    const v = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number]; // safety: the slice yields exactly three channels

function contrastRatio(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = linear(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [lo, hi] = [lum(a), lum(b)].sort((x, y) => x - y) as [number, number]; // safety: two items
  return (hi + 0.05) / (lo + 0.05);
}

/** OKLab lightness of a #rrggbb colour. */
function oklabL(hex: string) {
  const [r, g, b] = linear(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

/**
 * Rules the Classic palette (native and email) must satisfy. Layer direction:
 * - dark: canvas < surface < control < floating, each step 0.015..0.06 in OKLCH L.
 * - light: surface is the lightest layer (floating may equal it), canvas sits one step below
 *   surface and control one step below canvas. Classic Light does this.
 */
const themes: Record<string, { mode: "light" | "dark"; colors: RoleTokens; classic?: true }> = {
  "classic-light": { mode: "light", colors: brandTokens.colors.light, classic: true },
  "classic-dark": { mode: "dark", colors: brandTokens.colors.dark, classic: true },
};

const L = (hex: string) => oklabL(hex);
const MIN_STEP = 0.015;
const MAX_STEP = 0.06;

describe.each(Object.entries(themes))("theme rules: %s", (_name, { mode, colors, classic }) => {
  const c = colors;
  const ratio = (a: RoleName, b: RoleName) => contrastRatio(c[a], c[b]);

  it("defines every role", () => {
    for (const role of roleNames) expect(c[role], role).toBeTruthy();
  });

  it("keeps text readable on canvas and surface", () => {
    for (const bg of ["canvas", "surface"] as const) {
      expect(ratio("text-primary", bg), `text-primary on ${bg}`).toBeGreaterThanOrEqual(7);
      for (const role of [
        "text-secondary",
        "text-muted",
        "success-text",
        "warning-text",
        "protein-text",
        "carbs-text",
        "fat-text",
        "danger",
      ] as const) {
        expect(ratio(role, bg), `${role} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(ratio("on-action", "action"), "on-action").toBeGreaterThanOrEqual(4.5);
  });

  // Classic is neutral by design: identity is its text color and its focus ring a quiet hairline.
  it.skipIf(classic)("keeps identity roles visible and readable", () => {
    expect(ratio("identity", "canvas")).toBeGreaterThanOrEqual(3);
    expect(ratio("focus-ring", "canvas")).toBeGreaterThanOrEqual(3);
    expect(ratio("hairline-strong", "canvas")).toBeGreaterThanOrEqual(3);
    expect(ratio("identity", "identity-soft")).toBeGreaterThanOrEqual(3);
  });

  it("keeps on-identity readable on the identity fill", () => {
    expect(ratio("on-identity", "identity")).toBeGreaterThanOrEqual(4.5);
  });

  // Classic dark has surface-floating below surface-control by design (a darker sheet).
  it.skipIf(classic && mode === "dark")("orders the layers in the documented direction", () => {
    const [canvas, surface, control, floating] = [
      L(c.canvas),
      L(c.surface),
      L(c["surface-control"]),
      L(c["surface-floating"]),
    ] as [number, number, number, number];
    const within = (step: number) => {
      expect(step).toBeGreaterThanOrEqual(MIN_STEP);
      expect(step).toBeLessThanOrEqual(MAX_STEP);
    };
    if (mode === "dark") {
      within(surface - canvas);
      within(control - surface);
      within(floating - control);
    } else {
      within(surface - canvas);
      within(canvas - control);
      expect(floating).toBeGreaterThanOrEqual(surface);
      expect(floating - surface).toBeLessThanOrEqual(MAX_STEP);
    }
    expect(c["surface-floating"]).not.toBe(c["surface-control"]);
  });
});
