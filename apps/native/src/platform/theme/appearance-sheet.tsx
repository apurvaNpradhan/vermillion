import { SheetPortal } from "@/platform/ui/modal-state";
import type { TranslationKey } from "@workspace/i18n";
import { nativeColors } from "@workspace/ui/tokens/brand";
import { accentIds, variantName, type AccentId } from "@workspace/ui/tokens/theme-variants";
import { BottomSheet } from "heroui-native";
import { Check } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { SegmentedControl } from "@/platform/ui/segmented-control";
import { ScrollableSheetContent } from "@/platform/ui/scrollable-sheet-content";
import { useThemeChoice, useThemeMode } from "./index";
import { APPEARANCES, type AppearanceChoice, type ThemeChoice } from "./theme-state";

const APPEARANCE_LABELS = {
  system: "theme__system",
  light: "theme__light",
  dark: "theme__dark",
} satisfies Record<AppearanceChoice, TranslationKey>;

const ACCENT_LABELS = {
  lime: "theme__accent_lime",
  gold: "theme__accent_gold",
  ember: "theme__accent_ember",
  rose: "theme__accent_rose",
  ice: "theme__accent_ice",
  mono: "theme__accent_mono",
} satisfies Record<AccentId, TranslationKey>;

export function useAppearanceSummary(choice: ThemeChoice): string {
  const { t } = useTranslation();
  return `${t(APPEARANCE_LABELS[choice.appearance])} · ${t(ACCENT_LABELS[choice.accent])}`;
}

/** Mode and accent apply as soon as they change. */
export function AppearanceSheet({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { choice, setChoice } = useThemeChoice();
  const mode = useThemeMode();
  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <SheetPortal>
        <BottomSheet.Overlay />
        <ScrollableSheetContent>
          <BottomSheet.Title className="px-1 font-semibold text-title-lg">
            {t("settings__appearance_title")}
          </BottomSheet.Title>
          <SegmentedControl
            accessibilityLabel={t("theme__mode")}
            options={APPEARANCES.map((value) => ({ value, label: t(APPEARANCE_LABELS[value]) }))}
            value={choice.appearance}
            onChange={(appearance) => setChoice({ ...choice, appearance })}
          />
          <Text className="px-1 pt-2 font-semibold text-overline uppercase text-muted">
            {t("theme__accent")}
          </Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t("theme__accent")}
            className="flex-row justify-between px-1"
          >
            {accentIds.map((accent) => {
              const colors = nativeColors[variantName(accent, mode)];
              const selected = choice.accent === accent;
              return (
                <Pressable
                  key={accent}
                  accessibilityRole="radio"
                  accessibilityLabel={t(ACCENT_LABELS[accent])}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    haptic.tick();
                    setChoice({ ...choice, accent });
                  }}
                  className="items-center gap-1.5 active:opacity-70"
                >
                  <View
                    className={`size-11 items-center justify-center rounded-full border-2 ${selected ? "border-foreground" : "border-transparent"}`}
                  >
                    <View
                      className="size-8 items-center justify-center rounded-full"
                      style={{ backgroundColor: colors.action }}
                    >
                      {selected ? (
                        <Check size={18} weight="bold" color={colors["on-action"]} />
                      ) : null}
                    </View>
                  </View>
                  <Text className={`text-caption ${selected ? "text-foreground" : "text-muted"}`}>
                    {t(ACCENT_LABELS[accent])}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollableSheetContent>
      </SheetPortal>
    </BottomSheet>
  );
}
