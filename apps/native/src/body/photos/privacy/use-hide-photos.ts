import { useSyncExternalStore } from "react";
import { deviceStorage } from "@/platform/storage";
import { useTranslation } from "@/platform/i18n";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { usePreferences } from "@/preferences";

const KEY = "device.hidePhotos";
let override: boolean | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => {
  const saved = deviceStorage.get(KEY);
  return override ?? (saved === "true" ? true : saved === "false" ? false : null);
};

/** A device's explicit privacy choice survives failed account updates and restarts. */
export function useHidePhotos() {
  const { preferences, setUiAsync, isSaving, isLoading } = usePreferences();
  const local = useSyncExternalStore(subscribe, snapshot);
  const { t } = useTranslation();
  const { toast } = useAppToast();
  return {
    hidden: local === true || isLoading ? true : (local ?? preferences.ui.hidePhotos),
    saving: isSaving,
    set: (hidePhotos: boolean) => {
      override = hidePhotos;
      deviceStorage.set(KEY, String(hidePhotos));
      for (const listener of listeners) listener();
      void setUiAsync({ hidePhotos }).catch(() => {
        toast.show({ variant: "danger", label: t("body__photos_preference_failed") });
      });
    },
  };
}
