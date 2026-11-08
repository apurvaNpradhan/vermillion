import { BlurView } from "expo-blur";
import { cn } from "heroui-native";
import type { ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useUniwind } from "uniwind";

/**
 * Depth level 3 from DESIGN.md for the controls that float over content (the tab pill, its
 * action button, header capsules): `surface-floating` with a `hairline-strong` edge, plus the
 * overlay shadow in light mode. iOS blurs what scrolls underneath; Android's blur is unreliable,
 * so it gets the solid surface instead.
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
  const { theme } = useUniwind();
  const blur = Platform.OS === "ios";
  return (
    <View className={cn("shadow-overlay", className)} style={[{ borderRadius: radius }, style]}>
      <View
        className="absolute inset-0 overflow-hidden border border-separator"
        style={{ borderRadius: radius }}
      >
        {blur ? (
          <BlurView
            intensity={60}
            tint={theme === "dark" ? "dark" : "light"}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <View className={cn("absolute inset-0", blur ? "bg-overlay/80" : "bg-overlay")} />
      </View>
      {children}
    </View>
  );
}
