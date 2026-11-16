import { accentNames, brandThemes, type AccentName } from "@workspace/ui/tokens/brand";
import type { TranslationKey } from "@workspace/i18n";
import { BottomSheet, Switch } from "heroui-native";
import { Check } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { ListRow, ListSection } from "@/platform/ui/list";
import { SegmentedControl } from "@/platform/ui/segmented-control";
import { SHEET_SPRING } from "@/platform/ui/sheet-motion";
import { usePaletteMode, useThemeChoice } from "./index";
import { APPEARANCES, type AppearanceChoice, type ThemeChoice } from "./theme-state";

const ACCENT_LABELS = {
  mono: "theme__accent_mono",
  vermilion: "theme__accent_vermilion",
  cobalt: "theme__accent_cobalt",
  violet: "theme__accent_violet",
  teal: "theme__accent_teal",
} satisfies Record<AccentName, TranslationKey>;
const APPEARANCE_LABELS = {
  system: "theme__system",
  light: "theme__light",
  dark: "theme__dark",
} satisfies Record<AppearanceChoice, TranslationKey>;

/** "Dark · Cobalt": the current choice as one settings value. */
export function useAppearanceSummary(choice: ThemeChoice): string {
  const { t } = useTranslation();
  return `${t(APPEARANCE_LABELS[choice.appearance])} · ${t(ACCENT_LABELS[choice.accent])}`;
}

/** Appearance, true black and accent in one sheet. Every change applies at once. */
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
  const mode = usePaletteMode();
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
          <View className="gap-3">
            <Text className="px-1 font-medium text-label text-muted">{t("theme__accent")}</Text>
            <View accessibilityRole="radiogroup" className="flex-row justify-between px-1">
              {accentNames.map((name) => {
                // Literal palette values: every swatch shows its own colour, not the active one.
                const colors = brandThemes[name][mode];
                const selected = choice.accent === name;
                return (
                  <Pressable
                    key={name}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={t(ACCENT_LABELS[name])}
                    className="items-center gap-2 active:opacity-70"
                    onPress={() => {
                      haptic.tick();
                      setChoice({ ...choice, accent: name });
                    }}
                  >
                    <View
                      className={`rounded-full border-2 p-1 ${selected ? "border-foreground" : "border-transparent"}`}
                    >
                      <View
                        className="size-11 items-center justify-center rounded-full"
                        style={{ backgroundColor: colors.identity }}
                      >
                        {selected ? (
                          <Check size={20} weight="bold" color={colors["on-identity"]} />
                        ) : null}
                      </View>
                    </View>
                    <Text className={`text-caption ${selected ? "text-foreground" : "text-muted"}`}>
                      {t(ACCENT_LABELS[name])}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
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
