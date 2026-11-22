import { SUPPORTED_LOCALES, isLocale } from "@workspace/shared";
import { Palette, Translate } from "phosphor-react-native";
import { useState, type ReactNode } from "react";

import { useTranslation } from "@/platform/i18n";
import { useThemeChoice } from "@/platform/theme";
import { AppearanceSheet, useAppearanceSummary } from "@/platform/theme/appearance-sheet";
import { ListRow, ListSection } from "@/platform/ui/list";
import { OptionSheet } from "@/platform/ui/option-sheet";

import { usePreferences } from "../use-preferences";

const LOCALE_NAMES = { en: "English" };
const DEVICE = "device";

type Picker = "appearance" | "language" | null;

/**
 * The Preferences section: appearance and language as settings rows, then any rows
 * passed in (Units). Each shows its current value and opens a sheet; account settings go through
 * the one preferences hook.
 */
export function PreferenceRows({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const { preferences, setLocale } = usePreferences();
  const { choice } = useThemeChoice();
  const appearance = useAppearanceSummary(choice);
  const [picker, setPicker] = useState<Picker>(null);
  const onOpenChange = (open: boolean) => {
    if (!open) setPicker(null);
  };

  const localeValue = preferences.locale ?? DEVICE;
  const localeOptions = [
    { value: DEVICE, label: t("settings__language_device") },
    ...SUPPORTED_LOCALES.map((code) => ({ value: code, label: LOCALE_NAMES[code] })),
  ];

  return (
    <>
      <ListSection title={t("settings__preferences_title")}>
        <ListRow
          icon={Palette}
          title={t("settings__appearance_title")}
          value={appearance}
          onPress={() => setPicker("appearance")}
        />
        {SUPPORTED_LOCALES.length > 1 && (
          <ListRow
            icon={Translate}
            title={t("settings__language_title")}
            value={localeOptions.find((option) => option.value === localeValue)?.label}
            onPress={() => setPicker("language")}
          />
        )}
        {children}
      </ListSection>

      <AppearanceSheet isOpen={picker === "appearance"} onOpenChange={onOpenChange} />
      <OptionSheet
        isOpen={picker === "language"}
        onOpenChange={onOpenChange}
        title={t("settings__language_title")}
        description={t("settings__language_hint")}
        options={localeOptions}
        value={localeValue}
        onSelect={(value) => {
          if (value === DEVICE) setLocale(null);
          else if (isLocale(value)) setLocale(value);
        }}
      />
    </>
  );
}
