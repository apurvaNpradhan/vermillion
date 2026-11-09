import { SUPPORTED_LOCALES, isLocale } from "@workspace/shared";
import { getCalendars } from "expo-localization";
import { Globe, Palette, Translate } from "phosphor-react-native";
import { useState } from "react";

import type { TranslationKey } from "@workspace/i18n";

import { useTranslation } from "@/platform/i18n";
import { useThemeChoice } from "@/platform/theme";
import { THEME_CHOICES, type ThemeChoice } from "@/platform/theme/theme-state";
import { ListRow, ListSection } from "@/platform/ui/list";
import { OptionSheet } from "@/platform/ui/option-sheet";

import { usePreferences } from "../use-preferences";

const LOCALE_NAMES = { en: "English" };
const DEVICE = "device";

type Picker = "theme" | "language" | "timezone" | null;

const THEME_LABELS = {
  system: "theme__system",
  light: "theme__light",
  dark: "theme__dark",
} as const satisfies Record<ThemeChoice, TranslationKey>;

function isThemeChoice(value: string): value is ThemeChoice {
  return THEME_CHOICES.some((choice) => choice === value);
}

/**
 * Theme, language and time zone as settings rows. Each shows their current
 * value and open a sheet; account settings go through the one preferences hook.
 */
export function PreferenceRows() {
  const { t } = useTranslation();
  const { preferences, setLocale, setTimezone } = usePreferences();
  const { choice, setChoice } = useThemeChoice();
  const [picker, setPicker] = useState<Picker>(null);
  const deviceZone = getCalendars()[0]?.timeZone ?? null;
  const onOpenChange = (open: boolean) => {
    if (!open) setPicker(null);
  };

  const themeOptions = THEME_CHOICES.map((value) => ({ value, label: t(THEME_LABELS[value]) }));
  const localeValue = preferences.locale ?? DEVICE;
  const localeOptions = [
    { value: DEVICE, label: t("settings__language_device") },
    ...SUPPORTED_LOCALES.map((code) => ({ value: code, label: LOCALE_NAMES[code] })),
  ];
  const zone = preferences.timezone;
  const zoneOptions = [
    ...(zone ? [{ value: zone, label: zone }] : []),
    ...(deviceZone && deviceZone !== zone
      ? [{ value: deviceZone, label: t("settings__timezone_device", { zone: deviceZone }) }]
      : []),
  ];

  return (
    <>
      <ListSection title={t("settings__section_preferences")}>
        <ListRow
          icon={Palette}
          title={t("settings__theme_title")}
          value={t(THEME_LABELS[choice])}
          onPress={() => setPicker("theme")}
        />
        {SUPPORTED_LOCALES.length > 1 && (
          <ListRow
            icon={Translate}
            title={t("settings__language_title")}
            value={localeOptions.find((option) => option.value === localeValue)?.label}
            onPress={() => setPicker("language")}
          />
        )}
        <ListRow
          icon={Globe}
          title={t("settings__timezone_title")}
          value={zone ?? t("settings__timezone_unset")}
          disabled={zoneOptions.length === 0}
          onPress={() => setPicker("timezone")}
        />
      </ListSection>

      <OptionSheet
        isOpen={picker === "theme"}
        onOpenChange={onOpenChange}
        title={t("settings__theme_title")}
        description={t("settings__theme_hint")}
        options={themeOptions}
        value={choice}
        onSelect={(value) => {
          if (isThemeChoice(value)) setChoice(value);
        }}
      />
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
      <OptionSheet
        isOpen={picker === "timezone"}
        onOpenChange={onOpenChange}
        title={t("settings__timezone_title")}
        description={t("settings__timezone_hint")}
        options={zoneOptions}
        value={zone ?? ""}
        onSelect={setTimezone}
      />
    </>
  );
}
