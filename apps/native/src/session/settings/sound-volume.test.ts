import { describe, expect, it } from "vitest";

import { CUE_VOLUME_STEPS, cueGain } from "./sound-volume";

describe("cue volume", () => {
  it("maps percent to a player gain and clamps", () => {
    expect(cueGain(100)).toBe(1);
    expect(cueGain(50)).toBe(0.5);
    expect(cueGain(0)).toBe(0);
    expect(cueGain(-5)).toBe(0);
    expect(cueGain(250)).toBe(1);
    expect(cueGain(Number.NaN)).toBe(1);
  });
  it("offers steps from silent to full", () => {
    expect(CUE_VOLUME_STEPS[0]).toBe(0);
    expect(CUE_VOLUME_STEPS.at(-1)).toBe(100);
  });
});
