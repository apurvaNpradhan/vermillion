import { useSheetAnimation } from "./sheet-motion";
import { BottomSheet } from "heroui-native";
import { View } from "react-native";

import { haptic } from "@/platform/haptics";

import { ListRow, ListSection } from "./list";
import { ScrollableSheetContent } from "./scrollable-sheet-content";

export type SheetOption<T extends string> = { value: T; label: string; description?: string };

/**
 * A bottom sheet with one choice from a short list, the chosen one ticked. Picking an option
 * applies it and closes the sheet; there is no separate confirm step.
 */
export function OptionSheet<T extends string>({
  isOpen,
  onOpenChange,
  title,
  description,
  options,
  value,
  onSelect,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  options: SheetOption<T>[];
  /** `null` when nothing is chosen yet: no row is ticked. */
  value: T | null;
  onSelect: (value: T) => void;
}) {
  const animation = useSheetAnimation();
  return (
    <BottomSheet animation={animation} isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <ScrollableSheetContent>
          <View className="gap-1 px-4">
            <BottomSheet.Title className="font-semibold text-title-lg">{title}</BottomSheet.Title>
            {description ? (
              <BottomSheet.Description className="font-normal text-body text-muted">
                {description}
              </BottomSheet.Description>
            ) : null}
          </View>
          <ListSection>
            {options.map((option) => (
              <ListRow
                key={option.value}
                title={option.label}
                description={option.description}
                accessibilityHint={option.description}
                accessory={option.value === value ? "check" : "none"}
                onPress={() => {
                  haptic.tick();
                  onSelect(option.value);
                  onOpenChange(false);
                }}
              />
            ))}
          </ListSection>
        </ScrollableSheetContent>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
