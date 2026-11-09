import type { MuscleGroup } from "@workspace/shared";

import { BODY_GROUPS, isBodyGroup, type BodyGroup } from "./groups";

/** Opacity of a secondary group next to a primary one (which is drawn at 1). */
export const SECONDARY_ALPHA = 0.45;

/** Clamps an intensity to 0..1; a value that is not a number counts as 0. */
export function clampIntensity(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/**
 * The opacity each group is drawn at. Secondary groups get a lighter tint, primary groups the
 * full one, an `intensity` entry (0..1, clamped) replaces both and is what a heat map passes, and
 * a `selected` group is drawn in full. Groups with no drawing are ignored; a group at 0 is
 * not drawn.
 */
export function groupAlphas({
  primary = [],
  secondary = [],
  intensity = {},
  selected = [],
}: {
  primary?: readonly MuscleGroup[];
  secondary?: readonly MuscleGroup[];
  intensity?: Partial<Record<BodyGroup, number>>;
  selected?: readonly MuscleGroup[];
}): Map<BodyGroup, number> {
  const alphas = new Map<BodyGroup, number>();
  for (const group of secondary) if (isBodyGroup(group)) alphas.set(group, SECONDARY_ALPHA);
  for (const group of primary) if (isBodyGroup(group)) alphas.set(group, 1);
  for (const group of BODY_GROUPS) {
    const value = intensity[group];
    if (value !== undefined) alphas.set(group, clampIntensity(value));
  }
  for (const group of selected) if (isBodyGroup(group)) alphas.set(group, 1);
  for (const [group, alpha] of alphas) if (alpha <= 0) alphas.delete(group);
  return alphas;
}
