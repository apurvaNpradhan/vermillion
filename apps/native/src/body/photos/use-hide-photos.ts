import { usePreferences } from "@/preferences";

/**
 * Whether progress photos are blurred in lists until tapped (`ui.hidePhotos`, on by default), and
 * the switch for it. Reading it never waits on the server: until preferences load it is on.
 */
export function useHidePhotos() {
  const { preferences, setUi, isSaving } = usePreferences();
  return {
    hidden: preferences.ui.hidePhotos,
    saving: isSaving,
    set: (hidePhotos: boolean) => setUi({ hidePhotos }),
  };
}
