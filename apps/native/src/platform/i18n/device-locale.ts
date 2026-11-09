import { getLocales } from "expo-localization";
import { resolveLocale, type Locale } from "@workspace/shared";

import { deviceStorage } from "../storage";

const LOCALE_KEY = "device.locale";

/** The language chosen on this device (the native counterpart of the API's locale cookie). */
export function readDeviceLocaleChoice(): string | null {
  return deviceStorage.get(LOCALE_KEY);
}

export function writeDeviceLocaleChoice(locale: Locale | null) {
  deviceStorage.set(LOCALE_KEY, locale);
}

/** Resolve without rereading the saved choice: deletion from SecureStore is asynchronous. */
export function resolvePhoneLocale(): Locale {
  return resolveLocale({
    acceptLanguage: getLocales()
      .map((locale) => locale.languageTag)
      .join(","),
  });
}

/** Saved account preference, then this device's choice, then the phone's language, then English. */
export function resolveDeviceLocale(saved?: string | null): Locale {
  return resolveLocale({
    saved,
    cookie: readDeviceLocaleChoice(),
    acceptLanguage: getLocales()
      .map((locale) => locale.languageTag)
      .join(","),
  });
}
