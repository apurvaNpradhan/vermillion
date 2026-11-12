import { BottomSheet } from "heroui-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "./button";
import { SHEET_SPRING } from "./sheet-motion";

/**
 * A confirmation as a bottom sheet, for the workout and session flows (account and settings
 * deletion keep `ConfirmationDialog`). The primary button confirms, the secondary one backs out,
 * and an optional red text action below them is the more destructive way out. Dismissing the
 * sheet never runs the confirmed action.
 */
export function ConfirmSheet({
  isOpen,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive = false,
  extraLabel,
  onExtra,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  /** Styles the primary button as a destructive one. */
  destructive?: boolean;
  /** A destructive text action under the buttons ("Discard workout"). */
  extraLabel?: string;
  onExtra?: () => void;
}) {
  const { bottom } = useSafeAreaInsets();
  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          animationConfigs={SHEET_SPRING}
          backgroundClassName="rounded-t-[28px] bg-overlay"
          contentContainerClassName="gap-5 px-4 pt-2"
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
          <View className="gap-2">
            <Button
              variant={destructive ? "danger-soft" : "primary"}
              onPress={() => {
                onOpenChange(false);
                onConfirm();
              }}
            >
              <Button.Label>{confirmLabel}</Button.Label>
            </Button>
            <Button variant="secondary" onPress={() => onOpenChange(false)}>
              <Button.Label>{cancelLabel}</Button.Label>
            </Button>
          </View>
          {extraLabel && onExtra ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={extraLabel}
              className="min-h-11 items-center justify-center"
              onPress={() => {
                onOpenChange(false);
                onExtra();
              }}
            >
              <Text className="font-medium text-body text-danger">{extraLabel}</Text>
            </Pressable>
          ) : null}
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
