import { describe, expect, it } from "vitest";

import {
  FLOW_STEPS,
  firstOnboardingStep,
  nextOnboardingStep,
  parseFlowKind,
  parseOnboardingStep,
  stepPosition,
} from "./flow";

describe("flows", () => {
  it("lists nine steps to get started and two to sign in", () => {
    expect(FLOW_STEPS["get-started"]).toEqual([
      "email",
      "code",
      "name",
      "units",
      "body",
      "experience",
      "days",
      "place",
      "reminders",
    ]);
    expect(FLOW_STEPS["sign-in"]).toEqual(["email", "code"]);
  });

  it("places a step in its flow", () => {
    expect(stepPosition("get-started", "email")).toEqual({ index: 0, total: 9 });
    expect(stepPosition("get-started", "name")).toEqual({ index: 2, total: 9 });
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

  it("draws the new steps after the name, with dashes for the whole flow", () => {
    expect(stepPosition("get-started", "units")).toEqual({ index: 3, total: 9 });
    expect(stepPosition("get-started", "reminders")).toEqual({ index: 8, total: 9 });
  });

  it("walks the onboarding screens in order and then finishes", () => {
    expect(nextOnboardingStep("name")).toBe("units");
    expect(nextOnboardingStep("units")).toBe("body");
    expect(nextOnboardingStep("body")).toBe("experience");
    expect(nextOnboardingStep("experience")).toBe("days");
    expect(nextOnboardingStep("days")).toBe("place");
    expect(nextOnboardingStep("place")).toBe("reminders");
    expect(nextOnboardingStep("reminders")).toBeNull();
  });

  it("resumes at the units when the name is already saved", () => {
    expect(firstOnboardingStep({ hasName: true })).toBe("units");
    expect(firstOnboardingStep({ hasName: false })).toBe("name");
  });

  it("puts the three new questions after the body and keeps the reminders last", () => {
    expect(stepPosition("get-started", "body").index).toBe(4);
    expect(stepPosition("get-started", "experience").index).toBe(5);
    expect(stepPosition("get-started", "days").index).toBe(6);
    expect(stepPosition("get-started", "place").index).toBe(7);
  });

  it("resumes at the step that was reached, never before the units", () => {
    expect(firstOnboardingStep({ hasName: true, resumeAt: "days" })).toBe("days");
    expect(firstOnboardingStep({ hasName: true, resumeAt: "reminders" })).toBe("reminders");
    expect(firstOnboardingStep({ hasName: true, resumeAt: "name" })).toBe("units");
    expect(firstOnboardingStep({ hasName: true, resumeAt: null })).toBe("units");
    expect(firstOnboardingStep({ hasName: false, resumeAt: "place" })).toBe("name");
  });

  it("reads a stored step name and ignores one it does not know", () => {
    expect(parseOnboardingStep("place")).toBe("place");
    expect(parseOnboardingStep("goal")).toBeNull();
    expect(parseOnboardingStep(null)).toBeNull();
  });
});
