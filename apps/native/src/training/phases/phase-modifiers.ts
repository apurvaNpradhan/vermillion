import type { PhaseModifiers } from "@workspace/shared";

/** What the stepper of each modifier moves by and how far it goes. */
export const MODIFIER_LIMITS = {
  sets: { step: 0.25, min: 0.25, max: 1.5 },
  rpe: { step: 0.5, min: -3, max: 3 },
  load: { step: 0.05, min: 0.5, max: 1 },
} as const satisfies Record<keyof PhaseModifiers, { step: number; min: number; max: number }>;

const round = (value: number) => Math.round(value * 100) / 100;

/** `modifiers` with one field stepped, held to its limits and to two decimals. */
export function stepModifier(
  modifiers: PhaseModifiers,
  key: keyof PhaseModifiers,
  direction: 1 | -1,
): PhaseModifiers {
  const limit = MODIFIER_LIMITS[key];
  const next = round(
    Math.min(limit.max, Math.max(limit.min, modifiers[key] + direction * limit.step)),
  );
  return { ...modifiers, [key]: next };
}

/** Whether a field can step in `direction` without passing its limit. */
export function canStepModifier(
  modifiers: PhaseModifiers,
  key: keyof PhaseModifiers,
  direction: 1 | -1,
): boolean {
  const limit = MODIFIER_LIMITS[key];
  return direction === 1 ? modifiers[key] < limit.max - 1e-6 : modifiers[key] > limit.min + 1e-6;
}
