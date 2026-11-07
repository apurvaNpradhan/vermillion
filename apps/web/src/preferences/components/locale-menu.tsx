import { SUPPORTED_LOCALES, isLocale } from "@workspace/shared";
import { Button } from "@workspace/ui/components/button";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@workspace/ui/components/menu";
import { LanguagesIcon } from "lucide-react";

import { useTranslation } from "@/platform/i18n";

import { useLocaleSwitcher } from "../use-locale-switcher";

/** Language names are always shown in their own language. */
export const LOCALE_NAMES = { en: "English", de: "Deutsch" } as const;

export function LocaleMenu() {
  const { t } = useTranslation();
  const { locale, setLocale } = useLocaleSwitcher();
  return (
    <Menu>
      <MenuTrigger
        render={<Button variant="ghost" size="icon" aria-label={t("common__language")} />}
      >
        <LanguagesIcon />
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuRadioGroup
          value={locale}
          onValueChange={(value) => {
            if (isLocale(value)) setLocale(value);
          }}
        >
          {SUPPORTED_LOCALES.map((code) => (
            <MenuRadioItem key={code} value={code}>
              {LOCALE_NAMES[code]}
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}
