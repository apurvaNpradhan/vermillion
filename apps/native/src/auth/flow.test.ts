import { describe, expect, it } from "vitest";

import { FLOW_STEPS, nextAfterCode, parseFlowKind, stepPosition } from "./flow";

describe("flows", () => {
  it("lists four steps to get started and two to sign in", () => {
    expect(FLOW_STEPS["get-started"]).toEqual(["email", "code", "passkey", "name"]);
    expect(FLOW_STEPS["sign-in"]).toEqual(["email", "code"]);
  });

  it("places a step in its flow", () => {
    expect(stepPosition("get-started", "email")).toEqual({ index: 0, total: 4 });
    expect(stepPosition("get-started", "name")).toEqual({ index: 3, total: 4 });
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
});
