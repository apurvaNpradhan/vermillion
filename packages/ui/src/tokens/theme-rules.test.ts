import { describe, expect, it } from "vitest";

import { nativeColors, nativeVariantNames, roleNames, type RoleName } from "./brand";
import { mixHex, toOklch } from "./mix";

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
 * Rules every native variant must satisfy. Layers: in dark, canvas < surface < control with the
 * floating sheet between surface and control; in light, surface is the lightest layer, canvas
 * sits one step below it and control one step below canvas.
 */
const themes = nativeVariantNames.map((mode) => ({
  mode,
  colors: nativeColors[mode],
  isLight: mode.endsWith("light"),
}));

const L = (hex: string) => oklabL(hex);
const MIN_STEP = 0.015;
const MAX_STEP = 0.08;

describe.each(themes)("theme rules: $mode", ({ colors, isLight }) => {
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

  it("keeps text readable on controls, fields and floating sheets", () => {
    for (const bg of ["surface-control", "surface-floating"] as const) {
      for (const role of ["text-primary", "text-secondary", "text-muted"] as const) {
        expect(ratio(role, bg), `${role} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps the warning label readable on HeroUI's warning fill", () => {
    expect(ratio("on-warning", "warning-text")).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps HeroUI's tinted labels readable in resting and pressed states", () => {
    const pairs = [
      ["accent-soft-text", "action"],
      ["danger-soft-text", "danger"],
      ["success-soft-text", "success"],
    ] as const;
    for (const [label, fill] of pairs) {
      for (const bg of ["canvas", "surface", "surface-control", "surface-floating"] as const) {
        for (const tint of [0.15, 0.2]) {
          expect(
            contrastRatio(c[label], mixHex(c[bg], c[fill], tint)),
            `${label} on ${bg} at ${tint}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("ranks primary text above secondary and secondary above muted", () => {
    expect(ratio("text-primary", "surface")).toBeGreaterThan(ratio("text-secondary", "surface"));
    expect(ratio("text-secondary", "surface")).toBeGreaterThanOrEqual(
      ratio("text-muted", "surface"),
    );
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
    // The active-program badge and selected chips put accent text on the soft fill.
    expect(ratio("identity", "identity-soft")).toBeGreaterThanOrEqual(4.5);
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
    if (isLight) {
      within(surface - canvas);
      within(canvas - control);
      expect(floating).toBe(surface);
    } else {
      within(surface - canvas);
      within(control - surface);
      expect(floating).toBeGreaterThan(surface);
      expect(floating).toBeLessThan(control);
    }
  });
});

describe.each(themes)("Classic identity: $mode", ({ colors: c }) => {
  it("keeps the accent near-neutral and retains functional completion colour", () => {
    expect(toOklch(c.identity).c).toBeLessThan(0.015);
    expect(c.action).toBe(c.identity);
    expect(toOklch(c["set-done"]).c).toBeGreaterThan(0.04);
  });

  it("keeps every chart series visible on the page", () => {
    for (const role of ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"] as const) {
      for (const bg of ["canvas", "surface"] as const) {
        expect(contrastRatio(c[role], c[bg]), `${role} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("keeps surfaces neutral", () => {
    // A tinted neutral: some chroma, never a saturated colour. A light card may sit close to
    // white, so it only needs a trace of the hue.
    const floors = { canvas: 0, surface: 0, "surface-control": 0 } as const;
    // SAFETY: `floors` is a literal object, so its entries are exactly its keys and numbers.
    for (const [role, floor] of Object.entries(floors) as [keyof typeof floors, number][]) {
      const { c: chroma } = toOklch(c[role]);
      expect(chroma, role).toBeGreaterThanOrEqual(floor);
      expect(chroma, role).toBeLessThan(0.05);
    }
  });
});

const contrastPairs = (["light", "dark"] as const).map((scheme) => ({
  name: scheme,
  standard: nativeColors[scheme],
  increased: nativeColors[`contrast-${scheme}`],
}));

describe.each(
  themes
    .values()
    .filter(({ isLight }) => !isLight)
    .toArray(),
)("dark palette: $mode", ({ colors }) => {
  it("uses a near-black canvas", () => {
    expect(contrastRatio(colors.canvas, "#000000")).toBeLessThan(1.1);
  });
});

describe.each(contrastPairs)("increased contrast: $name", ({ standard, increased }) => {
  it("raises text contrast and holds secondary text to 7:1", () => {
    for (const role of ["text-primary", "text-secondary", "text-muted"] as const) {
      expect(contrastRatio(increased[role], increased.surface)).toBeGreaterThan(
        contrastRatio(standard[role], standard.surface),
      );
    }
    for (const bg of ["canvas", "surface"] as const) {
      for (const role of ["text-secondary", "text-muted"] as const) {
        expect(contrastRatio(increased[role], increased[bg])).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it("strengthens both line roles", () => {
    for (const role of ["hairline", "hairline-strong"] as const) {
      expect(contrastRatio(increased[role], increased.surface)).toBeGreaterThan(
        contrastRatio(standard[role], standard.surface),
      );
    }
  });
});

describe("Classic", () => {
  it("uses its original canvas, surface and ink in both schemes", () => {
    expect(nativeColors.light).toMatchObject({
      canvas: "#F4F2ED",
      surface: "#FBFAF7",
      "text-primary": "#191918",
    });
    expect(nativeColors.dark).toMatchObject({
      canvas: "#070707",
      surface: "#121212",
      "text-primary": "#EFEEE9",
    });
  });
});

// Plate labels use a dedicated ink, independent of the surrounding theme.
describe.each(themes)("plate contrast: $mode", ({ colors: c }) => {
  it("keeps every standard plate label readable", () => {
    for (const role of ["plate-red", "plate-blue", "plate-green", "plate-black"] as const) {
      expect(contrastRatio(c[role], c["on-plate-dark"])).toBeGreaterThanOrEqual(4.5);
    }
    for (const role of ["plate-yellow", "plate-white"] as const) {
      expect(contrastRatio(c[role], c["on-plate-light"])).toBeGreaterThanOrEqual(4.5);
    }
  });
});
