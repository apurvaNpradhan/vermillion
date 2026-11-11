import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";

let player: AudioPlayer | null = null;

/**
 * Loads the Rest-end chime so it plays without delay. The audio mode respects the phone's silent
 * switch (iOS) and ringer mode (Android) and mixes with music instead of pausing it. Safe to call
 * again; failures leave the haptic as the only cue.
 */
export function preloadRestChime(): void {
  if (player !== null) return;
  try {
    void setAudioModeAsync({
      playsInSilentMode: false,
      interruptionMode: "mixWithOthers",
      shouldPlayInBackground: false,
      allowsRecording: false,
    }).catch(() => undefined);
    player = createAudioPlayer(require("../../assets/sounds/rest_end.wav"));
  } catch {
    player = null;
  }
}

/** Plays the chime from the start. */
export function playRestChime(): void {
  preloadRestChime();
  try {
    void player?.seekTo(0).then(() => player?.play());
  } catch {
    // The haptic still plays.
  }
}
