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

/** Where the ramp starts, so the weakest tint still reads against the grey body. */
const RAMP_FLOOR = 0.3;

/**
 * A colour per group for a heat map: `from` (a quiet surface) toward `to` (the accent) as the
 * intensity (0 to 1) grows, starting above `from` so a muscle with any sets is always visible.
 */
export function intensityTints(
  intensity: Partial<Record<BodyGroup, number>>,
  from: string,
  to: string,
): Partial<Record<BodyGroup, string>> {
  const tints: Partial<Record<BodyGroup, string>> = {};
  for (const group of BODY_GROUPS) {
    const value = intensity[group];
    if (value === undefined || value <= 0) continue;
    tints[group] = mixHex(from, to, RAMP_FLOOR + (1 - RAMP_FLOOR) * Math.min(1, value));
  }
  return tints;
}
