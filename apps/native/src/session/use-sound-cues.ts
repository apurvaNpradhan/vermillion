import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { usePreferences } from "@/preferences";

import { playSoundCue, preloadSoundCues } from "./sound-cues";
import { cueEnabled, tickCue, type SoundCue } from "./sound-rules";

export type SoundPlayer = {
  /** Plays a cue if the sound preferences allow it. */
  play: (cue: SoundCue) => void;
  /** Plays the cue for a tick that worked: record, finished countdown or the plain tick. */
  playTick: (tick: { record: boolean; countdown: boolean }) => void;
};

/**
 * Plays cues according to the sound preferences (master switch and the cue's group); the cues are
 * preloaded while the master switch is on. The functions never change identity, so they are safe
 * in memoized callbacks and effects; call them from events and effects, not during render.
 */
export function useSoundCues(): SoundPlayer {
  const { sounds, soundRest, soundSets, soundMilestones } = usePreferences().preferences.ui;
  const prefs = { sounds, soundRest, soundSets, soundMilestones };
  const latest = useRef(prefs);
  useLayoutEffect(() => {
    latest.current = prefs;
  });
  useEffect(() => {
    if (sounds) preloadSoundCues();
  }, [sounds]);
  const play = useCallback((cue: SoundCue) => {
    if (cueEnabled(latest.current, cue)) playSoundCue(cue);
  }, []);
  const playTick = useCallback((tick: { record: boolean; countdown: boolean }) => {
    const cue = tickCue(latest.current, tick);
    if (cue !== null) playSoundCue(cue);
  }, []);
  return { play, playTick };
}
