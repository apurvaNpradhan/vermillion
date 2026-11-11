import {
  brandThemes,
  themeNames,
  type RoleTokens,
  type ThemeName,
} from "@workspace/ui/tokens/brand";
import type { TranslationKey } from "@workspace/i18n";
import { BottomSheet } from "heroui-native";
import { useState } from "react";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { OptionSheet } from "@/platform/ui/option-sheet";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";
import { useThemeChoice } from "./index";
import { APPEARANCES, type AppearanceChoice } from "./theme-state";

export const THEME_LABELS = {
  classic: "theme__classic",
  chalk: "theme__chalk",
  frost: "theme__frost",
  iron: "theme__iron",
  dusk: "theme__dusk",
} satisfies Record<ThemeName, TranslationKey>;
const DESCRIPTIONS = {
  classic: "theme__classic_description",
  chalk: "theme__chalk_description",
  frost: "theme__frost_description",
  iron: "theme__iron_description",
  dusk: "theme__dusk_description",
} satisfies Record<ThemeName, TranslationKey>;
export const APPEARANCE_LABELS = {
  system: "theme__system",
  light: "theme__light",
  dark: "theme__dark",
} satisfies Record<AppearanceChoice, TranslationKey>;

/** Literal palette values let both previews remain visible regardless of the active CSS variant. */
function Preview({ colors }: { colors: RoleTokens }) {
  return (
    <View
      accessible={false}
      className="flex-1 rounded-lg p-2"
      style={{ backgroundColor: colors.canvas }}
    >
      <View className="gap-2 rounded-md p-2" style={{ backgroundColor: colors.surface }}>
        <View
          className="h-1 w-12 rounded-full"
          style={{ backgroundColor: colors["text-primary"] }}
        />
        <View className="h-3 w-6 rounded-sm" style={{ backgroundColor: colors.action }} />
      </View>
    </View>
  );
}

export function ThemePicker({
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
        {/* A fixed height and the sheet's own scroll view: a plain ScrollView loses its drags to
            the sheet's pan gesture, so the lower cards could not be reached. */}
        <BottomSheet.Content
          snapPoints={["88%"]}
          enableDynamicSizing={false}
          enableOverDrag={false}
          animationConfigs={SHEET_SPRING}
          backgroundClassName="rounded-t-[28px] bg-overlay"
          contentContainerClassName="h-full"
        >
          <View className="gap-1 px-4 pb-3 pt-2">
            <BottomSheet.Title className="font-semibold text-title-lg">
              {t("settings__theme_title")}
            </BottomSheet.Title>
            <BottomSheet.Description className="text-body text-muted">
              {t("settings__theme_hint")}
            </BottomSheet.Description>
          </View>
          <BottomSheetScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: bottom + 16 }}
          >
            {themeNames.map((name) => (
              <Pressable
                key={name}
                accessibilityRole="radio"
                accessibilityState={{ checked: choice.theme === name }}
                accessibilityLabel={t(THEME_LABELS[name])}
                className={`gap-2 rounded-xl border p-3 ${choice.theme === name ? "border-identity bg-identity-soft" : "border-border bg-surface"}`}
                onPress={() => setChoice({ ...choice, theme: name })}
              >
                <View className="gap-1">
                  <Text className="font-medium text-body text-foreground">
                    {t(THEME_LABELS[name])}
                  </Text>
                  <Text className="text-caption text-muted">{t(DESCRIPTIONS[name])}</Text>
                </View>
                <View className="flex-row gap-2">
                  <Preview colors={brandThemes[name].light} />
                  <Preview colors={brandThemes[name].dark} />
                </View>
              </Pressable>
            ))}
          </BottomSheetScrollView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}

export function AppearancePicker({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { choice, setChoice } = useThemeChoice();
  return (
    <OptionSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t("settings__appearance_title")}
      options={APPEARANCES.map((value) => ({ value, label: t(APPEARANCE_LABELS[value]) }))}
      value={choice.appearance}
      onSelect={(appearance) => setChoice({ ...choice, appearance })}
    />
  );
}

/** The same device settings are available before an account exists. */
export function SignedOutThemeSettings() {
  const { t } = useTranslation();
  const [picker, setPicker] = useState<"theme" | "appearance" | null>(null);
  const close = (open: boolean) => {
    if (!open) setPicker(null);
  };
  return (
    <>
      <View className="flex-row justify-center">
        <Button variant="ghost" onPress={() => setPicker("theme")}>
          <Button.Label>{t("settings__theme_title")}</Button.Label>
        </Button>
        <Button variant="ghost" onPress={() => setPicker("appearance")}>
          <Button.Label>{t("settings__appearance_title")}</Button.Label>
        </Button>
      </View>
      <ThemePicker isOpen={picker === "theme"} onOpenChange={close} />
      <AppearancePicker isOpen={picker === "appearance"} onOpenChange={close} />
    </>
  );
}
