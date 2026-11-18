import type { TranslationKey } from "@workspace/i18n";
import { BottomSheet, Switch } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { ListRow, ListSection } from "@/platform/ui/list";
import { SegmentedControl } from "@/platform/ui/segmented-control";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";
import { useThemeChoice } from "./index";
import { APPEARANCES, type AppearanceChoice, type ThemeChoice } from "./theme-state";

const APPEARANCE_LABELS = {
  system: "theme__system",
  light: "theme__light",
  dark: "theme__dark",
} satisfies Record<AppearanceChoice, TranslationKey>;

export function useAppearanceSummary(choice: ThemeChoice): string {
  const { t } = useTranslation();
  return t(APPEARANCE_LABELS[choice.appearance]);
}

/** Appearance and true black apply as soon as they change. */
export function AppearanceSheet({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const { choice, setChoice } = useThemeChoice();
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
          <BottomSheet.Title className="px-1 font-semibold text-title-lg">
            {t("settings__appearance_title")}
          </BottomSheet.Title>
          <SegmentedControl
            accessibilityLabel={t("settings__appearance_title")}
            options={APPEARANCES.map((value) => ({ value, label: t(APPEARANCE_LABELS[value]) }))}
            value={choice.appearance}
            onChange={(appearance) => setChoice({ ...choice, appearance })}
          />
          <ListSection>
            <ListRow
              title={t("theme__true_black")}
              description={t("theme__true_black_hint")}
              accessory="none"
              onPress={() => setChoice({ ...choice, black: !choice.black })}
              trailing={
                <Switch
                  accessibilityLabel={t("theme__true_black")}
                  isSelected={choice.black}
                  onSelectedChange={(black) => setChoice({ ...choice, black })}
                />
              }
            />
          </ListSection>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

/** The same device settings are available before an account exists. */
export function SignedOutThemeSettings() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <View className="flex-row justify-center">
        <Button variant="ghost" onPress={() => setOpen(true)}>
          <Button.Label>{t("settings__appearance_title")}</Button.Label>
        </Button>
      </View>
      <AppearanceSheet isOpen={open} onOpenChange={setOpen} />
    </>
  );
}
