import { DotsThreeVertical } from "phosphor-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { useSubtleColor } from "@/platform/theme";
import { Hairline } from "@/platform/ui/hairline";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { SwipeRow, type SwipeAction } from "@/platform/ui/swipe-row";

/**
 * Workouts and programs share one flat row: on the canvas, divided from the next by a hairline,
 * with the title, muted lines under it and optionally a tile, a trailing control (a Start button)
 * and a menu button. Swipe or long press opens the actions.
 */
export function PlanRow({
  title,
  lines,
  tile,
  trailing,
  menuLabel,
  onOpen,
  actions,
}: {
  title: string;
  /** Muted lines under the title; empty ones are skipped. */
  lines: readonly (string | null)[];
  tile?: ReactNode;
  trailing?: ReactNode;
  /** Shows the three-dot menu button, named for screen readers. */
  menuLabel?: string;
  onOpen: () => void;
  actions: SwipeAction[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const subtle = useSubtleColor();
  const shown = lines.filter((line): line is string => line !== null && line !== "");
  return (
    <>
      <View className="bg-background">
        <View className="flex-row items-center">
          <View className="flex-1">
            <SwipeRow actions={actions}>
              {(a11y) => (
                <Pressable
                  {...a11y}
                  accessibilityRole="button"
                  accessibilityLabel={[title, ...shown].join(", ")}
                  onPress={onOpen}
                  onLongPress={() => setMenuOpen(true)}
                  className={`min-h-[72px] flex-row items-center gap-3 bg-background py-3 pl-4 active:bg-default ${menuLabel ? "pr-1" : "pr-4"}`}
                >
                  {tile}
                  <View className="flex-1 gap-0.5">
                    <Text numberOfLines={1} className="font-semibold text-body text-foreground">
                      {title}
                    </Text>
                    {shown.map((line, index) => (
                      <Text key={index} numberOfLines={1} className="text-caption text-muted">
                        {line}
                      </Text>
                    ))}
                  </View>
                  {trailing}
                </Pressable>
              )}
            </SwipeRow>
          </View>
          {menuLabel ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={menuLabel}
              onPress={() => setMenuOpen(true)}
              className="h-12 w-12 items-center justify-center"
            >
              <DotsThreeVertical size={20} color={subtle} />
            </Pressable>
          ) : null}
        </View>
        <Hairline />
      </View>
      <ActionSheet title={title} actions={actions} isOpen={menuOpen} onOpenChange={setMenuOpen} />
    </>
  );
}
