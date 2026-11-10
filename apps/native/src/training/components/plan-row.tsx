import { DotsThreeVertical } from "phosphor-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { useSubtleColor } from "@/platform/theme";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { SwipeRow, type SwipeAction } from "@/platform/ui/swipe-row";

/** Workouts and programs share one row layout, touch sizes, menu and swipe behavior. */
export function PlanRow({
  title,
  meta,
  tile,
  menuLabel,
  onOpen,
  actions,
}: {
  title: string;
  meta: string;
  tile: ReactNode;
  menuLabel: string;
  onOpen: () => void;
  actions: SwipeAction[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const subtle = useSubtleColor();
  return (
    <>
      <View className="flex-row items-center bg-surface">
        <View className="flex-1">
          <SwipeRow actions={actions}>
            {(a11y) => (
              <Pressable
                {...a11y}
                accessibilityRole="button"
                accessibilityLabel={`${title}, ${meta}`}
                onPress={onOpen}
                className="min-h-[76px] flex-row items-center gap-3 py-3 pl-3 pr-1 active:bg-default"
              >
                {tile}
                <View className="flex-1 gap-1">
                  <Text numberOfLines={2} className="font-semibold text-body text-foreground">
                    {title}
                  </Text>
                  <Text numberOfLines={2} className="text-caption text-muted">
                    {meta}
                  </Text>
                </View>
              </Pressable>
            )}
          </SwipeRow>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={menuLabel}
          onPress={() => setMenuOpen(true)}
          className="h-12 w-12 items-center justify-center"
        >
          <DotsThreeVertical size={20} color={subtle} />
        </Pressable>
      </View>
      <ActionSheet title={title} actions={actions} isOpen={menuOpen} onOpenChange={setMenuOpen} />
    </>
  );
}
