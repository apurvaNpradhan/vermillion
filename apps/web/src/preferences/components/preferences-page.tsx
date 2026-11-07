import { SUPPORTED_LOCALES, isLocale } from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@workspace/ui/components/card";
import { Label } from "@workspace/ui/components/label";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import { Switch } from "@workspace/ui/components/switch";
import { useMemo } from "react";

import { useTranslation } from "@/platform/i18n";

import { usePreferences } from "../use-preferences";
import { LOCALE_NAMES } from "./locale-menu";
import { ThemePicker } from "./theme-picker";

function timeZones(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
}

function deviceTimeZone(): string | null {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
}

/** Language, time zone and theme, plus UI settings, all saved through the one preferences hook. */
export function PreferencesPage() {
  const { t } = useTranslation();
  const { preferences, setLocale, setTimezone, setUi } = usePreferences();

  const localeItems = SUPPORTED_LOCALES.map((code) => ({ value: code, label: LOCALE_NAMES[code] }));
  const zoneItems = useMemo(() => timeZones().map((zone) => ({ value: zone, label: zone })), []);
  const device = deviceTimeZone();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle render={<h2 />}>{t("settings__language_title")}</CardTitle>
          <CardDescription>{t("settings__language_hint")}</CardDescription>
        </CardHeader>
        <CardPanel>
          <Select
            items={localeItems}
            value={preferences.locale ?? ""}
            onValueChange={(value) => {
              if (isLocale(value)) setLocale(value);
            }}
          >
            <SelectTrigger aria-label={t("settings__language_title")} className="max-w-xs">
              <SelectValue placeholder={t("settings__language_device")} />
            </SelectTrigger>
            <SelectPopup>
              {localeItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </CardPanel>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle render={<h2 />}>{t("settings__timezone_title")}</CardTitle>
          <CardDescription>{t("settings__timezone_hint")}</CardDescription>
        </CardHeader>
        <CardPanel className="flex flex-col items-start gap-3">
          <Select
            items={zoneItems}
            value={preferences.timezone ?? ""}
            onValueChange={(value) => {
              if (value) setTimezone(value);
            }}
          >
            <SelectTrigger aria-label={t("settings__timezone_title")} className="max-w-xs">
              <SelectValue placeholder={t("settings__timezone_unset")} />
            </SelectTrigger>
            <SelectPopup>
              {zoneItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          {device && device !== preferences.timezone ? (
            <Button variant="outline" size="sm" onClick={() => setTimezone(device)}>
              {t("settings__timezone_device", { zone: device })}
            </Button>
          ) : null}
        </CardPanel>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle render={<h2 />}>{t("settings__theme_title")}</CardTitle>
          <CardDescription>{t("settings__theme_hint")}</CardDescription>
        </CardHeader>
        <CardPanel>
          <ThemePicker />
        </CardPanel>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle render={<h2 />}>{t("settings__interface_title")}</CardTitle>
        </CardHeader>
        <CardPanel>
          <Label className="gap-3">
            <Switch
              checked={preferences.ui.sidebarCollapsed}
              onCheckedChange={(checked) => setUi({ sidebarCollapsed: checked })}
            />
            <span>
              {t("settings__sidebar_title")}
              <span className="block font-normal text-muted-foreground text-xs">
                {t("settings__sidebar_hint")}
              </span>
            </span>
          </Label>
        </CardPanel>
      </Card>
    </div>
  );
}
