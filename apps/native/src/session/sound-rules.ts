import type { UiPreferences } from "@workspace/shared";

/** The cues the app plays (zen pack, see assets/sounds/CREDITS.md). Unticking is silent. */
export const SOUND_CUES = [
  "tick",
  "refused",
  "restCountdown",
  "restOver",
  "countdownDone",
  "record",
  "finished",
] as const;
export type SoundCue = (typeof SOUND_CUES)[number];

/** The sound switches of the preferences. */
export type SoundPreferences = Pick<
  UiPreferences,
  "sounds" | "soundRest" | "soundSets" | "soundMilestones"
>;

/** Which preference group a cue belongs to. */
const GROUP_OF = {
  tick: "soundSets",
  refused: "soundSets",
  restCountdown: "soundRest",
  restOver: "soundRest",
  countdownDone: "soundRest",
  record: "soundMilestones",
  finished: "soundMilestones",
} as const satisfies Record<SoundCue, "soundRest" | "soundSets" | "soundMilestones">;

/** Whether `cue` may play: the master switch and the cue's group are both on. */
export function cueEnabled(prefs: SoundPreferences, cue: SoundCue): boolean {
  return prefs.sounds && prefs[GROUP_OF[cue]];
}

/**
 * The cue for a tick that worked: a new record beats a finished countdown, which beats the plain
 * tick. A cue whose group is off falls through to the next, so turning milestones off still leaves
 * the tick sound.
 */
export function tickCue(
  prefs: SoundPreferences,
  tick: { record: boolean; countdown: boolean },
): SoundCue | null {
  const order: SoundCue[] = [
    ...(tick.record ? (["record"] as const) : []),
    ...(tick.countdown ? (["countdownDone"] as const) : []),
    "tick",
  ];
  return order.find((cue) => cueEnabled(prefs, cue)) ?? null;
}

/**
 * Whole seconds left that get a "3-2-1" beep, or null. `remaining` is the rest's seconds left
 * (rounded up, as the bar shows it); the beep is for 3, 2 and 1 only.
 */
export function countdownBeepSecond(remaining: number): 1 | 2 | 3 | null {
  return remaining === 1 || remaining === 2 || remaining === 3 ? remaining : null;
}
