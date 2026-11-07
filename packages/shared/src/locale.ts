import { z } from "zod";

export const SUPPORTED_LOCALES = ["en", "de"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
export const localeSchema = z.enum(SUPPORTED_LOCALES);

/** Name of the cookie that remembers the visitor's language on this device. */
export const LOCALE_COOKIE = "locale";

export function isLocale(value: unknown): value is Locale {
  return localeSchema.safeParse(value).success;
}

/**
 * The best supported locale in an `Accept-Language` header, honouring q-values.
 * Region subtags are ignored (`de-AT` selects `de`).
 */
export function parseAcceptLanguage(header: string | null | undefined): Locale | undefined {
  if (!header) return undefined;
  const ranked = header
    .slice(0, 512)
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find(Boolean);
      const weight = q === undefined ? 1 : Number(q);
      return { language: tag.trim().toLowerCase().split("-")[0] ?? "", weight, index };
    })
    .filter((entry) => entry.language && Number.isFinite(entry.weight) && entry.weight > 0)
    .toSorted((a, b) => b.weight - a.weight || a.index - b.index);
  return ranked.map((entry) => entry.language).find(isLocale);
}

export type LocaleSources = {
  /** The signed-in user's saved preference. */
  saved?: string | null;
  /** The locale cookie of this device. */
  cookie?: string | null;
  /** The `Accept-Language` header (the device locale on native). */
  acceptLanguage?: string | null;
};

/** Saved preference, then cookie, then `Accept-Language`, then the default. */
export function resolveLocale(sources: LocaleSources): Locale {
  if (isLocale(sources.saved)) return sources.saved;
  if (isLocale(sources.cookie)) return sources.cookie;
  return parseAcceptLanguage(sources.acceptLanguage) ?? DEFAULT_LOCALE;
}

/** The value of one cookie in a `Cookie` header. */
export function readCookie(header: string | null | undefined, name: string): string | undefined {
  for (const pair of (header ?? "").split(";")) {
    const index = pair.indexOf("=");
    if (index > 0 && pair.slice(0, index).trim() === name) return pair.slice(index + 1).trim();
  }
  return undefined;
}
