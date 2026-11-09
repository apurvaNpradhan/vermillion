import { cn } from "heroui-native";
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

/**
 * Depth level 3 from DESIGN.md for the controls that float over content (the tab pill, its
 * action button, header capsules): a solid `surface-floating` fill with no outline and the soft
 * overlay shadow. No blur, as in Linear: the layer step and shadow carry the depth.
 */
export function FloatingSurface({
  radius,
  className,
  style,
  children,
}: {
  /** Corner radius; the shadow sits outside the clipped fill, so it cannot come from a class. */
  radius: number;
  className?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  return (
    <View className={cn("shadow-overlay", className)} style={[{ borderRadius: radius }, style]}>
      <View
        className="absolute inset-0 overflow-hidden bg-overlay"
        style={{ borderRadius: radius }}
      />
      {children}
    </View>
  );
}
