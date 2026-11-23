import { useSheetAnimation } from "./sheet-motion";
import { BottomSheet } from "heroui-native";
import { View } from "react-native";

import { ListRow, ListSection } from "./list";
import { ScrollableSheetContent } from "./scrollable-sheet-content";
import type { SwipeAction } from "./swipe-row";

/** Roughly the sheet's closing animation. */
const CLOSE_MS = 200;

/**
 * A sheet of actions for one item, opened by a long press: the same actions as its swipe, with
 * room for labels. Picking one closes the sheet first.
 */
export function ActionSheet({
  title,
  actions,
  isOpen,
  onOpenChange,
}: {
  title: string;
  actions: SwipeAction[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const animation = useSheetAnimation();
  return (
    <BottomSheet animation={animation} isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <ScrollableSheetContent>
          <View className="px-4">
            <BottomSheet.Title numberOfLines={1} className="font-semibold text-title-lg">
              {title}
            </BottomSheet.Title>
          </View>
          <ListSection>
            {actions.map((action) => (
              <ListRow
                key={action.key}
                icon={action.icon}
                title={action.label}
                tone={action.tone}
                accessory="none"
                onPress={() => {
                  onOpenChange(false);
                  // After the sheet is gone, so an action that opens another sheet does not
                  // animate in while this one is still leaving.
                  if (animation) {
                    requestAnimationFrame(() => requestAnimationFrame(action.onPress));
                  } else {
                    setTimeout(action.onPress, CLOSE_MS);
                  }
                }}
              />
            ))}
          </ListSection>
        </ScrollableSheetContent>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
