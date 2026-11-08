import { SUPPORTED_LOCALES, isLocale } from "@workspace/shared";
import { RadioGroup } from "heroui-native";
import { getCalendars } from "expo-localization";
import { Text } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Screen } from "@/platform/ui/screen";
import { isTheme, THEMES, useTheme, type Theme } from "@/platform/theme";

import { usePreferences } from "../use-preferences";
import { Button } from "@/platform/ui/button";
import { Card } from "@/platform/ui/card";

const LOCALE_NAMES = { en: "English", de: "Deutsch" } as const;
const THEME_LABEL_KEYS = {
  light: "theme__light",
  dark: "theme__dark",
  system: "theme__system",
} as const satisfies Record<Theme, string>;
const DEVICE = "device";

/** Language, time zone and theme. Account settings go through the one preferences hook. */
export function PreferencesScreen() {
  const { t } = useTranslation();
  const { preferences, setLocale, setTimezone } = usePreferences();
  const { theme, setTheme } = useTheme();
  const deviceZone = getCalendars()[0]?.timeZone ?? null;

  return (
    <Screen>
      <Card>
        <Card.Header>
          <Card.Title>{t("settings__language_title")}</Card.Title>
          <Card.Description>{t("settings__language_hint")}</Card.Description>
        </Card.Header>
        <Card.Body>
          <RadioGroup
            value={preferences.locale ?? DEVICE}
            onValueChange={(value) => {
              if (value === DEVICE) setLocale(null);
              else if (isLocale(value)) setLocale(value);
            }}
          >
            <RadioGroup.Item value={DEVICE}>{t("settings__language_device")}</RadioGroup.Item>
            {SUPPORTED_LOCALES.map((code) => (
              <RadioGroup.Item key={code} value={code}>
                {LOCALE_NAMES[code]}
              </RadioGroup.Item>
            ))}
          </RadioGroup>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>{t("settings__timezone_title")}</Card.Title>
          <Card.Description>{t("settings__timezone_hint")}</Card.Description>
        </Card.Header>
        <Card.Body className="items-start gap-3">
          <Text className="text-foreground">
            {preferences.timezone ?? t("settings__timezone_unset")}
          </Text>
          {deviceZone && deviceZone !== preferences.timezone ? (
            <Button variant="secondary" size="sm" onPress={() => setTimezone(deviceZone)}>
              <Button.Label>{t("settings__timezone_device", { zone: deviceZone })}</Button.Label>
            </Button>
          ) : null}
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>{t("settings__theme_title")}</Card.Title>
          <Card.Description>{t("settings__theme_hint")}</Card.Description>
        </Card.Header>
        <Card.Body>
          <RadioGroup
            value={theme}
            onValueChange={(value) => {
              if (isTheme(value)) setTheme(value);
            }}
          >
            {THEMES.map((option) => (
              <RadioGroup.Item key={option} value={option}>
                {t(THEME_LABEL_KEYS[option])}
              </RadioGroup.Item>
            ))}
          </RadioGroup>
        </Card.Body>
      </Card>
    </Screen>
  );
}
