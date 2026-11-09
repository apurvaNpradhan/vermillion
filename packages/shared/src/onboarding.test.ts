import { describe, expect, it } from "vitest";

import { onboardingSteps, pendingOnboardingSteps } from "./onboarding";

describe("pendingOnboardingSteps", () => {
  it("asks for the name when it is empty", () => {
    expect(pendingOnboardingSteps({ name: "" }).map((step) => step.id)).toEqual(["name"]);
  });

  it("treats a blank or missing name as not done", () => {
    expect(pendingOnboardingSteps({ name: "   " })).toHaveLength(1);
    expect(pendingOnboardingSteps({ name: null })).toHaveLength(1);
    expect(pendingOnboardingSteps({})).toHaveLength(1);
  });

  it("has nothing pending once the name is set", () => {
    expect(pendingOnboardingSteps({ name: " Ada " })).toEqual([]);
  });

  it("returns steps in registry order", () => {
    const order = onboardingSteps.map((step) => step.id);
    const pending = pendingOnboardingSteps({ name: "" }).map((step) => step.id);
    expect(pending).toEqual(order.filter((id) => pending.includes(id)));
  });
});
