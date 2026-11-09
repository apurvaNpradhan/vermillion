import { describe, expect, it } from "vitest";

import { instructionSteps } from "./instruction-steps";

describe("instruction steps", () => {
  it("splits lines and drops the source's numbers", () => {
    expect(instructionSteps("1. Grab the bar.\n2. Stand tall.\n3) Lower it.\n")).toEqual([
      "Grab the bar.",
      "Stand tall.",
      "Lower it.",
    ]);
  });

  it("keeps unnumbered lines and numbers that belong to the sentence", () => {
    expect(instructionSteps("Warm up\n\n  3 sets of 10 reps  \r\n12 reps")).toEqual([
      "Warm up",
      "3 sets of 10 reps",
      "12 reps",
    ]);
  });

  it("gives nothing for no instructions", () => {
    expect(instructionSteps(null)).toEqual([]);
    expect(instructionSteps("")).toEqual([]);
    expect(instructionSteps(" \n \n")).toEqual([]);
  });
});
