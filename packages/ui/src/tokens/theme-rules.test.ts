import { describe, expect, it } from "vitest";

import { accentNames, brandThemes, roleNames, themeModes, type RoleName } from "./brand";

const linear = (hex: string) =>
  [1, 3, 5].map((at) => {
    const v = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number]; // SAFETY: the slice yields exactly three channels

function contrastRatio(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = linear(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [lo, hi] = [lum(a), lum(b)].sort((x, y) => x - y) as [number, number]; // SAFETY: two items
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
 * Rules every accent and mode must satisfy. Layers: in dark and black, canvas < surface < control
 * with the floating sheet between canvas and control; in light, surface is the lightest layer,
 * canvas sits one step below it and control one step below canvas.
 */
const themes = accentNames.flatMap((accent) =>
  themeModes.map((mode) => ({
    name: `${accent}-${mode}`,
    mode,
    colors: brandThemes[accent][mode],
  })),
);

const L = (hex: string) => oklabL(hex);
const MIN_STEP = 0.015;
const MAX_STEP = 0.08;
// Pure black sits further below its first surface than any grey canvas does.
const MAX_BLACK_STEP = 0.2;

describe.each(themes)("theme rules: $name", ({ mode, colors }) => {
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
        "set-warmup",
        "set-drop",
        "set-failure",
        "set-top",
        "set-backoff",
        "set-myo",
      ] as const) {
        expect(ratio(role, bg), `${role} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(ratio("on-action", "action"), "on-action").toBeGreaterThanOrEqual(4.5);
  });

  it("keeps completed-set text, badges and checks readable", () => {
    for (const role of [
      "set-done-soft-foreground",
      "text-muted",
      "text-primary",
      "set-warmup",
      "set-drop",
      "set-failure",
      "set-top",
      "set-backoff",
      "set-myo",
    ] as const) {
      expect(ratio(role, "set-done-soft"), role).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio("on-set-done", "set-done")).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the accent visible as a mark and readable as text", () => {
    for (const bg of ["canvas", "surface"] as const) {
      expect(ratio("identity", bg), `identity on ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio("chart", bg), `chart on ${bg}`).toBeGreaterThanOrEqual(3);
    }
    expect(ratio("focus-ring", "canvas")).toBeGreaterThanOrEqual(3);
    expect(ratio("identity", "identity-soft")).toBeGreaterThanOrEqual(3);
    expect(ratio("text-primary", "identity-soft")).toBeGreaterThanOrEqual(7);
  });

  it("keeps on-identity readable on the identity fill", () => {
    expect(ratio("on-identity", "identity")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("on-action", "action-hover")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("on-action", "action-pressed")).toBeGreaterThanOrEqual(4.5);
  });

  it("orders the layers in the documented direction", () => {
    const [canvas, surface, control, floating] = [
      L(c.canvas),
      L(c.surface),
      L(c["surface-control"]),
      L(c["surface-floating"]),
    ] as [number, number, number, number]; // SAFETY: four items
    const within = (step: number) => {
      expect(step).toBeGreaterThanOrEqual(MIN_STEP);
      expect(step).toBeLessThanOrEqual(MAX_STEP);
    };
    if (mode === "light") {
      within(surface - canvas);
      within(canvas - control);
      expect(floating).toBe(surface);
    } else {
      if (mode === "black") expect(surface - canvas).toBeLessThanOrEqual(MAX_BLACK_STEP);
      else within(surface - canvas);
      within(control - surface);
      expect(floating).toBeGreaterThan(surface);
      expect(floating).toBeLessThan(control);
    }
  });
});

// Plate labels use a dedicated ink, independent of the surrounding theme.
describe.each(themes)("plate contrast: $name", ({ colors: c }) => {
  it("keeps every standard plate label readable", () => {
    for (const role of ["plate-red", "plate-blue", "plate-green", "plate-black"] as const) {
      expect(contrastRatio(c[role], c["on-plate-dark"])).toBeGreaterThanOrEqual(4.5);
    }
    for (const role of ["plate-yellow", "plate-white"] as const) {
      expect(contrastRatio(c[role], c["on-plate-light"])).toBeGreaterThanOrEqual(4.5);
    }
  });
});
