import type { TranslationKey } from "@workspace/i18n";
import { BottomSheet, Switch } from "heroui-native";

import { useTranslation } from "@/platform/i18n";
import { ListRow, ListSection } from "@/platform/ui/list";
import { SegmentedControl } from "@/platform/ui/segmented-control";
import { ScrollableSheetContent } from "@/platform/ui/scrollable-sheet-content";
import { useThemeChoice } from "./index";
import { APPEARANCES, type AppearanceChoice } from "./theme-state";

const APPEARANCE_LABELS = {
  system: "theme__system",
  light: "theme__light",
  dark: "theme__dark",
} satisfies Record<AppearanceChoice, TranslationKey>;

export function useAppearanceSummary(appearance: AppearanceChoice): string {
  const { t } = useTranslation();
  return t(APPEARANCE_LABELS[appearance]);
}

/** Appearance and contrast apply as soon as they change. */
export function AppearanceSheet({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { choice, setChoice } = useThemeChoice();
  return (
    <BottomSheet isOpen={isOpen} onOpenChange={onOpenChange}>
      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <ScrollableSheetContent>
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
              title={t("theme__contrast")}
              description={t("theme__contrast_hint")}
              accessory="none"
              checked={choice.contrast}
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
        </ScrollableSheetContent>
      </BottomSheet.Portal>
    </BottomSheet>
  );
}
