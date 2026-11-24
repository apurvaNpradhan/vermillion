import { describe, expect, it } from "vitest";

import { nativeColors, nativeVariantNames, roleNames, type RoleName } from "./brand";
import { contrastRatio, mixHex } from "./mix";
import { DEFAULT_ACCENT_ID, accentIds, themeVariantNames } from "./theme-variants";

/** Rules every native variant (each accent in each mode) must satisfy. */
const themes = nativeVariantNames.map((mode) => ({
  isMono: mode.startsWith("mono"),
  mode,
  colors: nativeColors[mode],
  isLight: mode === "light" || mode.endsWith("-light"),
}));

/** `#rrggbb` has no chroma when its three channels are equal. */
const isNeutral = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((at) => hex.slice(at, at + 2));
  return r === g && g === b;
};

describe.each(themes)("theme rules: $mode", ({ colors, isLight, isMono }) => {
  const c = colors;
  const ratio = (a: RoleName, b: RoleName) => contrastRatio(c[a], c[b]);

  it("defines every role", () => {
    for (const role of roleNames) expect(c[role], role).toBeTruthy();
  });

  it("uses true AMOLED black or pure white for the canvas, with neutral surfaces", () => {
    expect(c.canvas).toBe(isLight ? "#FFFFFF" : "#000000");
    for (const role of [
      "canvas",
      "surface",
      "surface-control",
      "surface-floating",
      "hairline",
      "hairline-strong",
      "text-primary",
      "text-secondary",
      "text-muted",
      "text-disabled",
    ] as const) {
      expect(isNeutral(c[role]), role).toBe(true);
    }
  });

  it("keeps text readable on canvas and surface", () => {
    for (const bg of ["canvas", "surface"] as const) {
      expect(ratio("text-primary", bg), `text-primary on ${bg}`).toBeGreaterThanOrEqual(7);
      for (const role of [
        "text-secondary",
        "text-muted",
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
    expect(ratio("on-danger", "danger"), "on-danger").toBeGreaterThanOrEqual(4.5);
  });

  it("keeps text readable on controls, fields and floating sheets", () => {
    for (const bg of ["surface-control", "surface-floating"] as const) {
      for (const role of ["text-primary", "text-secondary", "text-muted"] as const) {
        expect(ratio(role, bg), `${role} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps the segmented control's labels readable resting and pressed", () => {
    // platform/ui/segmented-control.tsx: labels stay opaque; the pressed segment is filled with
    // `surface` at 60% over the `control` track. Unselected labels are `text-muted`, the selected
    // one `text-primary` on the `surface` pill.
    const pressed = mixHex(c["surface-control"], c.surface, 0.6);
    expect(ratio("text-muted", "surface-control"), "muted on track").toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(c["text-muted"], pressed), "muted on pressed fill").toBeGreaterThanOrEqual(
      4.5,
    );
    expect(ratio("text-primary", "surface"), "selected label").toBeGreaterThanOrEqual(4.5);
  });

  it("keeps HeroUI's tinted labels readable in resting and pressed states", () => {
    const pairs = [
      ["accent-soft-text", "action"],
      ["danger-soft-text", "danger"],
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

  it("keeps a completed set row (the fill at 15% to 22%) readable", () => {
    // Completed rows tint the whole row with the fill; the numbers stay at full contrast.
    for (const [ground, alpha] of [
      [c.canvas, 0.15],
      [c.surface, 0.15],
      [c.canvas, isLight && !isMono ? 0.22 : 0.16],
      [c.surface, isLight && !isMono ? 0.22 : 0.16],
    ] as const) {
      const row = mixHex(ground, c.action, alpha);
      for (const role of [
        "text-primary",
        "text-secondary",
        "text-muted",
        "set-warmup",
        "set-drop",
        "set-failure",
        "set-top",
        "set-backoff",
        "set-myo",
      ] as const) {
        expect(contrastRatio(c[role], row), `${role} on a completed row`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
  });

  it("keeps the accent text tone readable and the fill's label readable", () => {
    for (const bg of ["canvas", "surface"] as const) {
      expect(ratio("accent-text", bg), `accent-text on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio("on-action", "action"), "on-action on the fill").toBeGreaterThanOrEqual(4.5);
    expect(c["on-action"]).toBe(c["on-action"].toUpperCase());
  });

  it("keeps the focus ring visible", () => {
    expect(ratio("focus-ring", "canvas")).toBeGreaterThanOrEqual(3);
    expect(ratio("on-action", "action-hover")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("on-action", "action-pressed")).toBeGreaterThanOrEqual(4.5);
  });

  it("makes the primary chart series the accent", () => {
    expect(c.chart).toBe(c.action);
    expect(c["chart-1"]).toBe(c.action);
  });

  it("keeps every chart series visible on the page", () => {
    for (const role of ["chart-2", "chart-3", "chart-4", "chart-5"] as const) {
      for (const bg of ["canvas", "surface"] as const) {
        expect(ratio(role, bg), `${role} on ${bg}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("orders the layers in the documented direction", () => {
    const lum = (hex: string) => Number.parseInt(hex.slice(1, 3), 16);
    if (isLight) {
      expect(lum(c.surface)).toBeLessThan(lum(c.canvas));
      expect(lum(c["surface-control"])).toBeLessThan(lum(c.surface));
      expect(c["surface-floating"]).toBe(c.canvas);
    } else {
      expect(lum(c.surface)).toBeGreaterThan(lum(c.canvas));
      expect(lum(c["surface-floating"])).toBeGreaterThan(lum(c.surface));
      expect(lum(c["surface-control"])).toBeGreaterThan(lum(c["surface-floating"]));
    }
  });
});

describe("accents", () => {
  const FILLS = {
    lime: "#C6F135",
    gold: "#FFC83D",
    ember: "#FF6B3D",
    rose: "#FF5C8A",
    ice: "#9BE6FF",
  } as const;
  const LIGHT_TEXT = {
    lime: "#4A6A00",
    gold: "#8A5A00",
    ember: "#B33A12",
    rose: "#B8124A",
    ice: "#0B6A8A",
  } as const;

  it("offers Lime, Gold, Ember, Rose, Ice and Mono, in that order, with Lime the default", () => {
    expect(accentIds).toEqual(["lime", "gold", "ember", "rose", "ice", "mono"]);
    expect(DEFAULT_ACCENT_ID).toBe("lime");
  });

  it("defines one variant per accent and mode, and the built-ins are Lime", () => {
    expect(themeVariantNames).toEqual(
      accentIds.flatMap((accent) => [`${accent}-light`, `${accent}-dark`]),
    );
    expect(nativeColors.light).toEqual(nativeColors["lime-light"]);
    expect(nativeColors.dark).toEqual(nativeColors["lime-dark"]);
  });

  it.each(Object.keys(FILLS) as (keyof typeof FILLS)[])(
    "keeps %s's fill bright in both modes and darkens only its light text",
    (accent) => {
      for (const scheme of ["light", "dark"] as const) {
        const c = nativeColors[`${accent}-${scheme}`];
        expect(c.action, scheme).toBe(FILLS[accent]);
        expect(c.chart, scheme).toBe(FILLS[accent]);
        expect(c["on-action"], scheme).toBe("#0A0A0A");
      }
      expect(nativeColors[`${accent}-dark`]["accent-text"]).toBe(FILLS[accent]);
      expect(nativeColors[`${accent}-light`]["accent-text"]).toBe(LIGHT_TEXT[accent]);
    },
  );

  it("makes Mono white on dark and black on light, text equal to fill", () => {
    expect(nativeColors["mono-dark"].action).toBe("#FFFFFF");
    expect(nativeColors["mono-dark"]["accent-text"]).toBe("#FFFFFF");
    expect(nativeColors["mono-dark"]["on-action"]).toBe("#000000");
    expect(nativeColors["mono-light"].action).toBe("#000000");
    expect(nativeColors["mono-light"]["accent-text"]).toBe("#000000");
    expect(nativeColors["mono-light"]["on-action"]).toBe("#FFFFFF");
  });

  it("leaves the ground, surfaces and ink the same under every accent", () => {
    for (const scheme of ["light", "dark"] as const) {
      const base = nativeColors[`lime-${scheme}`];
      for (const accent of accentIds) {
        const c = nativeColors[`${accent}-${scheme}`];
        for (const role of ["canvas", "surface", "text-primary", "danger"] as const) {
          expect(c[role], `${accent} ${scheme} ${role}`).toBe(base[role]);
        }
      }
    }
  });
});

describe("retired roles", () => {
  it("has no ember, brand-detail, set-done, success, warning or macro roles", () => {
    const names: readonly string[] = roleNames;
    for (const retired of [
      "identity",
      "identity-soft",
      "on-identity",
      "brand-detail",
      "set-done",
      "set-done-soft",
      "success",
      "warning",
      "warning-text",
      "protein",
      "carbs",
      "fat",
    ]) {
      expect(names, retired).not.toContain(retired);
    }
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
