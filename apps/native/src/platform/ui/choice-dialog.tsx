import { Dialog } from "heroui-native";
import { View } from "react-native";

import { Button } from "./button";
import { useDialogMotion } from "@/platform/ui/sheet-motion";

export type DialogChoice = {
  label: string;
  onPress: () => void;
  /** The one filled action; the rest are quiet. */
  primary?: boolean;
};

/**
 * A themed dialog with two or three actions, for a question that has more than one way out
 * ("Change", "Keep 1000 kg", "Swap"). Every action closes the dialog and then runs; dismissing it
 * (the overlay or back) closes it and runs `onDismiss`, if given.
 */
export function ChoiceDialog({
  isOpen,
  onClose,
  onDismiss,
  title,
  description,
  choices,
}: {
  isOpen: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  title: string;
  description: string;
  choices: readonly DialogChoice[];
}) {
  const dialogMotion = useDialogMotion();
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (open) return;
        onClose();
        onDismiss?.();
      }}
    >
      <Dialog.Portal unstable_accessibilityContainerViewIsModal>
        <Dialog.Overlay variant="default" />
        <Dialog.Content
          animation={dialogMotion}
          isSwipeable={false}
          className="w-full max-w-sm self-center gap-6 rounded-2xl bg-overlay p-6"
        >
          <View className="gap-3">
            <Dialog.Title className="font-semibold text-title-lg text-foreground">
              {title}
            </Dialog.Title>
            <Dialog.Description className="text-body text-muted">{description}</Dialog.Description>
          </View>
          <View className="flex-row flex-wrap justify-end gap-3">
            {choices.map((choice) => (
              <Button
                key={choice.label}
                variant={choice.primary ? "primary" : "secondary"}
                onPress={() => {
                  onClose();
                  choice.onPress();
                }}
              >
                <Button.Label>{choice.label}</Button.Label>
              </Button>
            ))}
          </View>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
