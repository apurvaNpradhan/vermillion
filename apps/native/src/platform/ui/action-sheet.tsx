import { BottomSheet } from "heroui-native";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListRow, ListSection } from "./list";
import type { SwipeAction } from "./swipe-row";

/** Roughly the sheet's closing animation. */
const CLOSE_MS = 250;

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
  const { bottom } = useSafeAreaInsets();
  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          backgroundClassName="rounded-t-[28px] bg-overlay"
          contentContainerClassName="gap-4 px-4 pt-2"
          contentContainerProps={{ style: { paddingBottom: bottom + 16 } }}
        >
          <View className="px-1">
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
                  setTimeout(action.onPress, CLOSE_MS);
                }}
              />
            ))}
          </ListSection>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
