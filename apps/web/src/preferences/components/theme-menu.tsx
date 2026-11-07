import { Button } from "@workspace/ui/components/button";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@workspace/ui/components/menu";
import { MonitorIcon } from "lucide-react";

import { useTranslation } from "@/platform/i18n";
import { isTheme, THEMES, useTheme } from "@/platform/theme";

import { THEME_LABEL_KEYS } from "../theme-labels";

export function ThemeMenu() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  return (
    <Menu>
      <MenuTrigger render={<Button variant="ghost" size="icon" aria-label={t("common__theme")} />}>
        <MonitorIcon />
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuRadioGroup
          value={theme}
          onValueChange={(value) => {
            if (isTheme(value)) setTheme(value);
          }}
        >
          {THEMES.map((option) => (
            <MenuRadioItem key={option} value={option}>
              {t(THEME_LABEL_KEYS[option])}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}
