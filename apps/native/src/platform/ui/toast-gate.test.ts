import { describe, expect, it } from "vitest";

import { ACTION_TOAST_MS, createToastGate, toastDuration } from "./toast-gate";

describe("createToastGate", () => {
  it("shows the first toast with nothing to replace", () => {
    expect(createToastGate().decide("Saved", false)).toEqual({ action: "show", replace: null });
  });

  it("skips an identical message that is still showing", () => {
    const gate = createToastGate();
    gate.shown("a", "Saved");
    expect(gate.decide("Saved", false)).toEqual({ action: "skip" });
  });

  it("replaces a different message so only one shows", () => {
    const gate = createToastGate();
    gate.shown("a", "Saved");
    expect(gate.decide("Deleted", false)).toEqual({ action: "show", replace: "a" });
  });

  it("lets an action toast replace an identical one", () => {
    const gate = createToastGate();
    gate.shown("a", "Deleted Push");
    expect(gate.decide("Deleted Push", true)).toEqual({ action: "show", replace: "a" });
  });

  it("shows the same message again once it has gone", () => {
    const gate = createToastGate();
    gate.shown("a", "Saved");
    gate.hidden("a");
    expect(gate.decide("Saved", false)).toEqual({ action: "show", replace: null });
  });

  it("ignores the hide of a toast that was already replaced", () => {
    const gate = createToastGate();
    gate.shown("a", "One");
    gate.shown("b", "Two");
    gate.hidden("a");
    expect(gate.decide("Two", false)).toEqual({ action: "skip" });
  });
});

describe("toastDuration", () => {
  it("keeps a toast with an action (Undo) up long enough to press it", () => {
    expect(toastDuration({ actionLabel: "Undo" })).toBe(ACTION_TOAST_MS);
    expect(ACTION_TOAST_MS).toBeGreaterThanOrEqual(5000);
  });

  it("leaves an explicit duration and a plain toast to the toaster", () => {
    expect(toastDuration({ actionLabel: "Undo", duration: 8000 })).toBe(8000);
    expect(toastDuration({ actionLabel: "Undo", duration: 2500 })).toBe(ACTION_TOAST_MS);
    expect(toastDuration({ actionLabel: "Undo", duration: "persistent" })).toBe("persistent");
    expect(toastDuration({})).toBeUndefined();
  });
});
