import i18next, { type i18n, type TFunction } from "i18next";

import en from "./locales/en.json" with { type: "json" };

export const resources = { en: { translation: en } };

/** Every translation key. Keys are `feature__identifier`; plurals add `_one`/`_other`. */
export type TranslationKey = keyof typeof en;

/** A fresh i18next instance (one per request on a server, one per app on a client). */
export function createI18n(locale: string = "en"): i18n {
  const created = i18next.createInstance();
  void created.init({
    resources,
    lng: locale,
    fallbackLng: "en",
    supportedLngs: Object.keys(resources),
    interpolation: { escapeValue: false },
    returnNull: false,
    initAsync: false,
  });
  return created;
}

const instance = createI18n();

/** A translate function fixed to one language; unknown languages fall back to English. */
export function getT(locale: string): TFunction {
  return instance.getFixedT(locale);
}

export type { TFunction };
