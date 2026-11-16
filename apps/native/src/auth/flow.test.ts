import { describe, expect, it } from "vitest";

import {
  FLOW_STEPS,
  firstOnboardingStep,
  nextAfterCode,
  nextOnboardingStep,
  parseFlowKind,
  stepPosition,
} from "./flow";

describe("flows", () => {
  it("lists seven steps to get started and two to sign in", () => {
    expect(FLOW_STEPS["get-started"]).toEqual([
      "email",
      "code",
      "passkey",
      "name",
      "units",
      "body",
      "reminders",
    ]);
    expect(FLOW_STEPS["sign-in"]).toEqual(["email", "code"]);
  });

  it("places a step in its flow", () => {
    expect(stepPosition("get-started", "email")).toEqual({ index: 0, total: 7 });
    expect(stepPosition("get-started", "name")).toEqual({ index: 3, total: 7 });
    expect(stepPosition("sign-in", "code")).toEqual({ index: 1, total: 2 });
  });

  it("falls back to the first step for a step the flow lacks", () => {
    expect(stepPosition("sign-in", "name")).toEqual({ index: 0, total: 2 });
  });

  it("reads the flow from a route param", () => {
    expect(parseFlowKind("sign-in")).toBe("sign-in");
    expect(parseFlowKind("get-started")).toBe("get-started");
    expect(parseFlowKind(undefined)).toBe("get-started");
    expect(parseFlowKind("nonsense")).toBe("get-started");
  });

  it("offers a passkey after the code when the device can make one", () => {
    expect(nextAfterCode(true)).toBe("passkey");
  });

  it("asks for the name once the code is accepted when no passkey is offered", () => {
    expect(nextAfterCode(false)).toBe("name");
  });

  it("draws the new steps after the name, with dashes for the whole flow", () => {
    expect(stepPosition("get-started", "units")).toEqual({ index: 4, total: 7 });
    expect(stepPosition("get-started", "reminders")).toEqual({ index: 6, total: 7 });
  });

  it("walks the onboarding screens in order and then finishes", () => {
    expect(nextOnboardingStep("passkey")).toBe("name");
    expect(nextOnboardingStep("name")).toBe("units");
    expect(nextOnboardingStep("units")).toBe("body");
    expect(nextOnboardingStep("body")).toBe("reminders");
    expect(nextOnboardingStep("reminders")).toBeNull();
  });

  it("resumes at the units when the name is already saved", () => {
    expect(firstOnboardingStep({ hasName: true, offerPasskey: true })).toBe("units");
    expect(firstOnboardingStep({ hasName: false, offerPasskey: true })).toBe("passkey");
    expect(firstOnboardingStep({ hasName: false, offerPasskey: false })).toBe("name");
  });
});
