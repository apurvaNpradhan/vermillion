import { isLocale, type Locale } from "@workspace/shared";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { writeLocaleCookie } from "./request";

/** The active language and a setter that remembers it on this device. */
export function useLocale() {
  const { i18n } = useTranslation();
  const locale: Locale = isLocale(i18n.language) ? i18n.language : "en";
  const setDeviceLocale = useCallback(
    (next: Locale) => {
      writeLocaleCookie(next);
      void i18n.changeLanguage(next);
    },
    [i18n],
  );
  return { locale, setDeviceLocale };
}
