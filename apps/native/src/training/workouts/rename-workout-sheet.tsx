import { TRAINING_LIMITS } from "@workspace/shared";
import { BottomSheet } from "heroui-native";
import { useEffect, useState } from "react";
import { Keyboard, TextInput, View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { mountOnOpen } from "@/platform/ui/mount-on-open";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";

/**
 * A quick rename of a Workout: one field and Save. An empty name clears the title, so the
 * Workout shows the name derived from its muscles again.
 */
function RenameWorkoutSheetBody({
  isOpen,
  onOpenChange,
  value,
  placeholder,
  onSave,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  value: string | null;
  /** The derived name shown while the title is empty. */
  placeholder: string;
  onSave: (title: string | null) => void;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const keyboardHeight = useKeyboardState((state) => state.height);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => {
    if (isOpen) setDraft(value ?? "");
  }, [isOpen, value]);
  const save = () => {
    Keyboard.dismiss();
    const next = draft.trim();
    if (next !== (value ?? "").trim()) onSave(next === "" ? null : next);
    onOpenChange(false);
  };
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
          <BottomSheet.Title className="font-semibold text-title-lg">
            {t("training__rename_workout")}
          </BottomSheet.Title>
          <View>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              autoFocus
              maxLength={TRAINING_LIMITS.titleMax}
              returnKeyType="done"
              onSubmitEditing={save}
              accessibilityLabel={t("training__name_label")}
              placeholder={placeholder}
              placeholderTextColorClassName="accent-muted"
              className="font-normal min-h-11 py-2 text-body text-foreground"
            />
          </View>
          <Button variant="primary" onPress={save}>
            <Button.Label>{t("common__save")}</Button.Label>
          </Button>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

export const RenameWorkoutSheet = mountOnOpen(RenameWorkoutSheetBody);
