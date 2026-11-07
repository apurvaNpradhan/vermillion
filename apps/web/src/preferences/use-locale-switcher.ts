import type { Locale } from "@workspace/shared";
import { useSession } from "@/auth";
import { useLocale } from "@/platform/i18n";

import { useUpdatePreferences } from "./use-preferences";

/**
 * Switches the language. Visitors get it remembered on this device; signed-in
 * users also get it saved to their account so it follows them. The save goes
 * through the shared preferences mutation so the cached account preferences
 * change with it; otherwise the app guard would later restore the old language.
 */
export function useLocaleSwitcher() {
  const { session } = useSession();
  const { locale, setDeviceLocale } = useLocale();
  const save = useUpdatePreferences();
  return {
    locale,
    setLocale: (next: Locale) => {
      setDeviceLocale(next);
      if (session) save.mutate({ locale: next });
    },
  };
}
