import { SUPPORTED_LOCALES, isLocale } from "@workspace/shared";
import { getCalendars } from "expo-localization";
import { Globe, Palette, Translate } from "phosphor-react-native";
import { useState } from "react";

import { useTranslation } from "@/platform/i18n";
import { useThemeChoice } from "@/platform/theme";
import { AppearanceSheet, useAppearanceSummary } from "@/platform/theme/theme-picker";
import { ListRow, ListSection } from "@/platform/ui/list";
import { OptionSheet } from "@/platform/ui/option-sheet";

import { usePreferences } from "../use-preferences";

const LOCALE_NAMES = { en: "English" };
const DEVICE = "device";

type Picker = "appearance" | "language" | "timezone" | null;

/**
 * The Appearance section: appearance, language and time zone as settings rows. Each shows its
 * current value and opens a sheet; account settings go through the one preferences hook.
 */
export function PreferenceRows() {
  const { t } = useTranslation();
  const { preferences, setLocale, setTimezone } = usePreferences();
  const { choice } = useThemeChoice();
  const appearance = useAppearanceSummary(choice);
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
      <ListSection title={t("settings__appearance_title")}>
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
        <ListRow
          icon={Globe}
          title={t("settings__timezone_title")}
          value={zone ?? t("settings__timezone_unset")}
          disabled={zoneOptions.length === 0}
          onPress={() => setPicker("timezone")}
        />
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
