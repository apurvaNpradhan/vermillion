import { Dialog } from "heroui-native";
import { View } from "react-native";

import { Button } from "./button";

/** A themed, two-action confirmation. Dismissal never invokes the confirmed action. */
export function ConfirmationDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onConfirm,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal unstable_accessibilityContainerViewIsModal>
        <Dialog.Overlay variant="default" />
        <Dialog.Content
          isSwipeable={false}
          className="w-full max-w-sm self-center gap-6 rounded-2xl border border-border bg-overlay p-6"
        >
          <View className="gap-3">
            <Dialog.Title className="font-semibold text-title-lg text-foreground">
              {title}
            </Dialog.Title>
            <Dialog.Description className="text-body text-muted">{description}</Dialog.Description>
          </View>
          <View className="flex-row flex-wrap justify-end gap-3">
            <Button variant="secondary" onPress={() => onOpenChange(false)}>
              <Button.Label>{cancelLabel}</Button.Label>
            </Button>
            <Button
              onPress={() => {
                onOpenChange(false);
                onConfirm();
              }}
            >
              <Button.Label>{confirmLabel}</Button.Label>
            </Button>
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
