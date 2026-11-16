import type { UiPreferences } from "@workspace/shared";

/**
 * The Rest-end chime (uisfx "zen" notification, MIT: see assets/sounds/CREDITS.md). Android
 * resolves a raw resource by this name, without the extension; iOS looks the file up in the
 * bundle with it. Both are registered by the expo-notifications plugin in app.config.ts.
 */
export const REST_SOUND_FILE = "rest_end.wav";

/**
 * The Android channel of the Rest notification. A channel's sound is fixed once it exists, so the
 * sound-on and sound-off variants are separate channels. `rest-timer` (the earlier silent channel)
 * and `rest-timer-sound` (which may have been created before the raw resource existed, so it could
 * be stuck on the default sound) are retired.
 */
export const REST_CHANNEL_WITH_SOUND = "rest-timer-sound-v2";
export const REST_CHANNEL_SILENT = "rest-timer-silent";
export const RETIRED_REST_CHANNELS: readonly string[] = ["rest-timer", "rest-timer-sound"];

/** Whether the Rest notification carries the chime: the master switch and the Rest group are on. */
export function restSoundOn(prefs: Pick<UiPreferences, "sounds" | "soundRest">): boolean {
  return prefs.sounds && prefs.soundRest;
}

export function restChannelId(soundOn: boolean): string {
  return soundOn ? REST_CHANNEL_WITH_SOUND : REST_CHANNEL_SILENT;
}

/** The `sound` of a scheduled Rest notification: the chime's file (iOS), or none. */
export function restNotificationSound(soundOn: boolean): string | false {
  return soundOn ? REST_SOUND_FILE : false;
}

/** Whether a Rest notification that arrives with the app open should chime itself. */
export function shouldChimeInForeground(input: {
  soundOn: boolean;
  surfaceVisible: boolean;
}): boolean {
  // The logging screen plays the chime itself, so the notification stays quiet there.
  return input.soundOn && !input.surfaceVisible;
}
