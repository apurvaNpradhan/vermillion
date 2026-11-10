import { describe, expect, it } from "vitest";

import {
  cancelPick,
  clearPick,
  finishPick,
  getPickSession,
  hasOpenPickSession,
  openPickSession,
  selectCreated,
  togglePick,
} from "./pick-session";

describe("pick session", () => {
  it("leaves out ids that became unavailable, keeping the order", async () => {
    const { id, result } = openPickSession({});
    togglePick(id, "c");
    togglePick(id, "a");
    togglePick(id, "b");
    finishPick(id, new Set(["a"]));
    expect(await result).toEqual(["c", "b"]);
  });

  it("resolves the ordered ids when finished", async () => {
    const { id, result } = openPickSession({});
    togglePick(id, "b");
    togglePick(id, "a");
    finishPick(id);
    expect(await result).toEqual(["b", "a"]);
    expect(getPickSession(id)).toBeNull();
  });

  it("applies max and exclude", async () => {
    const { id, result } = openPickSession({ max: 1, exclude: ["x"] });
    togglePick(id, "a");
    togglePick(id, "x");
    togglePick(id, "b");
    expect(getPickSession(id)?.selected).toEqual(["b"]);
    finishPick(id);
    expect(await result).toEqual(["b"]);
  });

  it("clears the selection", () => {
    const { id } = openPickSession({});
    togglePick(id, "a");
    clearPick(id);
    expect(getPickSession(id)?.selected).toEqual([]);
    cancelPick(id);
  });

  it("selects a created exercise", async () => {
    const { id, result } = openPickSession({});
    togglePick(id, "a");
    selectCreated(id, "new");
    finishPick(id);
    expect(await result).toEqual(["a", "new"]);
  });

  it("resolves null when cancelled, and ignores later calls", async () => {
    const { id, result } = openPickSession({});
    togglePick(id, "a");
    cancelPick(id);
    expect(await result).toBeNull();
    togglePick(id, "b");
    finishPick(id);
    expect(getPickSession(id)).toBeNull();
  });

  it("keeps requests apart", () => {
    const first = openPickSession({});
    const second = openPickSession({});
    togglePick(first.id, "a");
    expect(getPickSession(second.id)?.selected).toEqual([]);
    cancelPick(first.id);
    cancelPick(second.id);
  });

  it("reports an open picker until it is answered", async () => {
    expect(hasOpenPickSession()).toBe(false);
    const { id, result } = openPickSession({});
    expect(hasOpenPickSession()).toBe(true);
    cancelPick(id);
    expect(await result).toBeNull();
    expect(hasOpenPickSession()).toBe(false);
  });
});
