import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { LOCALE_COOKIE, readCookie, resolveLocale, type Locale } from "@workspace/shared";

const ONE_YEAR = 60 * 60 * 24 * 365;

/** The language signals of the current request (server) or device (browser). */
const readHints = createIsomorphicFn()
  .server(() => {
    const headers = getRequest().headers;
    return {
      cookie: readCookie(headers.get("cookie"), LOCALE_COOKIE),
      acceptLanguage: headers.get("accept-language"),
    };
  })
  .client(() => ({
    cookie: readCookie(document.cookie, LOCALE_COOKIE),
    acceptLanguage: navigator.languages.join(","),
  }));

/** Locale for a visitor or device: cookie, then Accept-Language, then English. */
export function resolveDeviceLocale(saved?: string | null): Locale {
  return resolveLocale({ saved, ...readHints() });
}

/** Remembers the language on this device so every page (also before sign-up) uses it. */
export function writeLocaleCookie(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax`;
}
