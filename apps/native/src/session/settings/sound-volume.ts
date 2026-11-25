/** The cue volumes the picker offers, in percent. */
export const CUE_VOLUME_STEPS = [0, 25, 50, 75, 100] as const;

/** A player volume (0 to 1) from the saved percentage; out-of-range values are clamped. */
export function cueGain(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.min(1, Math.max(0, volume / 100));
}
