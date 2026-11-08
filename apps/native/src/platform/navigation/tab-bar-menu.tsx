import { cn, useThemeColor } from "heroui-native";
import { Check } from "phosphor-react-native";
import type { ReactNode, Ref } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { Keyframe, ReduceMotion } from "react-native-reanimated";

import { FloatingSurface } from "@/platform/ui/floating-surface";

import { MENU_ROW_HEIGHT } from "./tab-bar-metrics";

const MENU_WIDTH = 264;
const MENU_RADIUS = 24;

// Grows out of the switcher (bottom left), fast and without overshoot (motion-fast).
const OPEN = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.9 }, { translateY: 12 }] },
  100: { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }] },
})
  .duration(140)
  .reduceMotion(ReduceMotion.System);
const CLOSE = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }, { translateY: 0 }] },
  100: { opacity: 0, transform: [{ scale: 0.96 }, { translateY: 8 }] },
})
  .duration(90)
  .reduceMotion(ReduceMotion.System);

export type MenuItem = {
  key: string;
  label: string;
  icon: (color: string) => ReactNode;
  active: boolean;
};

/**
 * The switcher's menu: an optional header (the account), then one row per destination. Rows
 * are a fixed height so a finger sliding up from the switcher can be mapped to a row.
 */
export function TabBarMenu({
  header,
  items,
  highlighted,
  bottom,
  left,
  rowsRef,
  onRowsLayout,
  onSelect,
}: {
  header?: ReactNode;
  items: MenuItem[];
  /** Row under the finger during a scrub. */
  highlighted: number | null;
  bottom: number;
  left: number;
  rowsRef: Ref<View>;
  onRowsLayout: () => void;
  onSelect: (key: string) => void;
}) {
  const [foreground, muted] = useThemeColor(["foreground", "muted"]);
  return (
    <Animated.View
      entering={OPEN}
      exiting={CLOSE}
      accessibilityViewIsModal
      className="absolute"
      style={{ bottom, left, width: MENU_WIDTH, transformOrigin: "bottom left" }}
    >
      <FloatingSurface radius={MENU_RADIUS}>
        {header ? <View className="border-b border-separator p-2">{header}</View> : null}
        <View ref={rowsRef} onLayout={onRowsLayout} className="p-2" accessibilityRole="menu">
          {items.map((item, index) => {
            const lit = item.active || highlighted === index;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="menuitem"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: item.active }}
                onPress={() => onSelect(item.key)}
                className={cn("flex-row items-center gap-3 rounded-2xl px-3", lit && "bg-default")}
                style={{ height: MENU_ROW_HEIGHT }}
              >
                {item.icon(lit ? foreground : muted)}
                <Text
                  numberOfLines={1}
                  className={cn("flex-1 text-body", lit ? "text-foreground" : "text-subtle")}
                >
                  {item.label}
                </Text>
                {item.active ? <Check size={16} color={foreground} weight="bold" /> : null}
              </Pressable>
            );
          })}
        </View>
      </FloatingSurface>
    </Animated.View>
  );
}
