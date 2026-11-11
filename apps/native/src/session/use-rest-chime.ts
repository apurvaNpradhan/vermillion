import { useEffect } from "react";

import { usePreferences } from "@/preferences";

import { playRestChime, preloadRestChime } from "./rest-chime";

/** Plays the Rest-end chime when the "Rest timer sound" setting is on; preloads it meanwhile. */
export function useRestChime(): () => void {
  const soundOn = usePreferences().preferences.ui.restSound;
  useEffect(() => {
    if (soundOn) preloadRestChime();
  }, [soundOn]);
  return () => {
    if (soundOn) playRestChime();
  };
}
