import { Label } from "@workspace/ui/components/label";
import { Radio, RadioGroup } from "@workspace/ui/components/radio-group";

import { useTranslation } from "@/platform/i18n";
import { isTheme, THEMES, useTheme } from "@/platform/theme";

import { THEME_LABEL_KEYS } from "../theme-labels";

/** Light, dark or system. Stored in a cookie on this device, never in the database. */
export function ThemePicker() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  return (
    <RadioGroup
      aria-label={t("settings__theme_title")}
      className="flex-row gap-6"
      value={theme}
      onValueChange={(value) => {
        if (isTheme(value)) setTheme(value);
      }}
    >
      {THEMES.map((option) => (
        <Label key={option} className="gap-2">
          <Radio value={option} />
          {t(THEME_LABEL_KEYS[option])}
        </Label>
      ))}
    </RadioGroup>
  );
}
