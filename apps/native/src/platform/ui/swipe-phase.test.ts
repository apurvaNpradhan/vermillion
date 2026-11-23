import { describe, expect, it } from "vitest";

import { swipePhase, swipePresentation } from "./swipe-phase";

describe("swipePhase", () => {
  it("mounts on drag and settles open", () => {
    expect(swipePhase("idle", "drag")).toBe("dragging");
    expect(swipePhase("dragging", "open")).toBe("open");
  });

  it("keeps an open row open while it is dragged", () => {
    expect(swipePhase("open", "drag")).toBe("open");
  });

  it("unmounts only after the close animation finishes", () => {
    expect(swipePhase("open", "close")).toBe("closing");
    expect(swipePhase("closing", "rest")).toBe("idle");
  });

  it("ignores a stale finish after the row was grabbed again", () => {
    expect(swipePhase("dragging", "rest")).toBe("dragging");
    expect(swipePhase("open", "rest")).toBe("open");
    expect(swipePhase("idle", "rest")).toBe("idle");
  });

  it("resets straight to idle without animation", () => {
    expect(swipePhase("dragging", "reset")).toBe("idle");
    expect(swipePhase("open", "reset")).toBe("idle");
  });

  it("switches back to dragging when a closing row is grabbed", () => {
    expect(swipePhase("closing", "drag")).toBe("dragging");
  });
});

describe("swipePresentation", () => {
  it("mounts the buttons when a touch begins and hides them if the pan never activates", () => {
    expect(swipePresentation("idle", true)).toBe("actions");
    expect(swipePresentation("idle", false)).toBe("hidden");
  });

  it("keeps the buttons mounted if a close completes during a new touch", () => {
    expect(swipePresentation("closing", true)).toBe("actions");
    expect(swipePresentation(swipePhase("closing", "rest"), true)).toBe("actions");
  });

  it("shows the tap-to-close cover only on an open row", () => {
    expect(swipePresentation("open", false)).toBe("open");
    expect(swipePresentation("dragging", true)).toBe("actions");
    expect(swipePresentation("closing", false)).toBe("actions");
  });
});
