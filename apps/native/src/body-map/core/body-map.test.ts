import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { MUSCLE_GROUPS } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import {
  BASE_LAYERS,
  GROUP_LAYERS,
  PREFERRED_VIEW,
  allLayerNames,
  type LayerName,
} from "./group-layers";
import { BODY_GROUPS, BODY_VIEWS, UNDRAWN, isBodyGroup } from "./groups";
import { ICON_FRAMING, iconFrame } from "./icon-framing";
import { groupAt, groupBounds } from "./hit-test";
import { HIT_MASKS } from "./hit-masks.generated";
import { SECONDARY_ALPHA, clampIntensity, groupAlphas } from "./intensity";
import { GRID_HEIGHT, GRID_WIDTH, decodeMask, maskCovers } from "./mask";

const assets = join(import.meta.dirname, "../assets/interim");
// Metro's `require` cannot load in vitest, so the bundled table is read as text.
const sources = readFileSync(
  join(import.meta.dirname, "../native/layer-sources.generated.ts"),
  "utf8",
);

describe("group layers", () => {
  it("covers every muscle group: drawn in GROUP_LAYERS or listed as undrawn, never both", () => {
    for (const group of MUSCLE_GROUPS) {
      const drawn = group in GROUP_LAYERS;
      const undrawn = UNDRAWN.some((slug) => slug === group);
      expect(drawn !== undrawn, group).toBe(true);
    }
    expect(Object.keys(GROUP_LAYERS).sort()).toEqual([...BODY_GROUPS].sort());
    expect(BODY_GROUPS).toHaveLength(17);
    expect(MUSCLE_GROUPS.filter(isBodyGroup)).toEqual(BODY_GROUPS);
  });

  it("has an art file, a hit mask and a bundled source for every layer", () => {
    for (const layer of allLayerNames()) {
      expect(existsSync(join(assets, `${layer}.webp`)), `${layer} file`).toBe(true);
      expect(HIT_MASKS[layer], `${layer} mask`).toBeDefined();
      expect(sources, `${layer} source`).toContain(`require("../assets/interim/${layer}.webp")`);
    }
  });

  it("gives every group at least one layer, and every layer to one group only", () => {
    const owners = new Map<string, string>();
    for (const group of BODY_GROUPS) {
      const layers = BODY_VIEWS.flatMap((view) => GROUP_LAYERS[group][view]);
      expect(layers.length, group).toBeGreaterThan(0);
      for (const layer of layers) {
        expect(owners.get(layer), `${layer} owned by two groups`).toBeUndefined();
        owners.set(layer, group);
      }
    }
    expect(Object.values(BASE_LAYERS)).toHaveLength(2);
  });

  it("draws each group in its preferred view", () => {
    for (const group of BODY_GROUPS) {
      expect(GROUP_LAYERS[group][PREFERRED_VIEW[group]].length, group).toBeGreaterThan(0);
      expect(groupBounds(group, PREFERRED_VIEW[group]), group).toBeDefined();
    }
  });
});

/** The centre cell of a layer's mask that is drawn, as a canvas point. */
function pointOn(layer: LayerName) {
  const mask = HIT_MASKS[layer];
  const decoded = decodeMask(mask);
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < mask.h; y++) {
    for (let x = 0; x < mask.w; x++) {
      const point = { x: (mask.x0 + x + 0.5) / GRID_WIDTH, y: (mask.y0 + y + 0.5) / GRID_HEIGHT };
      if (maskCovers(decoded, point.x, point.y)) cells.push(point);
    }
  }
  const middle = cells[Math.floor(cells.length / 2)];
  if (!middle) throw new Error(`${layer} is empty`);
  return middle;
}

describe("hit resolution", () => {
  it("names the group under a point of a view, never a coordinate", () => {
    const chest = pointOn("front_chest");
    expect(groupAt("front", chest.x, chest.y)).toBe("chest");
    const lats = pointOn("back_latissimus_dorsi");
    expect(groupAt("back", lats.x, lats.y)).toBe("lats");
    const calf = pointOn("front_gastrocnemius");
    expect(groupAt("front", calf.x, calf.y)).toBe("calves");
  });

  it("finds nothing on bare body or outside the canvas", () => {
    expect(groupAt("front", 0.01, 0.01)).toBeUndefined();
    expect(groupAt("front", -1, 5)).toBeUndefined();
  });

  it("uses the view it is asked for", () => {
    const lats = pointOn("back_latissimus_dorsi");
    expect(groupAt("front", lats.x, lats.y)).not.toBe("lats");
  });

  it("prefers a highlighted group where drawings overlap", () => {
    let overlaps = 0;
    for (const view of BODY_VIEWS) {
      for (let row = 0; row < GRID_HEIGHT; row++) {
        for (let column = 0; column < GRID_WIDTH; column++) {
          const x = (column + 0.5) / GRID_WIDTH;
          const y = (row + 0.5) / GRID_HEIGHT;
          const covering = BODY_GROUPS.filter((group) =>
            GROUP_LAYERS[group][view].some((layer) => {
              return maskCovers(decodeMask(HIT_MASKS[layer]), x, y);
            }),
          );
          if (covering.length < 2) continue;
          overlaps++;
          for (const group of covering) {
            expect(groupAt(view, x, y, new Set([group]))).toBe(group);
          }
        }
      }
    }
    expect(overlaps).toBeGreaterThan(0);
  });

  it("falls back to the smaller drawing when nothing is highlighted", () => {
    const x = 0.5;
    for (const view of BODY_VIEWS) {
      for (let row = 0; row < GRID_HEIGHT; row++) {
        const y = (row + 0.5) / GRID_HEIGHT;
        const covering = BODY_GROUPS.flatMap((group) =>
          GROUP_LAYERS[group][view].flatMap((layer) => {
            const mask = decodeMask(HIT_MASKS[layer]);
            return maskCovers(mask, x, y) ? [{ group, area: mask.area }] : [];
          }),
        );
        const smallest = covering.toSorted((a, b) => a.area - b.area)[0];
        expect(groupAt(view, x, y)).toBe(smallest?.group);
      }
    }
  });
});

describe("intensity", () => {
  it("clamps to 0..1 and treats a non-number as 0", () => {
    expect(clampIntensity(-3)).toBe(0);
    expect(clampIntensity(0.4)).toBe(0.4);
    expect(clampIntensity(7)).toBe(1);
    expect(clampIntensity(Number.NaN)).toBe(0);
    expect(clampIntensity(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("draws primary in full, secondary lighter, and primary over secondary", () => {
    const alphas = groupAlphas({ primary: ["chest", "cardio"], secondary: ["chest", "triceps"] });
    expect(alphas.get("chest")).toBe(1);
    expect(alphas.get("triceps")).toBe(SECONDARY_ALPHA);
    expect(alphas.size).toBe(2);
  });

  it("lets intensity replace the tints, clamped, and skips groups at 0", () => {
    const alphas = groupAlphas({
      primary: ["chest"],
      intensity: { chest: 0.3, lats: 4, neck: -1, biceps: 0.5 },
    });
    expect(alphas.get("chest")).toBe(0.3);
    expect(alphas.get("lats")).toBe(1);
    expect(alphas.has("neck")).toBe(false);
    expect(alphas.get("biceps")).toBe(0.5);
  });

  it("draws a selected group in full", () => {
    expect(
      groupAlphas({ secondary: ["quadriceps"], selected: ["quadriceps"] }).get("quadriceps"),
    ).toBe(1);
  });
});

describe("group icon framing", () => {
  it("has a tuning entry for every drawn group", () => {
    expect(Object.keys(ICON_FRAMING).sort()).toEqual([...BODY_GROUPS].sort());
  });

  it("frames every group inside its disc: the group's centre sits at the disc's centre", () => {
    for (const group of BODY_GROUPS) {
      const frame = iconFrame(group, 100);
      const bounds = groupBounds(group, PREFERRED_VIEW[group]);
      expect(frame, group).toBeDefined();
      if (!frame || !bounds) continue;
      expect(frame.bodyHeight, group).toBeGreaterThan(100);
      const cx = frame.left + ((bounds.x0 + bounds.x1) / 2) * frame.bodyWidth;
      const cy = frame.top + ((bounds.y0 + bounds.y1) / 2) * frame.bodyHeight;
      expect(cx, group).toBeCloseTo(50, 0);
      expect(cy, group).toBeCloseTo(50, 0);
    }
  });
});
