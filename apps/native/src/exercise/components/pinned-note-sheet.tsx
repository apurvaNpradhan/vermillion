import { SESSION_LIMITS } from "@workspace/shared";
import { BottomSheet } from "heroui-native";
import { useEffect, useState } from "react";
import { Keyboard, TextInput, View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";

/** Edits the exercise's pinned note: one growing field and Done; an empty note clears it. */
export function PinnedNoteSheet({
  isOpen,
  onOpenChange,
  title,
  value,
  onSave,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  value: string | null;
  onSave: (note: string | null) => void;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const keyboardHeight = useKeyboardState((state) => state.height);
  const [draft, setDraft] = useState(value ?? "");
  useEffect(() => {
    if (isOpen) setDraft(value ?? "");
  }, [isOpen, value]);
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
            <BottomSheet.Description className="text-body text-muted">
              {t("session__pinned_exercise_note_hint")}
            </BottomSheet.Description>
          </View>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            scrollEnabled={false}
            maxLength={SESSION_LIMITS.noteMax}
            accessibilityLabel={t("session__pinned_exercise_note")}
            placeholder={t("session__pinned_exercise_note_placeholder")}
            placeholderTextColorClassName="accent-muted"
            className="font-normal min-h-11 py-2 text-body text-foreground"
          />
          <Button
            variant="primary"
            onPress={() => {
              Keyboard.dismiss();
              onSave(draft.trim() === "" ? null : draft);
              onOpenChange(false);
            }}
          >
            <Button.Label>{t("training__effort_done")}</Button.Label>
          </Button>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
