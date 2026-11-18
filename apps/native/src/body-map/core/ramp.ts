import { BODY_GROUPS, type BodyGroup } from "./groups";

const HEX = /^#([0-9a-f]{6})$/i;

function channels(hex: string): [number, number, number] | null {
  const match = HEX.exec(hex);
  const digits = match?.[1];
  if (digits === undefined) return null;
  const value = Number.parseInt(digits, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** `from` mixed toward `to` by `amount` (0 to 1), as `#RRGGBB`. A value that is not a hex colour returns `to`. */
export function mixHex(from: string, to: string, amount: number): string {
  const a = channels(from);
  const b = channels(to);
  if (a === null || b === null) return to;
  const t = Math.min(1, Math.max(0, amount));
  const mixed = a.map((channel, index) => Math.round(channel + ((b[index] ?? 0) - channel) * t));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** The least contrast (WCAG ratio) a trained region has against the silhouette: a graphic. */
export const MIN_RAMP_CONTRAST = 3;

function luminance(hex: string): number {
  const rgb = channels(hex);
  if (rgb === null) return 0;
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** WCAG contrast ratio of two `#RRGGBB` colours; 1 for one that is not a hex colour. */
export function contrastBetween(a: string, b: string): number {
  if (channels(a) === null || channels(b) === null) return 1;
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

const FLOOR_STEPS = 40;

/**
 * Where the ramp starts, as the share of the way from `from` to `to`: the first step at which the
 * colour has {@link MIN_RAMP_CONTRAST} against `from`, so the weakest tint still reads against the
 * silhouette in every theme. 1 when even `to` falls short (then the ramp is one colour).
 */
export function rampFloor(from: string, to: string): number {
  for (let step = 0; step <= FLOOR_STEPS; step += 1) {
    const amount = step / FLOOR_STEPS;
    if (contrastBetween(mixHex(from, to, amount), from) >= MIN_RAMP_CONTRAST) return amount;
  }
  return 1;
}

/**
 * A colour per group for a heat map: from a visible tint of `to` (the accent, at least
 * {@link MIN_RAMP_CONTRAST} against `from`, the silhouette) up to `to` as the intensity (0 to 1)
 * grows. A muscle with any sets is always visible; one with none is left out.
 */
export function intensityTints(
  intensity: Partial<Record<BodyGroup, number>>,
  from: string,
  to: string,
): Partial<Record<BodyGroup, string>> {
  const floor = rampFloor(from, to);
  const tints: Partial<Record<BodyGroup, string>> = {};
  for (const group of BODY_GROUPS) {
    const value = intensity[group];
    if (value === undefined || value <= 0) continue;
    tints[group] = mixHex(from, to, floor + (1 - floor) * Math.min(1, value));
  }
  return tints;
}
