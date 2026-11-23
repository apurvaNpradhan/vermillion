import { Image, View } from "react-native";

import { BASE_LAYERS, GROUP_LAYERS } from "../core/group-layers";
import type { BodyGroup, BodyView } from "../core/groups";
import { regionFrame } from "../core/icon-framing";
import { DISC_CLASS } from "./body-group-icon";
import { LAYER_SOURCES } from "./layer-sources.generated";

/**
 * A circular icon of several groups at once (Push: chest, front delts, triceps): the drawn body
 * in `view`, zoomed to hold them all, each one highlighted with the original art on a light disc.
 * Returns `null` when none of the groups is drawn in that view.
 */
export function BodyRegionIcon({
  groups,
  view,
  size,
}: {
  groups: readonly BodyGroup[];
  view: BodyView;
  size: number;
}) {
  const frame = regionFrame(groups, view, size);
  if (!frame) return null;
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
        {groups.flatMap((group) =>
          GROUP_LAYERS[group][view].map((layer) => (
            <Image key={layer} source={LAYER_SOURCES[layer]} resizeMode="stretch" style={fill} />
          )),
        )}
      </View>
    </View>
  );
}
