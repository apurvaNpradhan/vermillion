import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { readCookie } from "@workspace/shared";

import { isTheme, THEME_COOKIE, type Theme } from "./theme";

const readCookieValue = createIsomorphicFn()
  .server(() => readCookie(getRequest().headers.get("cookie"), THEME_COOKIE))
  .client(() => readCookie(document.cookie, THEME_COOKIE));

/** The theme stored on this device; "system" when nothing is stored. */
export function readStoredTheme(): Theme {
  const value = readCookieValue();
  return isTheme(value) ? value : "system";
}
