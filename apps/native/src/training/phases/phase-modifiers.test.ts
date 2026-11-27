import { PHASE_PRESETS, phaseModifiersSchema, type PhaseModifiers } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { canStepModifier, stepModifier } from "./phase-modifiers";

describe("stepModifier", () => {
  it.each<[keyof PhaseModifiers, 1 | -1, PhaseModifiers, number]>([
    ["sets", -1, PHASE_PRESETS.deload, 0.25],
    ["sets", 1, PHASE_PRESETS.deload, 0.75],
    ["rpe", -1, PHASE_PRESETS.deload, -2.5],
    ["rpe", 1, PHASE_PRESETS.push, 1.5],
    ["load", -1, PHASE_PRESETS.deload, 0.85],
    ["load", 1, PHASE_PRESETS.deload, 0.95],
  ])("%s %i from %j gives %d", (key, direction, from, expected) => {
    expect(stepModifier(from, key, direction)[key]).toBeCloseTo(expected, 5);
  });

  it("stays within the limits the plan accepts", () => {
    let modifiers: PhaseModifiers = { ...PHASE_PRESETS.build };
    for (const key of ["sets", "rpe", "load"] as const)
      for (const direction of [1, -1] as const)
        for (let step = 0; step < 40; step += 1) {
          modifiers = stepModifier(modifiers, key, direction);
          expect(phaseModifiersSchema.safeParse(modifiers).success).toBe(true);
        }
  });

  it("says when a field has reached its end", () => {
    expect(canStepModifier({ sets: 0.25, rpe: 0, load: 1 }, "sets", -1)).toBe(false);
    expect(canStepModifier({ sets: 0.25, rpe: 0, load: 1 }, "sets", 1)).toBe(true);
    expect(canStepModifier({ sets: 1, rpe: 0, load: 1 }, "load", 1)).toBe(false);
    expect(canStepModifier({ sets: 1, rpe: 3, load: 1 }, "rpe", 1)).toBe(false);
  });
});
