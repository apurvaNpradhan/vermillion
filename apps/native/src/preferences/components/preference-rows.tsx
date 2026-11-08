import { SUPPORTED_LOCALES, isLocale } from "@workspace/shared";
import { getCalendars } from "expo-localization";
import { CircleHalf, Globe, Translate } from "phosphor-react-native";
import { useState } from "react";

import { useTranslation } from "@/platform/i18n";
import { isTheme, THEMES, useTheme, type Theme } from "@/platform/theme";
import { ListRow, ListSection } from "@/platform/ui/list";
import { OptionSheet } from "@/platform/ui/option-sheet";

import { usePreferences } from "../use-preferences";

const LOCALE_NAMES = { en: "English", de: "Deutsch" } as const;
const THEME_LABEL_KEYS = {
  light: "theme__light",
  dark: "theme__dark",
  system: "theme__system",
} as const satisfies Record<Theme, string>;
const DEVICE = "device";

type Picker = "theme" | "language" | "timezone" | null;

/**
 * Appearance, language and time zone as settings rows showing their current value; each opens
 * a sheet with the choices. Account settings go through the one preferences hook; the theme is
 * stored on this device only.
 */
export function PreferenceRows() {
  const { t } = useTranslation();
  const { preferences, setLocale, setTimezone } = usePreferences();
  const { theme, setTheme } = useTheme();
  const [picker, setPicker] = useState<Picker>(null);
  const deviceZone = getCalendars()[0]?.timeZone ?? null;
  const onOpenChange = (open: boolean) => {
    if (!open) setPicker(null);
  };

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
          icon={CircleHalf}
          title={t("settings__theme_title")}
          value={t(THEME_LABEL_KEYS[theme])}
          onPress={() => setPicker("theme")}
        />
        <ListRow
          icon={Translate}
          title={t("settings__language_title")}
          value={localeOptions.find((option) => option.value === localeValue)?.label}
          onPress={() => setPicker("language")}
        />
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
        options={THEMES.map((option) => ({ value: option, label: t(THEME_LABEL_KEYS[option]) }))}
        value={theme}
        onSelect={(value) => {
          if (isTheme(value)) setTheme(value);
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
