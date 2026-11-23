import { readFileSync } from "node:fs";

import { contrastRatio } from "@workspace/ui/tokens/mix";
import { describe, expect, it } from "vitest";

import { themeCss, webColors } from "./theme.ts";

const AA = 4.5;

describe.each(["light", "dark"] as const)("site colours (%s)", (scheme) => {
  const c = webColors(scheme);
  const grounds = { canvas: c.canvas, surface: c.surface, control: c.control };

  it.each(Object.entries(grounds))("text reads on the %s", (_name, ground) => {
    for (const text of [c.ink, c.secondary, c.muted, c["accent-text"], c.danger]) {
      expect(contrastRatio(text, ground)).toBeGreaterThanOrEqual(AA);
    }
  });

  it("labels read on every accent fill state", () => {
    for (const fill of [c.accent, c["accent-hover"], c["accent-pressed"]]) {
      expect(contrastRatio(c["on-accent"], fill)).toBeGreaterThanOrEqual(AA);
    }
  });

  it("the hover link colour reads on the canvas and surface", () => {
    for (const ground of [c.canvas, c.surface]) {
      expect(contrastRatio(c["accent-text-hover"], ground)).toBeGreaterThanOrEqual(AA);
    }
  });
});

describe("styles.css", () => {
  const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

  it("holds no literal colours: they come from palette.ts", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });

  it("is the theme's insertion point", () => {
    expect(css).toContain("/* @sigil-theme */");
    expect(themeCss()).toContain("prefers-color-scheme: dark");
  });
});
