import { View, type ViewStyle } from "react-native";

import { BodyMap, type BodyMapProps } from "./body-map";

/** Each figure's widest size, so a pair on a tablet does not grow past a readable body. */
const MAX_FIGURE_WIDTH = 150;

/** The front and the back side by side, each half the width of the box (less the gap). */
export function BodyMapPair({
  style,
  gap = 16,
  ...props
}: Omit<BodyMapProps, "view" | "style"> & { style?: ViewStyle; gap?: number }) {
  return (
    <View style={[{ flexDirection: "row", justifyContent: "center", gap }, style]}>
      <View style={{ flex: 1, maxWidth: MAX_FIGURE_WIDTH }}>
        <BodyMap view="front" {...props} />
      </View>
      <View style={{ flex: 1, maxWidth: MAX_FIGURE_WIDTH }}>
        <BodyMap view="back" {...props} />
      </View>
    </View>
  );
}
