import { describe, expect, it } from "vitest";

import { setupGate } from "./setup-gate";

describe("setupGate", () => {
  it("asks who owns the device before step 1 when another account holds it", () => {
    expect(setupGate("other-account")).toBe("owner-choice");
  });

  it("lets the steps run for any other lock or none", () => {
    expect(setupGate(null)).toBe("steps");
    expect(setupGate("signed-out")).toBe("steps");
  });
});
