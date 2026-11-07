import type { Database } from "@workspace/db";
import { LOCALE_COOKIE, readCookie, resolveLocale, type Locale } from "@workspace/shared";
import { eq } from "drizzle-orm";

import { userPreferences } from "../tables";

/** The user's saved language, if they chose one. */
export async function getSavedLocale(db: Database, userId: string): Promise<Locale | null> {
  const [row] = await db
    .select({ locale: userPreferences.locale })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return row?.locale ?? null;
}

/**
 * Locale for a request: the saved preference, then the locale cookie, then
 * `Accept-Language` (the device locale on native), then English.
 */
export async function resolveRequestLocale(
  db: Database,
  headers: Headers,
  userId?: string,
): Promise<Locale> {
  return resolveLocale({
    saved: userId ? await getSavedLocale(db, userId) : null,
    cookie: readCookie(headers.get("cookie"), LOCALE_COOKIE),
    acceptLanguage: headers.get("accept-language"),
  });
}
