import { BottomSheet, Spinner } from "heroui-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Field } from "@/platform/ui/field";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";

/** A sheet with one name field for renaming a passkey. */
export function RenameSheet({
  isOpen,
  initialName,
  saving,
  onOpenChange,
  onSave,
}: {
  isOpen: boolean;
  initialName: string;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const [name, setName] = useState(initialName);
  useEffect(() => {
    if (isOpen) setName(initialName);
  }, [isOpen, initialName]);
  const trimmed = name.trim();

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          animationConfigs={SHEET_SPRING}
          backgroundClassName="rounded-t-[28px] bg-overlay"
          contentContainerClassName="gap-4 px-4 pt-2"
          contentContainerProps={{ style: { paddingBottom: bottom + 16 } }}
        >
          <BottomSheet.Title className="px-1 font-semibold text-title-lg">
            {t("passkeys__rename_title")}
          </BottomSheet.Title>
          <Field
            label={t("passkeys__name_label")}
            value={name}
            onChangeText={setName}
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={() => trimmed && onSave(trimmed)}
          />
          <View className="flex-row gap-3">
            <Button variant="secondary" className="flex-1" onPress={() => onOpenChange(false)}>
              <Button.Label>{t("common__cancel")}</Button.Label>
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              isDisabled={saving || trimmed === ""}
              onPress={() => onSave(trimmed)}
            >
              {saving ? <Spinner size="sm" /> : null}
              <Button.Label>{t("common__save")}</Button.Label>
            </Button>
          </View>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
