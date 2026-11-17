import i18next, { type i18n, type TFunction } from "i18next";

import en from "./locales/en.json" with { type: "json" };
import webEn from "./locales/web/en.json" with { type: "json" };

export const resources = { en: { translation: en } };

/** The site's strings (`apps/web`) in their own namespace, plus the shared ones (errors, auth). */
export const webResources = { en: { web: webEn, translation: en } };

/** Every key of the site's namespace. */
export type WebTranslationKey = keyof typeof webEn;

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

/** The site's instance: `web` first, the shared namespace for error and auth copy. */
export function createWebI18n(locale: string = "en"): i18n {
  const created = i18next.createInstance();
  void created.init({
    resources: webResources,
    lng: locale,
    fallbackLng: "en",
    ns: ["web", "translation"],
    defaultNS: "web",
    fallbackNS: "translation",
    supportedLngs: Object.keys(webResources),
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
