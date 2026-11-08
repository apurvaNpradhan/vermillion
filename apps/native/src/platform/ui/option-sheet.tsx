import { BottomSheet } from "heroui-native";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptic } from "@/platform/haptics";

import { ListRow, ListSection } from "./list";

export type SheetOption<T extends string> = { value: T; label: string };

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
  value: T;
  onSelect: (value: T) => void;
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
          <View className="gap-1 px-1">
            <BottomSheet.Title className="font-semibold text-title-lg">{title}</BottomSheet.Title>
            {description ? (
              <BottomSheet.Description className="text-body text-muted">
                {description}
              </BottomSheet.Description>
            ) : null}
          </View>
          <ListSection>
            {options.map((option) => (
              <ListRow
                key={option.value}
                title={option.label}
                accessory={option.value === value ? "check" : "none"}
                onPress={() => {
                  haptic.tick();
                  onSelect(option.value);
                  onOpenChange(false);
                }}
              />
            ))}
          </ListSection>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
