import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

import type { SoundCue } from "./sound-rules";

/** The zen pack files (assets/sounds/CREDITS.md). Metro resolves each `require` to an asset id. */
const SOURCES = {
  tick: require("../../assets/sounds/cue_check.mp3"),
  refused: require("../../assets/sounds/cue_error.mp3"),
  restCountdown: require("../../assets/sounds/cue_progress_step.mp3"),
  // The same file as the notification's sound (Android needs the raw resource `rest_end`).
  restOver: require("../../assets/sounds/rest_end.wav"),
  countdownDone: require("../../assets/sounds/cue_complete.mp3"),
  record: require("../../assets/sounds/cue_achievement.mp3"),
  finished: require("../../assets/sounds/cue_success.mp3"),
} satisfies Record<SoundCue, number>;

let players: Promise<Map<SoundCue, AudioPlayer> | null> | null = null;

/** Failures never reach the user (the haptics still play) but show up while developing. */
function report(what: string, error: Error) {
  if (__DEV__) console.warn(`[sound-cues] ${what}`, error.message);
}

/**
 * Sets the audio mode, then creates one player per cue. Cues respect the silent switch (iOS) and
 * the ringer mode (Android), and mix with the user's music without pausing it. expo-audio's mode
 * is global to the app, so every cue mixes, including "rest over". A failure is logged in
 * development and retried on the next call.
 */
function load(): Promise<Map<SoundCue, AudioPlayer> | null> {
  players ??= (async () => {
    // The mode must be set before the players exist, or they take the default one.
    await setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: false,
      allowsRecording: false,
    });
    const entries = Object.entries(SOURCES).map(
      // SAFETY: Object.entries on the SOURCES literal yields its SoundCue keys as strings.
      ([cue, source]) => [cue as SoundCue, createAudioPlayer(source)] as const,
    );
    return new Map(entries);
  })().catch((error: Error) => {
    report("could not load", error);
    players = null;
    return null;
  });
  return players;
}

/** Loads the cues so the first one plays without delay. Safe to call again. */
export function preloadSoundCues(): void {
  void load();
}

/** Plays a cue from the start. Never throws. */
export function playSoundCue(cue: SoundCue): void {
  void (async () => {
    const loaded = await load();
    const player = loaded?.get(cue);
    if (!player) return;
    try {
      await player.seekTo(0);
      player.play();
    } catch (error) {
      report(`could not play ${cue}`, error instanceof Error ? error : new Error(String(error)));
    }
  })();
}
