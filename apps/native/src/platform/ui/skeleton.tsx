import { cn } from "heroui-native";
import { memo } from "react";
import type { ViewProps } from "react-native";
import { View } from "react-native";

export type SkeletonProps = {
  className?: string;
  style?: ViewProps["style"];
  /** Name the loading region for screen readers; put it on one skeleton per region only. */
  label?: string;
};

/**
 * A static `bg-default` placeholder for a wait on the network (a remote image, a server answer).
 * Never for data on the device: that arrives in milliseconds and fades in instead (`FadeIn`). It
 * does not animate, so it never competes with the content that replaces it.
 */
export const Skeleton = memo(function Skeleton({ className, style, label }: SkeletonProps) {
  const announced = label !== undefined;
  return (
    <View
      accessibilityRole={announced ? "progressbar" : undefined}
      accessibilityLabel={label}
      accessibilityState={{ busy: announced }}
      accessibilityElementsHidden={!announced}
      importantForAccessibility={announced ? "auto" : "no-hide-descendants"}
      style={style}
      className={cn("rounded-2xl bg-default", className)}
    />
  );
});
