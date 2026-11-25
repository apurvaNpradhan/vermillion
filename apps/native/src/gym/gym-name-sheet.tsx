import { GYM_LIMITS } from "@workspace/shared";
import { BottomSheet } from "heroui-native";
import { useEffect, useState } from "react";
import { Keyboard, View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Field } from "@/platform/ui/field";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";

/** A gym's name: the new gym's, or a rename. */
export function GymNameSheet({
  isOpen,
  onOpenChange,
  title,
  description,
  value,
  confirmLabel,
  onSave,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  value: string;
  confirmLabel: string;
  onSave: (name: string) => void;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const keyboardHeight = useKeyboardState((state) => state.height);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (isOpen) setDraft(value);
  }, [isOpen, value]);
  const name = draft.trim();
  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) Keyboard.dismiss();
        onOpenChange(open);
      }}
    >
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          bottomInset={keyboardHeight}
          keyboardBehavior="extend"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
          enableContentPanningGesture={false}
          animationConfigs={SHEET_SPRING}
          backgroundClassName="rounded-t-[28px] bg-overlay"
          contentContainerClassName="gap-4 px-4 pt-2"
          contentContainerProps={{ style: { paddingBottom: bottom + 16 } }}
        >
          <View className="gap-1">
            <BottomSheet.Title className="font-semibold text-title-lg">{title}</BottomSheet.Title>
            {description ? (
              <BottomSheet.Description className="text-body text-muted">
                {description}
              </BottomSheet.Description>
            ) : null}
          </View>
          <Field
            label={t("gym__name")}
            value={draft}
            onChangeText={setDraft}
            maxLength={GYM_LIMITS.nameMax}
            placeholder={t("gym__name_placeholder")}
            returnKeyType="done"
          />
          <Button
            variant="primary"
            isDisabled={name === ""}
            onPress={() => {
              Keyboard.dismiss();
              onSave(name);
              onOpenChange(false);
            }}
          >
            <Button.Label>{confirmLabel}</Button.Label>
          </Button>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
