import { groupOf, type MuscleDetail } from "@workspace/shared";

import { DETAIL_LAYERS, GROUP_LAYERS, type LayerName } from "./group-layers";
import { BODY_GROUPS, type BodyGroup, type BodyView } from "./groups";

/**
 * The art layers to draw in a view and the opacity of each. A group at an opacity lights its whole
 * drawing, unless `details` names parts of it: then only those parts' layers are lit (ADR 0050).
 * A group with no listed details behaves exactly as before.
 */
export function layerAlphas(
  view: BodyView,
  alphas: ReadonlyMap<BodyGroup, number>,
  details: readonly MuscleDetail[] = [],
): { layer: LayerName; opacity: number }[] {
  const out = new Map<LayerName, number>();
  for (const group of BODY_GROUPS) {
    const opacity = alphas.get(group);
    if (opacity === undefined) continue;
    const parts = details.filter((detail) => groupOf(detail) === group);
    const layers: readonly LayerName[] =
      parts.length === 0
        ? GROUP_LAYERS[group][view]
        : parts.flatMap((part) => DETAIL_LAYERS[part][view]);
    for (const layer of layers) out.set(layer, Math.max(out.get(layer) ?? 0, opacity));
  }
  return [...out].map(([layer, opacity]) => ({ layer, opacity }));
}
