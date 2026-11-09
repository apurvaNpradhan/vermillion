import type { MuscleGroup } from "@workspace/shared";
import { Image, View } from "react-native";

import { BASE_LAYERS, GROUP_LAYERS, PREFERRED_VIEW } from "../core/group-layers";
import { isBodyGroup } from "../core/groups";
import { iconFrame } from "../core/icon-framing";
import { LAYER_SOURCES } from "./layer-sources.generated";

/** The disc is light in both themes so the grey anatomy and its colours read the same. */
export const DISC_CLASS = "overflow-hidden rounded-full border border-border bg-white";

/**
 * A circular icon of one group: the drawn body (front or back, whichever shows the group best)
 * zoomed to the group, the group's layers in their own colour, on a light disc. The art is never
 * tinted. `null` for a group with no drawing, so the caller picks a symbol for it.
 */
export function BodyGroupIcon({ group, size }: { group: MuscleGroup; size: number }) {
  if (!isBodyGroup(group)) return null;
  const frame = iconFrame(group, size);
  if (!frame) return null;
  const view = PREFERRED_VIEW[group];
  const fill = { position: "absolute", width: "100%", height: "100%" } as const;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={DISC_CLASS}
      style={{ width: size, height: size }}
    >
      <View
        style={{
          position: "absolute",
          width: frame.bodyWidth,
          height: frame.bodyHeight,
          left: frame.left,
          top: frame.top,
        }}
      >
        <Image source={LAYER_SOURCES[BASE_LAYERS[view]]} resizeMode="stretch" style={fill} />
        {GROUP_LAYERS[group][view].map((layer) => (
          <Image key={layer} source={LAYER_SOURCES[layer]} resizeMode="stretch" style={fill} />
        ))}
      </View>
    </View>
  );
}
