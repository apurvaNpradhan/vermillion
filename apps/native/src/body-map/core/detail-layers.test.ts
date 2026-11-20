import { MUSCLE_DETAIL_SLUGS, groupOf } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { layerAlphas } from "./detail-layers";
import { DETAIL_LAYERS, GROUP_LAYERS } from "./group-layers";
import { BODY_GROUPS, BODY_VIEWS, isBodyGroup } from "./groups";

describe("detail layers", () => {
  it("covers every detail, each layer a subset of its group's layers", () => {
    expect(Object.keys(DETAIL_LAYERS).sort()).toEqual([...MUSCLE_DETAIL_SLUGS].sort());
    for (const detail of MUSCLE_DETAIL_SLUGS) {
      const group = groupOf(detail);
      expect(isBodyGroup(group), detail).toBe(true);
      if (!isBodyGroup(group)) continue;
      for (const view of BODY_VIEWS) {
        const allowed: readonly string[] = GROUP_LAYERS[group][view];
        for (const layer of DETAIL_LAYERS[detail][view]) {
          expect(allowed, `${detail} ${layer}`).toContain(layer);
        }
      }
    }
  });

  it("lights only the side delt layers for a lateral raise", () => {
    const alphas = new Map([["shoulders" as const, 1]]);
    expect(layerAlphas("front", alphas, ["side_delts"])).toEqual([
      { layer: "front_deltoid_lateral", opacity: 1 },
    ]);
    expect(layerAlphas("back", alphas, ["side_delts"])).toEqual([]);
  });

  it("lights the whole group when it has no listed details, and mixes both", () => {
    const alphas = new Map([
      ["shoulders" as const, 1],
      ["triceps" as const, 0.45],
    ]);
    const layers = layerAlphas("front", alphas, ["side_delts"]);
    expect(layers).toEqual([
      { layer: "front_deltoid_lateral", opacity: 1 },
      { layer: "front_triceps", opacity: 0.45 },
    ]);
  });

  it("is the old behaviour without details", () => {
    const alphas = new Map(BODY_GROUPS.map((group) => [group, 1] as const));
    for (const view of BODY_VIEWS) {
      const lit = layerAlphas(view, alphas).map((entry) => entry.layer);
      expect(lit.toSorted()).toEqual(BODY_GROUPS.flatMap((g) => GROUP_LAYERS[g][view]).toSorted());
    }
  });
});
