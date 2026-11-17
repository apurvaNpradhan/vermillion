import { createWebI18n, type TranslationKey, type WebTranslationKey } from "@workspace/i18n";
import { useMemo } from "react";

/** English only for now; one instance serves the prerender and the browser alike. */
export const i18n = createWebI18n("en");

export type SiteKey = WebTranslationKey | TranslationKey;
type Values = Record<string, string | number>;

/** Translates a site key (or a shared one, such as an error) with typed keys. */
export function t(key: SiteKey, values?: Values): string {
  return i18n.t(key, values);
}

/** The translate function for components. */
export function useT() {
  return useMemo(() => t, []);
}
