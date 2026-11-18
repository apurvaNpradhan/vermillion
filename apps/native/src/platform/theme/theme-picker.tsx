import type { TranslationKey } from "@workspace/i18n";
import { themeIds, themeVariants, type ThemeId } from "@workspace/ui/tokens/theme-variants";
import { BottomSheet, Switch } from "heroui-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Polygon, Rect } from "react-native-svg";

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

const THEME_LABELS = {
  nord: "theme__nord",
} satisfies Record<ThemeId, TranslationKey>;

export function useAppearanceSummary(choice: ThemeChoice): string {
  const { t } = useTranslation();
  return `${t(THEME_LABELS[choice.theme])} · ${t(APPEARANCE_LABELS[choice.appearance])}`;
}

const CARD_WIDTH = 132;
const CARD_HEIGHT = 84;

/**
 * A theme's preview: its light canvas above the diagonal, its dark canvas below, each with a
 * card and an accent mark, so both halves of the theme show at once.
 */
function ThemePreview({ theme }: { theme: ThemeId }) {
  const light = themeVariants[`${theme}-light`];
  const dark = themeVariants[`${theme}-dark`];
  const [w, h] = [CARD_WIDTH, CARD_HEIGHT];
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} accessible={false}>
      <Polygon points={`0,0 ${w},0 0,${h}`} fill={light.canvas} />
      <Polygon points={`${w},0 ${w},${h} 0,${h}`} fill={dark.canvas} />
      <Rect x={12} y={12} width={52} height={22} rx={6} fill={light.surface} />
      <Circle cx={24} cy={23} r={5} fill={light.identity} />
      <Rect x={w - 64} y={h - 34} width={52} height={22} rx={6} fill={dark.surface} />
      <Circle cx={w - 24} cy={h - 23} r={5} fill={dark.identity} />
    </Svg>
  );
}

/** Theme, appearance and contrast apply as soon as they change. */
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
          <View className="gap-2">
            <Text className="px-1 font-semibold text-overline uppercase text-muted">
              {t("theme__themes")}
            </Text>
            <View className="flex-row flex-wrap gap-3">
              {themeIds.map((theme) => {
                const selected = choice.theme === theme;
                return (
                  <Pressable
                    key={theme}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={t(THEME_LABELS[theme])}
                    onPress={() => setChoice({ ...choice, theme })}
                    className="gap-2"
                  >
                    <View
                      className={
                        selected
                          ? "overflow-hidden rounded-2xl border-2 border-identity"
                          : "overflow-hidden rounded-2xl border-2 border-transparent"
                      }
                    >
                      <ThemePreview theme={theme} />
                    </View>
                    <Text
                      className={
                        selected
                          ? "px-1 font-semibold text-label text-foreground"
                          : "px-1 font-medium text-label text-muted"
                      }
                    >
                      {t(THEME_LABELS[theme])}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <ListSection>
            <ListRow
              title={t("theme__contrast")}
              description={t("theme__contrast_hint")}
              accessory="none"
              onPress={() => setChoice({ ...choice, contrast: !choice.contrast })}
              trailing={
                <Switch
                  accessibilityLabel={t("theme__contrast")}
                  isSelected={choice.contrast}
                  onSelectedChange={(contrast) => setChoice({ ...choice, contrast })}
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
