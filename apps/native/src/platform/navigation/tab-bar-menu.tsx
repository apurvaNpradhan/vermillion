import { cn } from "heroui-native";
import type { ReactNode, Ref } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";

import { MENU_ROW_HEIGHT } from "./tab-bar-metrics";

export type MenuItem = {
  key: string;
  label: string;
  icon: (color: string) => ReactNode;
  active: boolean;
};

/** Padding inside the row list, above the first row. */
export const MENU_ROWS_INSET = 8;

/**
 * What the pill shows once it has grown into a panel: an optional header (the account) over a
 * hairline, then one row per tab. Rows are a fixed height so a finger sliding up from the menu
 * button can be mapped to a row. The surface itself belongs to the tab bar.
 */
export function TabBarMenu({
  header,
  items,
  highlighted,
  identity,
  muted,
  rowsRef,
  onLayout,
  onSelect,
}: {
  header?: ReactNode;
  items: MenuItem[];
  /** Row under the finger during a scrub. */
  highlighted: number | null;
  identity: string;
  muted: string;
  rowsRef: Ref<View>;
  onLayout: (event: LayoutChangeEvent) => void;
  onSelect: (key: string) => void;
}) {
  return (
    <View onLayout={onLayout} pointerEvents="auto">
      {header ? (
        <>
          <View className="px-2 pt-2 pb-1">{header}</View>
          <View className="mx-4 my-1 h-px bg-separator" />
        </>
      ) : null}
      <View
        ref={rowsRef}
        collapsable={false}
        accessibilityRole="menu"
        style={{ padding: MENU_ROWS_INSET }}
      >
        {items.map((item, index) => {
          const lit = item.active || highlighted === index;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="menuitem"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: item.active }}
              onPress={() => onSelect(item.key)}
              className={cn(
                "flex-row items-center gap-3 rounded-full px-4",
                lit && "bg-identity-soft",
              )}
              style={{ height: MENU_ROW_HEIGHT }}
            >
              {item.icon(lit ? identity : muted)}
              <Text
                numberOfLines={1}
                className={cn(
                  "flex-1 text-body",
                  lit ? "font-medium text-identity" : "text-foreground",
                )}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
